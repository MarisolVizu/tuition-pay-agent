import { useEffect, useMemo, useState } from "react";
import { money } from "@/lib/currencies";
import type { AgentEvent, PolicyCheck, Quote } from "@/lib/types";
import ApprovalCard from "./ApprovalCard";
import { AgentBadge, Logo, isFlagged, type Session, type View } from "./shared";
import type { AgentMeta } from "@/lib/agent";
import type { ReportKind } from "./Report";

type Step = "choose" | "working" | "approve" | "blocked" | "answer" | "done";
type Outcome = { reply: string; events: AgentEvent[]; meta?: AgentMeta; quotes: Quote[]; recommendedId: string | null; checks: PolicyCheck[]; pendingId?: string; txId?: string; message?: string; proposed: boolean };

const STEPS: { key: Step[]; label: string }[] = [
  { key: ["choose"], label: "Choose a bill" },
  { key: ["working"], label: "Kuntur works on it" },
  { key: ["approve", "blocked", "answer"], label: "Review" },
  { key: ["done"], label: "Done" }
];

function parse(reply: string, events: AgentEvent[], meta?: AgentMeta): Outcome {
  const cmp = [...events].reverse().find((e) => e.tool === "compare_providers" && e.ok)?.data as { quotes: Quote[]; recommendedId: string | null } | undefined;
  const prop = [...events].reverse().find((e) => e.tool === "propose_payment")?.data as
    | { status: "denied"; message: string; checks: PolicyCheck[] }
    | { status: "awaiting_approval"; pending: { id: string; checks: PolicyCheck[] } }
    | { status: "executed"; transactionId: string }
    | undefined;
  const base = { reply, events, meta, quotes: cmp?.quotes ?? [], recommendedId: cmp?.recommendedId ?? null, checks: [] as PolicyCheck[], proposed: !!prop };
  if (!prop) return { ...base, message: reply };
  if (prop.status === "awaiting_approval") return { ...base, checks: prop.pending.checks, pendingId: prop.pending.id };
  if (prop.status === "executed") return { ...base, txId: prop.transactionId };
  return { ...base, checks: prop.checks, message: prop.message };
}

export function CostBars({ quotes, recommendedId, home }: { quotes: Quote[]; recommendedId: string | null; home: string }) {
  if (!quotes.length) return null;
  const max = Math.max(...quotes.map((q) => q.hiddenCost), 1);
  return (
    <div className="bars" role="table" aria-label="Provider comparison">
      {quotes.map((q) => {
        const excluded = !q.compliant || !q.allowedForPayee;
        const pick = q.providerId === recommendedId;
        return (
          <div key={q.providerId} className={`bar-row ${excluded ? "excluded" : ""} ${pick ? "pick" : ""}`} role="row">
            <div className="bar-name" role="cell">
              <b>{q.providerName}</b>
              <span className="sub">{q.eta}</span>
              {pick && <span className="pill ok">Kuntur’s pick</span>}
              {!q.compliant && <span className="pill bad">Not licensed</span>}
              {q.compliant && !q.allowedForPayee && <span className="pill">Not for this payee</span>}
            </div>
            <div className="bar-track" role="cell" aria-label={`Hidden cost ${money(home, q.hiddenCost)}`}>
              <span style={{ width: `${Math.max(4, (q.hiddenCost / max) * 100)}%` }} />
            </div>
            <div className="bar-nums" role="cell">
              <b>{money(home, q.total)}</b>
              <span className="sub">hidden {money(home, q.hiddenCost)}</span>
            </div>
          </div>
        );
      })}
      <p className="sub">The bar shows the hidden cost: the fee plus what the provider adds on top of the real exchange rate.</p>
    </div>
  );
}

