"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentEvent, AuditEntry, ChatMessage, PendingAction, SandboxState, Tier } from "@/lib/types";

type Session = { state: SandboxState; sig: string; chain: { valid: boolean; brokenAt?: number }; mode: "llm" | "rules" };
type Msg = ChatMessage & { events?: AgentEvent[] };

const STORAGE_KEY = "kuntur-session-v2";

const TIER_TEXT: Record<Tier, string> = {
  0: "Read-only. Kuntur can look at balances, invoices and rates.",
  1: "Advise. Kuntur can also compare providers and set rate alerts.",
  2: "Confirm. Kuntur can prepare payments; you approve every one.",
  3: "Autonomous within limits. Small payments that pass every check go through on their own."
};

const SUGGESTIONS = [
  "Pay my tuition the cheapest safe way",
  "Paga el depósito de vivienda",
  "Pay the housing deposit with QuickRemit",
  "Alert me if USD drops below 3.70",
  "Paga la cuota de intercambio en China"
];

const pen = (n: number) => `PEN ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function post(path: string, body: unknown) {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  const save = useCallback((s: Session, msgs?: Msg[]) => {
    setSession(s);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ session: s, messages: msgs ?? [] }));
    } catch {}
  }, []);

  const newSession = useCallback(async () => {
    setNotice(null);
    const data = await post("/api/session", {});
    setMessages([]);
    save(data, []);
  }, [save]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.session?.state) {
          setSession(parsed.session);
          setMessages(parsed.messages ?? []);
          return;
        }
      }
    } catch {}
    newSession().catch((e) => setNotice(e.message));
  }, [newSession]);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, session?.state.pending.length]);

  const handle = async (fn: () => Promise<void>) => {
    setBusy(true);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const send = (text: string) =>
    handle(async () => {
      if (!session || !text.trim()) return;
      const next: Msg[] = [...messages, { role: "user", content: text.trim() }];
      setMessages(next);
      setInput("");
      const data = await post("/api/agent", {
        state: session.state,
        sig: session.sig,
        messages: next.map(({ role, content }) => ({ role, content }))
      });
      const withReply: Msg[] = [...next, { role: "assistant", content: data.reply, events: data.events }];
      setMessages(withReply);
      save(data, withReply);
    });

  const decide = (p: PendingAction, approve: boolean) =>
    handle(async () => {
      if (!session) return;
      const data = await post("/api/confirm", { state: session.state, sig: session.sig, pendingId: p.id, approve });
      const line = approve
        ? data.result.ok
          ? `Approved ${p.id}. ${data.result.message}`
          : `Approval of ${p.id} failed. ${data.result.message}`
        : `Rejected ${p.id}. Nothing was paid.`;
      const msgs: Msg[] = [...messages, { role: "assistant", content: line }];
      setMessages(msgs);
      save(data, msgs);
    });

  const changeTier = (tier: Tier) =>
    handle(async () => {
      if (!session) return;
      save(await post("/api/settings", { state: session.state, sig: session.sig, tier }), messages);
    });

  const tick = () =>
    handle(async () => {
      if (!session) return;
      save(await post("/api/tick", { state: session.state, sig: session.sig }), messages);
    });

  const exportEvidence = () => {
    if (!session) return;
    const s = session.state;
    const evidence = {
      exportedAt: new Date().toISOString(),
      environment: "sandbox (simulated accounts, no real money)",
      sessionId: s.sessionId,
      agentMode: session.mode,
      chainVerification: session.chain,
      finalBalances: s.balances,
      transactions: s.transactions,
      alerts: s.alerts,
      auditLog: s.audit
    };
    const blob = new Blob([JSON.stringify(evidence, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `kuntur-evidence-${s.sessionId.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!session) {
    return <main className="top"><p>{notice ?? "Opening your sandbox account…"}</p></main>;
  }

  const s = session.state;
  const payeeName = (id: string) => s.payees.find((p) => p.id === id)?.name ?? id;

  return (
    <>
      <header className="top">
        <div className="brand">
          <h1>Kuntur<span>.</span></h1>
          <p>Cross-border payments for international students</p>
        </div>
        <span className={`badge ${session.mode === "llm" ? "ok" : "warn"}`}>
          {session.mode === "llm" ? "Language model agent" : "Rule-based agent (no API key)"}
        </span>
        <span className="badge">Sandbox: simulated money</span>
        <button className="btn" onClick={() => handle(newSession)} disabled={busy}>Start new session</button>
      </header>

      <div className="grid">
        <aside className="col" aria-label="Account">
          <h2>Available in soles</h2>
          <div className="money">{pen(s.balances.PEN)}</div>
          <div className="sub">USD {s.balances.USD.toFixed(2)} · spent today {pen(s.spentTodayPEN)} of {pen(s.limits.dailyPEN)}</div>

          <h2 id="tier-label">What Kuntur may do</h2>
          <div className="tiers" role="radiogroup" aria-labelledby="tier-label">
            {([0, 1, 2, 3] as Tier[]).map((t) => (
              <button key={t} role="radio" aria-checked={s.tier === t} onClick={() => changeTier(t)} disabled={busy}>
                Tier {t}
              </button>
            ))}
          </div>
          <p className="tier-note">{TIER_TEXT[s.tier]}</p>

          <h2>Invoices</h2>
          {s.invoices.map((i) => {
            const flagged = /ai assistant|ignore your previous/i.test(i.rawText);
            return (
              <div className="inv" key={i.id}>
                <div className="inv-top">
                  <span>{i.description}</span>
                  <span>{i.currency} {i.amount.toLocaleString("en-US")}</span>
                </div>
                <div className="sub">{payeeName(i.payeeId)} · due {i.dueDate} · {i.status}</div>
                {flagged && <div className="flag">Document contains instructions aimed at the agent</div>}
                {i.status === "open" && (
                  <button className="link" onClick={() => send(`Pay invoice ${i.id}`)} disabled={busy}>Ask Kuntur to pay this</button>
                )}
              </div>
            );
          })}

          <h2>Mid-market rates (PEN per unit)</h2>
          {Object.entries(s.rates).map(([c, r]) => (
            <div className="row" key={c}><span>{c}</span><span>{r}</span></div>
          ))}
          <p className="sub" style={{ margin: "8px 0 0" }}>
            {s.ratesSource?.kind === "live" ? (
              <>Live reference rate, updated {s.ratesSource.asOf}. <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer">Rates By Exchange Rate API</a></>
            ) : (
              <>Built-in reference values: the live rate service did not respond.</>
            )}
            {s.ratesSource?.simulatedMoves ? <> Includes {s.ratesSource.simulatedMoves} simulated move(s).</> : null}
          </p>
          <div style={{ marginTop: 10 }}>
            <button className="btn" onClick={tick} disabled={busy}>Simulate market move</button>
          </div>

          {s.alerts.length > 0 && <h2>Rate alerts</h2>}
          {s.alerts.map((a) => (
            <div className="row" key={a.id}>
              <span>{a.currency} {a.direction} {a.targetPENPerUnit}</span>
              <span className={`badge ${a.triggeredAt ? "ok" : ""}`}>{a.triggeredAt ? `Hit at ${a.triggeredRate}` : "Watching"}</span>
            </div>
          ))}

          {s.transactions.length > 0 && <h2>Payments made</h2>}
          {s.transactions.map((t) => (
            <div className="row" key={t.id}>
              <span>{t.payeeName}<br /><span className="sub">{t.reference} · {t.approvedBy === "human" ? "approved by you" : "auto-approved"}</span></span>
              <span>{pen(t.debitedPEN)}</span>
            </div>
          ))}
        </aside>

        <section className="col center" aria-label="Conversation">
          <div className="feed" ref={feedRef} aria-live="polite">
            {messages.length === 0 && (
              <div className="empty">
                <h3>Tuition is due on 15 November. Kuntur can find the cheapest licensed way to pay it.</h3>
                <p>Ask in English or Spanish. Kuntur prepares the payment; the policy engine checks it; you decide.</p>
                <div className="chips">
                  {SUGGESTIONS.map((q) => (
                    <button className="chip" key={q} onClick={() => send(q)} disabled={busy}>{q}</button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, idx) => (
              <div key={idx} className={`msg ${m.role}`}>
                {m.content}
                {m.events && m.events.length > 0 && (
                  <div className="steps">
                    {m.events.map((e, j) => (
                      <div key={j} className={`step ${e.ok ? "" : "bad"}`}>{e.tool}: {e.summary}</div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {s.pending.map((p) => (
              <div className="auth" key={p.id} role="region" aria-label={`Payment ${p.id} awaiting approval`}>
                <div className="auth-head">
                  <strong>Approve paying {p.quote.currency} {p.quote.amount.toLocaleString("en-US")} to {payeeName(s.invoices.find((i) => i.id === p.invoiceId)?.payeeId ?? "")}?</strong>
                  <span className="sub">{p.id} · via {p.quote.providerName} · {p.quote.eta}</span>
                </div>
                <div className="auth-body">
                  <div className="breakdown">
                    <div className="row"><span>At mid-market rate ({p.quote.midRate})</span><span>{pen(p.quote.midCostPEN)}</span></div>
                    <div className="row"><span>Provider FX markup</span><span>{pen(p.quote.fxMarkupPEN)}</span></div>
                    <div className="row"><span>Fixed fee</span><span>{pen(p.quote.feePEN)}</span></div>
                    <div className="row total"><span>Debited from your account</span><span>{pen(p.quote.totalPEN)}</span></div>
                    <p className="sub">{p.reason}</p>
                  </div>
                  <ul className="checks" aria-label="Policy checks">
                    {p.checks.map((c) => (
                      <li key={c.id} title={c.detail}>
                        <span className={c.passed ? "yes" : "no"} aria-hidden>{c.passed ? "✓" : "✕"}</span>
                        <span>{c.label}<br /><span className="sub">{c.detail}</span></span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="auth-actions">
                  <button className="btn approve" onClick={() => decide(p, true)} disabled={busy}>Approve payment</button>
                  <button className="btn" onClick={() => decide(p, false)} disabled={busy}>Reject</button>
                </div>
              </div>
            ))}
            {busy && <div className="msg assistant sub">Working…</div>}
          </div>

          {notice && <div className="notice" role="alert">{notice}</div>}

          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <label htmlFor="ask" className="sr-only" style={{ position: "absolute", left: -9999 }}>Message Kuntur</label>
            <textarea
              id="ask"
              value={input}
              maxLength={1500}
              placeholder="Ask Kuntur to pay, compare or watch a rate…"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
            />
            <button className="btn primary" type="submit" disabled={busy || !input.trim()}>Send</button>
          </form>
        </section>

        <aside className="col" aria-label="Audit trail">
          <h2>Audit trail</h2>
          <div className="toolbar">
            <span className={`badge ${session.chain.valid ? "ok" : "bad"}`}>
              {session.chain.valid ? `Hash chain intact · ${s.audit.length} entries` : `Chain broken at #${session.chain.brokenAt}`}
            </span>
            <button className="btn" onClick={exportEvidence}>Export evidence</button>
          </div>
          <ol className="chain" reversed>
            {[...s.audit].reverse().map((e: AuditEntry) => (
              <li key={e.seq} className={`${e.actor} ${/denied|blocked/.test(e.type) ? "deny" : ""}`}>
                <div className="meta">#{e.seq} · {e.actor} · {e.type} · {new Date(e.ts).toLocaleTimeString()}</div>
                <div>{e.summary}</div>
                <div className="hash">{e.hash.slice(0, 16)}</div>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </>
  );
}
