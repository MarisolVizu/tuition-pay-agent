import { money } from "@/lib/currencies";
import type { PendingAction, SandboxState } from "@/lib/types";

export default function ApprovalCard({ p, s, busy, onDecide }: { p: PendingAction; s: SandboxState; busy: boolean; onDecide: (approve: boolean) => void }) {
  const inv = s.invoices.find((i) => i.id === p.invoiceId);
  const payee = s.payees.find((x) => x.id === inv?.payeeId)?.name ?? "";
  const q = p.quote;
  return (
    <div className="auth" role="region" aria-label={`Payment ${p.id} waiting for your approval`}>
      <div className="auth-head">
        <strong>Approve paying {q.currency} {q.amount.toLocaleString("en-US")} to {payee}?</strong>
        <span className="sub">via {q.providerName} · arrives {q.eta.toLowerCase()}</span>
      </div>
      <div className="auth-body">
        <div className="breakdown">
          <div className="row"><span>At the real market rate ({q.midRate})</span><span>{money(q.home, q.midCost)}</span></div>
          <div className="row hidden"><span>Hidden in the provider’s rate</span><span>+ {money(q.home, q.fxMarkup)}</span></div>
          <div className="row"><span>Fee</span><span>+ {money(q.home, q.fee)}</span></div>
          <div className="row total"><span>You pay</span><span>{money(q.home, q.total)}</span></div>
          <p className="sub">{p.reason}</p>
        </div>
        <details className="checks-wrap" open>
          <summary>{p.checks.filter((c) => c.passed).length} of {p.checks.length} safety checks passed</summary>
          <ul className="checks">
            {p.checks.map((c) => (
              <li key={c.id} title={c.detail}>
                <span className={c.passed ? "yes" : "no"} aria-hidden="true">{c.passed ? "✓" : "✕"}</span>
                <span>{c.label}<br /><span className="sub">{c.detail}</span></span>
              </li>
            ))}
          </ul>
        </details>
      </div>
      <div className="auth-actions">
        <button className="btn ok" onClick={() => onDecide(true)} disabled={busy}>Approve and pay</button>
        <button className="btn" onClick={() => onDecide(false)} disabled={busy}>Cancel</button>
      </div>
    </div>
  );
}
