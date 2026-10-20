import { money } from "@/lib/currencies";
import { ACTOR_LABELS, LOG_LABELS, Logo, type Session } from "./shared";

export type ReportKind = { type: "full" } | { type: "receipt"; txId: string };

/** Printable report. Hidden on screen; the browser's "Save as PDF" turns it into a PDF. */
export default function Report({ session, kind }: { session: Session; kind: ReportKind | null }) {
  if (!kind) return null;
  const s = session.state;
  const m = (n: number) => money(s.home, n);
  const now = new Date().toLocaleString();
  const denied = s.audit.filter((e) => e.type === "payment.denied");

  if (kind.type === "receipt") {
    const t = s.transactions.find((x) => x.id === kind.txId);
    if (!t) return null;
    const inv = s.invoices.find((i) => i.id === t.invoiceId);
    return (
      <div className="report">
        <header className="r-head">
          <Logo size={44} />
          <div>
            <h1>Payment receipt</h1>
            <p>Kuntur · sandbox payment (simulated money) · generated {now}</p>
          </div>
        </header>
        <table className="r-table">
          <tbody>
            <tr><th>Reference</th><td>{t.reference}</td></tr>
            <tr><th>Date</th><td>{new Date(t.ts).toLocaleString()}</td></tr>
            <tr><th>Paid to</th><td>{t.payeeName}</td></tr>
            <tr><th>Bill</th><td>{inv?.description} ({t.invoiceId})</td></tr>
            <tr><th>Amount sent</th><td>{t.currency} {t.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td></tr>
            <tr><th>Provider</th><td>{t.providerName}</td></tr>
            <tr><th>Total debited</th><td><b>{m(t.debited)}</b></td></tr>
            <tr><th>Approved by</th><td>{t.approvedBy === "human" ? "Account holder" : "Policy engine (automatic, under the limit)"}</td></tr>
            <tr><th>Exchange-rate source</th><td>{s.ratesSource?.kind === "live" ? `${s.ratesSource.provider}, updated ${s.ratesSource.asOf}` : "built-in reference values"}</td></tr>
          </tbody>
        </table>
        <p className="r-note">Every step of this payment is recorded in a tamper-proof activity log ({session.chain.valid ? "seal chain verified" : "seal chain NOT verified"}). Session {s.sessionId}.</p>
      </div>
    );
  }

  return (
    <div className="report">
      <header className="r-head">
        <Logo size={44} />
        <div>
          <h1>Activity report</h1>
          <p>Kuntur · sandbox session (simulated money) · generated {now}</p>
        </div>
      </header>

      <h2>Summary</h2>
      <table className="r-table">
        <tbody>
          <tr><th>Account currency</th><td>{s.home}</td></tr>
          <tr><th>Final balance</th><td>{m(s.balance)}</td></tr>
          <tr><th>Payments made</th><td>{s.transactions.length}</td></tr>
          <tr><th>Payments blocked by policy</th><td>{denied.length}</td></tr>
          <tr><th>Exchange-rate source</th><td>{s.ratesSource?.kind === "live" ? `${s.ratesSource.provider}, updated ${s.ratesSource.asOf}` : "built-in reference values"}{s.ratesSource?.simulatedMoves ? ` (+${s.ratesSource.simulatedMoves} simulated demo moves)` : ""}</td></tr>
          <tr><th>Activity log integrity</th><td>{session.chain.valid ? `Verified: ${s.audit.length} sealed entries, none edited` : `Broken at entry #${session.chain.brokenAt}`}</td></tr>
        </tbody>
      </table>

      <h2>Payments</h2>
      {s.transactions.length === 0 ? (
        <p>No payments were made in this session.</p>
      ) : (
        <table className="r-table r-grid">
          <thead><tr><th>Date</th><th>Paid to</th><th>Amount</th><th>Provider</th><th>Debited</th><th>Approved by</th></tr></thead>
          <tbody>
            {s.transactions.map((t) => (
              <tr key={t.id}>
                <td>{new Date(t.ts).toLocaleString()}</td>
                <td>{t.payeeName}</td>
                <td>{t.currency} {t.amount.toLocaleString("en-US")}</td>
                <td>{t.providerName}</td>
                <td>{m(t.debited)}</td>
                <td>{t.approvedBy === "human" ? "You" : "Auto"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {denied.length > 0 && (
        <>
          <h2>Blocked attempts</h2>
          <ul>{denied.map((e) => <li key={e.seq}>{new Date(e.ts).toLocaleTimeString()}: {e.summary}</li>)}</ul>
        </>
      )}

      <h2>Full activity log</h2>
      <table className="r-table r-grid r-small">
        <thead><tr><th>#</th><th>Time</th><th>Who</th><th>Event</th><th>Details</th><th>Seal</th></tr></thead>
        <tbody>
          {s.audit.map((e) => (
            <tr key={e.seq}>
              <td>{e.seq}</td>
              <td>{new Date(e.ts).toLocaleTimeString()}</td>
              <td>{ACTOR_LABELS[e.actor] ?? e.actor}</td>
              <td>{LOG_LABELS[e.type] ?? e.type}</td>
              <td>{e.summary}</td>
              <td className="mono">{e.hash.slice(0, 12)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="r-note">Each entry is sealed with SHA-256 together with the previous one, so changing any past entry breaks every seal after it. Session {s.sessionId}.</p>
    </div>
  );
}
