import { money } from "@/lib/currencies";
import { ACTOR_LABELS, LOG_LABELS, downloadActivityCsv, downloadJson, downloadPaymentsCsv, type Session } from "./shared";
import type { ReportKind } from "./Report";

export default function Activity({ session, print }: { session: Session; print: (k: ReportKind) => void }) {
  const s = session.state;
  const blocked = s.audit.filter((e) => e.type === "payment.denied").length;
  return (
    <div className="page">
      <div className="page-head">
        <h2>Activity & reports</h2>
        <p>Every step you and Kuntur take is recorded and sealed, so nobody can change it afterwards.</p>
      </div>

      <div className="stats">
        <div className="card stat"><b>{s.transactions.length}</b><span>payments made</span></div>
        <div className="card stat"><b>{blocked}</b><span>payments blocked</span></div>
        <div className="card stat"><b>{s.audit.length}</b><span>sealed entries</span></div>
        <div className={`card stat ${session.chain.valid ? "good" : "bad"}`}><b>{session.chain.valid ? "✓" : "✕"}</b><span>{session.chain.valid ? "log not tampered" : `broken at #${session.chain.brokenAt}`}</span></div>
      </div>

      <section className="card">
        <h3 className="card-title">Download</h3>
        <div className="downloads">
          <button className="dl" onClick={() => print({ type: "full" })}>
            <span className="dl-ico">PDF</span>
            <span><b>Activity report</b><small>Easy to read and share. Opens the print dialog: choose “Save as PDF”.</small></span>
          </button>
          <button className="dl" onClick={() => downloadActivityCsv(s)}>
            <span className="dl-ico xls">XLS</span>
            <span><b>Activity log for Excel</b><small>CSV file that opens in Excel or Google Sheets.</small></span>
          </button>
          <button className="dl" onClick={() => downloadPaymentsCsv(s)} disabled={!s.transactions.length}>
            <span className="dl-ico xls">XLS</span>
            <span><b>Payments for Excel</b><small>{s.transactions.length ? "One row per payment." : "No payments yet."}</small></span>
          </button>
          <button className="dl" onClick={() => downloadJson(session)}>
            <span className="dl-ico json">JSON</span>
            <span><b>Technical evidence</b><small>Complete machine-readable record, with the seals, for verification.</small></span>
          </button>
        </div>
      </section>

      {s.transactions.length > 0 && (
        <section className="card">
          <h3 className="card-title">Receipts</h3>
          {s.transactions.map((t) => (
            <div className="row" key={t.id}>
              <span>{t.payeeName}<br /><span className="sub">{new Date(t.ts).toLocaleString()} · {t.reference}</span></span>
              <span className="bill-right">{money(s.home, t.debited)} <button className="btn small" onClick={() => print({ type: "receipt", txId: t.id })}>Receipt PDF</button></span>
            </div>
          ))}
        </section>
      )}

      <section className="card">
        <h3 className="card-title">Timeline</h3>
        <ol className="chain" reversed>
          {[...s.audit].reverse().map((e) => {
            const deny = /denied|blocked|rejected|error/.test(e.type);
            const good = /executed|approved|triggered/.test(e.type);
            return (
              <li key={e.seq} className={`${e.actor} ${deny ? "deny" : good ? "good" : ""}`}>
                <div className="what">{LOG_LABELS[e.type] ?? e.type}</div>
                <div className="detail">{e.summary}</div>
                <div className="meta">{ACTOR_LABELS[e.actor] ?? e.actor} · {new Date(e.ts).toLocaleTimeString()} · seal <span className="hash">{e.hash.slice(0, 12)}</span></div>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
