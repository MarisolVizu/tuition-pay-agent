import { CURRENCIES, CURRENCY_CODES, money, type Currency } from "@/lib/currencies";
import type { Tier } from "@/lib/types";
import { LEVELS, type Session } from "./shared";

export default function Settings(props: {
  session: Session;
  busy: boolean;
  changeTier: (t: Tier) => void;
  newSession: (home: Currency) => void;
  showTour: () => void;
}) {
  const { session, busy } = props;
  const s = session.state;
  return (
    <div className="page">
      <div className="page-head">
        <h2>Settings</h2>
        <p>Decide how much Kuntur can do on its own, and which currency you pay from.</p>
      </div>

      <section className="card">
        <h3 className="card-title" id="lvl">How much can Kuntur do?</h3>
        <div className="level-list" role="radiogroup" aria-labelledby="lvl">
          {LEVELS.map((l) => (
            <button key={l.tier} role="radio" aria-checked={s.tier === l.tier} className={`level ${s.tier === l.tier ? "on" : ""}`} onClick={() => props.changeTier(l.tier)} disabled={busy}>
              <span className="radio" aria-hidden="true" />
              <span><b>{l.name}</b> <span className="sub">({l.short})</span><br /><span className="sub">{l.note}</span></span>
            </button>
          ))}
        </div>
        <p className="sub" style={{ marginTop: 10 }}>
          Always on, at every level: per-payment limit {money(s.home, s.limits.perTransaction)}, daily limit {money(s.home, s.limits.daily)}, “Auto” only below {money(s.home, s.limits.autoApprove)}, licensed providers and verified payees only.
        </p>
      </section>

      <section className="card">
        <h3 className="card-title">Account currency</h3>
        <p className="hint">The currency you pay from. Changing it opens a new sandbox account.</p>
        <select
          className="wide-select"
          value={s.home}
          disabled={busy}
          onChange={(e) => {
            const next = e.target.value as Currency;
            if (window.confirm(`Open a new sandbox account in ${CURRENCIES[next].name} (${next})? The current session will be cleared.`)) props.newSession(next);
          }}
        >
          {CURRENCY_CODES.map((c) => <option key={c} value={c}>{c} · {CURRENCIES[c].name}</option>)}
        </select>
      </section>

      <section className="card">
        <h3 className="card-title">Session</h3>
        <p className="sub">All money is simulated; exchange rates are real.</p>
        <div className="page-actions">
          <button className="btn" onClick={() => props.newSession(s.home)} disabled={busy}>Start a new session</button>
          <button className="btn" onClick={props.showTour}>Show the welcome guide again</button>
        </div>
      </section>
    </div>
  );
}