export default function PayFlow(props: {
  session: Session;
  busy: boolean;
  preselect: string | null;
  clearPreselect: () => void;
  runAgent: (text: string) => Promise<{ reply: string; events: AgentEvent[]; meta?: AgentMeta } | null>;
  decide: (pendingId: string, approve: boolean) => Promise<{ ok: boolean; message: string; transaction?: { id: string } } | null>;
  goto: (v: View) => void;
  print: (k: ReportKind) => void;
}) {
  const { session, busy } = props;
  const s = session.state;
  const open = s.invoices.filter((i) => i.status === "open");
  const [step, setStep] = useState<Step>("choose");
  const [selected, setSelected] = useState<string | null>(open[0]?.id ?? null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const payee = (id?: string) => s.payees.find((p) => p.id === id);

  const ask = async (text: string) => {
    setNote(null);
    setStep("working");
    const r = await props.runAgent(text);
    if (!r) return setStep("choose");
    const o = parse(r.reply, r.events, r.meta);
    setOutcome(o);
    setStep(o.pendingId ? "approve" : o.txId ? "done" : o.proposed ? "blocked" : "answer");
  };
  const start = (invoiceId: string) => {
    setSelected(invoiceId);
    return ask(`Pay invoice ${invoiceId} the cheapest safe way`);
  };

  useEffect(() => {
    if (props.preselect) {
      const id = props.preselect;
      props.clearPreselect();
      start(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.preselect]);

  const pending = outcome?.pendingId ? s.pending.find((p) => p.id === outcome.pendingId) : undefined;
  const tx = outcome?.txId ? s.transactions.find((t) => t.id === outcome.txId) : undefined;
  const inv = s.invoices.find((i) => i.id === selected);

  const saving = useMemo(() => {
    if (!outcome || !tx) return null;
    const bank = outcome.quotes.find((q) => q.providerId === "andes_wire");
    return bank ? Math.max(0, bank.total - tx.debited) : null;
  }, [outcome, tx]);

  const onDecide = async (approve: boolean) => {
    if (!pending) return;
    const r = await props.decide(pending.id, approve);
    if (!r) return;
    if (!approve) {
      setNote("Payment cancelled. Nothing was paid.");
      setOutcome(null);
      setStep("choose");
      return;
    }
    if (r.ok && r.transaction) {
      setOutcome({ ...(outcome as Outcome), txId: r.transaction.id, pendingId: undefined });
      setStep("done");
    } else {
      setOutcome({ ...(outcome as Outcome), pendingId: undefined, message: r.message });
      setStep("blocked");
    }
  };

  const activeIdx = STEPS.findIndex((x) => x.key.includes(step));

  return (
    <div className="page">
      <div className="page-head">
        <h2>Pay a bill</h2>
        <p>Kuntur finds the cheapest licensed way to pay and checks the bill for fraud. You approve before any money moves.</p>
      </div>

      <ol className="stepper" aria-label="Progress">
        {STEPS.map((x, i) => (
          <li key={x.label} className={i < activeIdx ? "done" : i === activeIdx ? "active" : ""} aria-current={i === activeIdx ? "step" : undefined}>
            <span className="n">{i < activeIdx ? "✓" : i + 1}</span>
            {x.label}
          </li>
        ))}
      </ol>

      {note && <div className="banner info">{note}</div>}

      {step === "choose" && (
        <div className="stack">
          {s.pending.length > 0 && (
            <div className="banner warn">You already have a payment waiting. Review it below, or choose a new bill.</div>
          )}
          {s.pending.map((p) => (
            <ApprovalCard key={p.id} p={p} s={s} busy={busy} onDecide={async (a) => { await props.decide(p.id, a); }} />
          ))}
          {open.length === 0 ? (
            <div className="card empty-state">
              <h3>All bills are paid 🎉</h3>
              <p className="sub">Download your receipts or the full report from the Activity page.</p>
              <button className="btn brand" onClick={() => props.goto("activity")}>Go to Activity</button>
            </div>
          ) : (
            <>
              <div className="pick-list" role="radiogroup" aria-label="Bills">
                {open.map((i) => {
                  const p = payee(i.payeeId);
                  const flagged = isFlagged(i.rawText);
                  return (
                    <button key={i.id} role="radio" aria-checked={selected === i.id} className={`pick ${selected === i.id ? "on" : ""} ${flagged ? "flagged" : ""}`} onClick={() => setSelected(i.id)}>
                      <span className="radio" aria-hidden="true" />
                      <span className="pick-body">
                        <b>{i.description}</b>
                        <span className="sub">{p?.name} · due {i.dueDate}</span>
                        {flagged && <span className="warn-text">⚠ Contains hidden instructions aimed at the AI</span>}
                        {!p?.verified && <span className="warn-text">Payee not verified</span>}
                      </span>
                      <span className="pick-amt">{i.currency} {i.amount.toLocaleString("en-US")}</span>
                    </button>
                  );
                })}
              </div>
              <div className="page-actions">
                <button className="btn brand big" disabled={!selected || busy} onClick={() => selected && start(selected)}>
                  Find the best way to pay →
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {step === "working" && (
        <div className="card working">
          <div className="spinner" aria-hidden="true" />
          <div>
            <b>Kuntur’s AI agent is working on “{inv?.description}”</b>
            <ul className="sub">
              <li>Deciding which tools to use: read the bill, compare providers, propose the payment</li>
              <li>Comparing providers on total cost at today’s real rate</li>
              <li>The policy engine runs its safety checks on whatever the agent proposes</li>
            </ul>
          </div>
        </div>
      )}

      {(step === "approve" || step === "blocked" || step === "answer") && outcome && (
        <div className="stack">
          <div className="card agent-card">
            <div className="agent-head">
              <Logo size={34} />
              <div>
                <b>Kuntur’s recommendation</b>
                <AgentBadge meta={outcome.meta} />
              </div>
            </div>
            <p className="pre agent-reply">{outcome.reply}</p>
            {outcome.events.length > 0 && (
              <details className="steps" open>
                <summary>Tools the agent decided to use ({outcome.events.length})</summary>
                <ol>
                  {outcome.events.map((e, j) => (
                    <li key={j} className={e.ok ? "" : "bad"}><code>{e.tool}</code> {e.summary}</li>
                  ))}
                </ol>
              </details>
            )}
          </div>

          {outcome.quotes.length > 0 && (
            <div className="card">
              <h3 className="card-title">Cost comparison</h3>
              <CostBars quotes={outcome.quotes} recommendedId={outcome.recommendedId} home={s.home} />
            </div>
          )}

          {step === "answer" && (
            <div className="card">
              <h3 className="card-title">Kuntur didn’t prepare a payment</h3>
              <p className="sub">The agent answered without proposing a payment. You can ask it to submit the payment to the safety checks anyway, or ask something else.</p>
              <div className="page-actions">
                <button className="btn brand" disabled={busy} onClick={() => selected && ask(`Please propose the payment for invoice ${selected} with your recommended provider, so the policy engine can check it.`)}>Submit it to the safety checks</button>
                <button className="btn" onClick={() => { setOutcome(null); setStep("choose"); }}>Choose another bill</button>
                <button className="btn" onClick={() => props.goto("chat")}>Continue in chat</button>
              </div>
            </div>
          )}

          {step === "approve" && pending && <ApprovalCard p={pending} s={s} busy={busy} onDecide={onDecide} />}

          {step === "blocked" && (
            <div className="card blocked">
              <h3 className="card-title">🛡 Kuntur did not pay this bill</h3>
              {outcome.checks.filter((c) => !c.passed).length > 0 ? (
                <>
                  <p>The safety checks found problems, so the payment was stopped before any money moved:</p>
                  <ul className="checks">
                    {outcome.checks.filter((c) => !c.passed).map((c) => (
                      <li key={c.id}><span className="no">✕</span><span>{c.label}<br /><span className="sub">{c.detail}</span></span></li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="pre">{outcome.message}</p>
              )}
              {s.tier < 2 && <p className="sub">Your current permission level doesn’t allow payments. You can change it in Settings.</p>}
              <div className="page-actions">
                <button className="btn brand" onClick={() => { setOutcome(null); setStep("choose"); }}>Choose another bill</button>
                {s.tier < 2 && <button className="btn" onClick={() => props.goto("settings")}>Open Settings</button>}
                <button className="btn" onClick={() => props.goto("chat")}>Ask Kuntur about it</button>
              </div>
            </div>
          )}
        </div>
      )}

      {step === "done" && tx && (
        <div className="card success">
          <div className="check-big" aria-hidden="true">✓</div>
          <h3>Paid {tx.currency} {tx.amount.toLocaleString("en-US")} to {tx.payeeName}</h3>
          <p>
            {money(s.home, tx.debited)} debited via {tx.providerName}.{" "}
            {tx.approvedBy === "policy_auto" ? "Approved automatically because it was under your Auto limit." : "Approved by you."}
          </p>
          {saving !== null && saving > 0 && <p className="saving">You saved {money(s.home, saving)} compared with a traditional bank wire.</p>}
          <p className="sub">Reference {tx.reference}</p>
          <div className="page-actions center-row">
            <button className="btn brand" onClick={() => props.print({ type: "receipt", txId: tx.id })}>Download receipt (PDF)</button>
            <button className="btn" onClick={() => { setOutcome(null); setStep("choose"); setSelected(open[0]?.id ?? null); }}>Pay another bill</button>
            <button className="btn" onClick={() => props.goto("home")}>Back to Home</button>
          </div>
        </div>
      )}
    </div>
  );
}
