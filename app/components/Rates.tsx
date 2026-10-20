import { useState } from "react";
import { CURRENCIES, CURRENCY_CODES, type Currency } from "@/lib/currencies";
import type { FxAlert } from "@/lib/types";
import type { Session } from "./shared";

type AlertPayload = { action: "create" | "update" | "delete"; id?: string; currency?: Currency; direction?: "below" | "above"; target?: number };
type AlertResult = { ok: boolean; message: string } | null;

const prec = (n: number) => Number(n.toPrecision(4));

function AlertRow({ a, home, busy, onAction }: { a: FxAlert; home: string; busy: boolean; onAction: (p: AlertPayload) => Promise<AlertResult> }) {
  const [editing, setEditing] = useState(false);
  const [dir, setDir] = useState<"below" | "above">(a.direction);
  const [target, setTarget] = useState(String(a.targetPerUnit));
  const [err, setErr] = useState<string | null>(null);

  if (!editing) {
    return (
      <div className="alert-row">
        <span>
          <b>{a.currency}</b> {a.direction} {a.targetPerUnit} {home}
          <br />
          <span className="sub">{a.triggeredAt ? `Reached at ${a.triggeredRate} on ${new Date(a.triggeredAt).toLocaleString()}` : "Watching the rate"}</span>
        </span>
        <span className="alert-actions">
          <span className={`pill ${a.triggeredAt ? "ok" : ""}`}>{a.triggeredAt ? "Reached" : "Watching"}</span>
          <button className="btn small" onClick={() => { setEditing(true); setErr(null); }} disabled={busy}>Edit</button>
          <button className="btn small danger" onClick={() => onAction({ action: "delete", id: a.id })} disabled={busy} aria-label={`Delete ${a.currency} alert`}>Delete</button>
        </span>
      </div>
    );
  }
  return (
    <div className="alert-row editing">
      <div className="form-row">
        <label>{a.currency} goes
          <select value={dir} onChange={(e) => setDir(e.target.value as "below" | "above")}>
            <option value="below">below</option>
            <option value="above">above</option>
          </select>
        </label>
        <label>Target ({home})
          <input type="number" step="any" min="0" value={target} onChange={(e) => setTarget(e.target.value)} />
        </label>
        <button
          className="btn brand small"
          disabled={busy}
          onClick={async () => {
            const r = await onAction({ action: "update", id: a.id, direction: dir, target: Number(target) });
            if (r?.ok) setEditing(false);
            else setErr(r?.message ?? "Could not update the alert.");
          }}
        >
          Save
        </button>
        <button className="btn small" onClick={() => setEditing(false)} disabled={busy}>Cancel</button>
      </div>
      {err && <p className="warn-text" style={{ margin: "6px 0 0" }}>{err}</p>}
    </div>
  );
}

export default function Rates(props: { session: Session; busy: boolean; alertAction: (p: AlertPayload) => Promise<AlertResult>; market: (reset: boolean) => void }) {
  const { session, busy } = props;
  const s = session.state;
  const live = s.ratesSource?.kind === "live";
  const simulated = (s.ratesSource?.simulatedMoves ?? 0) > 0;
  const others = CURRENCY_CODES.filter((c) => c !== s.home);
  const [ccy, setCcy] = useState<Currency>(others.includes("USD") ? "USD" : others[0]);
  const [dir, setDir] = useState<"below" | "above">("below");
  const [target, setTarget] = useState<string>("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const current = s.rates[ccy];
  const suggested = current ? prec(current * (dir === "below" ? 0.99 : 1.01)) : 0;
  const existing = s.alerts.find((a) => a.currency === ccy);

  const create = async () => {
    const t = target.trim() === "" ? suggested : Number(target);
    const r = await props.alertAction({ action: "create", currency: ccy, direction: dir, target: t });
    if (r) setMsg({ ok: r.ok, text: r.message });
    if (r?.ok) setTarget("");
  };

  return (
    <div className="page">
      <div className="page-head">
        <h2>Exchange rates & alerts</h2>
        <p>Real mid-market rates: the fair price of each currency, before any provider adds its margin.</p>
      </div>

      <section className="card">
        <div className="card-head">
          <h3 className="card-title">1 unit costs… (in {s.home})</h3>
          {simulated ? <span className="pill warn">Includes simulated moves</span> : live ? <span className="pill ok">● Live</span> : <span className="pill">Offline values</span>}
        </div>
        <div className="rate-grid">
          {others.map((c) => (
            <div key={c} className={`rate ${s.invoices.some((i) => i.currency === c && i.status === "open") ? "hl" : ""}`}>
              <b>{c}</b>
              <span>{s.rates[c]}</span>
              <small>{CURRENCIES[c].name}</small>
            </div>
          ))}
        </div>
        <p className="sub" style={{ marginTop: 12 }}>
          {live ? (
            <>Updated {s.ratesSource.asOf}. <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer">Rates By Exchange Rate API</a>. Highlighted: currencies of your open bills.</>
          ) : (
            <>The live rate service didn’t respond, so built-in reference values are shown.</>
          )}
        </p>
      </section>

      <section className="card">
        <h3 className="card-title">Rate alerts</h3>
        <p className="hint">Kuntur tells you when it’s a good moment to pay. You can have one alert per currency.</p>
        <div className="form-row">
          <label>Currency
            <select value={ccy} onChange={(e) => { setCcy(e.target.value as Currency); setMsg(null); }}>
              {others.map((c) => <option key={c} value={c}>{c} · {CURRENCIES[c].name}</option>)}
            </select>
          </label>
          <label>When it goes
            <select value={dir} onChange={(e) => setDir(e.target.value as "below" | "above")}>
              <option value="below">below</option>
              <option value="above">above</option>
            </select>
          </label>
          <label>Target ({s.home} per {ccy})
            <input type="number" step="any" min="0" placeholder={String(suggested)} value={target} onChange={(e) => setTarget(e.target.value)} />
          </label>
          <button className="btn brand" disabled={busy} onClick={create}>{existing ? `Replace ${ccy} alert` : "Create alert"}</button>
        </div>
        <p className="sub">
          Today: 1 {ccy} = {current} {s.home}. {dir === "below" ? `Choose a target under ${prec(current)}.` : `Choose a target over ${prec(current)}.`}
          {existing && <> You already have a {ccy} alert ({existing.direction} {existing.targetPerUnit}); creating a new one replaces it.</>}
        </p>
        {msg && <div className={`banner ${msg.ok ? "info" : "bad"}`} style={{ marginTop: 10 }}>{msg.text}</div>}

        <div className="alert-list">
          {s.alerts.length === 0 ? (
            <p className="sub">No alerts yet.</p>
          ) : (
            s.alerts.map((a) => <AlertRow key={`${a.id}-${a.direction}-${a.targetPerUnit}`} a={a} home={s.home} busy={busy} onAction={(p) => { setMsg(null); return props.alertAction(p); }} />)
          )}
        </div>
      </section>

      <details className="demo">
        <summary>Demo tools (for presentations)</summary>
        <p>The real rates above change once a day. To show an alert firing during a demo, you can push the rates a little. Simulated values are labelled, and you can go back to the live rate at any time.</p>
        <div className="btns">
          <button className="btn small" onClick={() => props.market(false)} disabled={busy}>Simulate a rate move</button>
          <button className="btn small" onClick={() => props.market(true)} disabled={busy || !simulated}>Back to live rates</button>
        </div>
      </details>
    </div>
  );
}
