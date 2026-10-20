import { CURRENCIES, money } from "@/lib/currencies";
import { LEVELS, isFlagged, type Session, type View } from "./shared";

export default function Home({ session, goto, payBill }: { session: Session; goto: (v: View) => void; payBill: (id: string) => void }) {
  const s = session.state;
  const m = (n: number) => money(s.home, n);
  const open = s.invoices.filter((i) => i.status === "open");
  const safeOpen = open.filter((i) => !isFlagged(i.rawText));
  const suspicious = open.filter((i) => isFlagged(i.rawText));
  const nextDue = [...safeOpen].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  const spentPct = Math.min(100, (s.spentToday / Math.max(1, s.limits.daily)) * 100);
  const level = LEVELS.find((l) => l.tier === s.tier)!;

  return (
    <div className="page">
      {s.pending.length > 0 && (
        <button className="banner warn clickable" onClick={() => goto("pay")}>
          <b>{s.pending.length} payment waiting for your approval.</b> Review it →
        </button>
      )}

      {suspicious.length > 0 && (
        <div className="banner bad">
          <b>⚠ Kuntur found {suspicious.length} suspicious bill.</b> “{suspicious[0].description}” contains hidden instructions aimed at the AI. Kuntur will not pay it automatically.{" "}
          <button className="link" onClick={() => payBill(suspicious[0].id)}>See what Kuntur does</button>
        </div>
      )}

      <div className="home-grid">
        <section className="card balance">
          <div className="label">Student account · {CURRENCIES[s.home].name}</div>
          <div className="amount">{m(s.balance)}</div>
          <div className="meter" aria-hidden="true"><span style={{ width: `${spentPct}%` }} /></div>
          <div className="foot">Spent today {m(s.spentToday)} of {m(s.limits.daily)} daily limit</div>
        </section>

        <section className="card next">
          <span className="eyebrow">Next step</span>
          {nextDue ? (
            <>
              <h3>{nextDue.description}</h3>
              <p className="sub">{nextDue.currency} {nextDue.amount.toLocaleString("en-US")} · due {nextDue.dueDate}</p>
              <button className="btn brand big" onClick={() => payBill(nextDue.id)}>Pay it with Kuntur →</button>
            </>
          ) : (
            <>
              <h3>{open.length ? "No safe bills left to pay" : "Everything is paid 🎉"}</h3>
              <p className="sub">Download receipts and the full report from Activity.</p>
              <button className="btn brand" onClick={() => goto("activity")}>Go to Activity</button>
            </>
          )}
        </section>
      </div>

      <h2 className="section-title">What would you like to do?</h2>
      <div className="tiles">
        <button className="tile" onClick={() => goto("pay")}>
          <span className="tile-ico" aria-hidden="true">💳</span>
          <b>Pay a bill</b>
          <span>Step by step, with the cheapest licensed provider.</span>
        </button>
        <button className="tile" onClick={() => goto("chat")}>
          <span className="tile-ico" aria-hidden="true">💬</span>
          <b>Ask Kuntur</b>
          <span>Chat in English or Spanish about costs, rates or bills.</span>
        </button>
        <button className="tile" onClick={() => goto("rates")}>
          <span className="tile-ico" aria-hidden="true">📈</span>
          <b>Rates & alerts</b>
          <span>Today’s real exchange rates and alerts for a good moment to pay.</span>
        </button>
        <button className="tile" onClick={() => goto("activity")}>
          <span className="tile-ico" aria-hidden="true">🧾</span>
          <b>Activity & reports</b>
          <span>Everything that happened, as PDF, Excel or JSON.</span>
        </button>
      </div>

      <h2 className="section-title">Your bills</h2>
      <div className="card">
        {s.invoices.map((i) => {
          const flagged = isFlagged(i.rawText) && i.status === "open";
          return (
            <div className="row bill-row" key={i.id}>
              <span>
                <b>{i.description}</b>
                <br />
                <span className="sub">due {i.dueDate}</span>
                {flagged && <span className="pill bad" style={{ marginLeft: 8 }}>Suspicious</span>}
              </span>
              <span className="bill-right">
                {i.currency} {i.amount.toLocaleString("en-US")}
                {i.status === "open" ? (
                  <button className="btn small" onClick={() => payBill(i.id)}>Pay</button>
                ) : (
                  <span className="pill ok">✓ Paid</span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      <p className="sub foot-note">
        Kuntur’s permission level: <b>{level.name}</b> ({level.short}). <button className="link" onClick={() => goto("settings")}>Change</button>
      </p>
    </div>
  );
}
