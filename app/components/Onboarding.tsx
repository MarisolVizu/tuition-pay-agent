import { useState } from "react";
import { CURRENCIES, CURRENCY_CODES, type Currency } from "@/lib/currencies";
import type { Tier } from "@/lib/types";
import { LEVELS, Logo } from "./shared";

export default function Onboarding({ initialHome, initialTier, onFinish, onSkip }: { initialHome: Currency; initialTier: Tier; onFinish: (home: Currency, tier: Tier) => void; onSkip: () => void }) {
  const [step, setStep] = useState(0);
  const [home, setHome] = useState<Currency>(initialHome);
  const [tier, setTier] = useState<Tier>(initialTier);
  const total = 3;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="ob-title">
      <div className="modal">
        <div className="modal-top">
          <Logo size={40} />
          <span className="sub">Step {step + 1} of {total}</span>
          <button className="link" onClick={onSkip}>Skip</button>
        </div>
        <div className="dots" aria-hidden="true">{Array.from({ length: total }, (_, i) => <span key={i} className={i <= step ? "on" : ""} />)}</div>

        {step === 0 && (
          <>
            <h2 id="ob-title">Welcome to Kuntur</h2>
            <p>Kuntur is an AI agent that pays your bills abroad, like tuition or housing, at the lowest real cost.</p>
            <ul className="ob-list">
              <li><b>Finds hidden costs.</b> Banks hide most of their price in the exchange rate. Kuntur shows it.</li>
              <li><b>Stops fraud.</b> It checks every bill and every provider before paying.</li>
              <li><b>You stay in control.</b> You choose how much it can do on its own.</li>
            </ul>
            <p className="sub">This is a sandbox: the exchange rates are real, the money is simulated.</p>
          </>
        )}

        {step === 1 && (
          <>
            <h2 id="ob-title">Which currency do you pay from?</h2>
            <p>Kuntur will show every cost in this currency.</p>
            <select className="wide-select" value={home} onChange={(e) => setHome(e.target.value as Currency)}>
              {CURRENCY_CODES.map((c) => <option key={c} value={c}>{c} · {CURRENCIES[c].name}</option>)}
            </select>
          </>
        )}

        {step === 2 && (
          <>
            <h2 id="ob-title">How much can Kuntur do on its own?</h2>
            <p>You can change this later in Settings.</p>
            <div className="level-list" role="radiogroup" aria-labelledby="ob-title">
              {LEVELS.map((l) => (
                <button key={l.tier} role="radio" aria-checked={tier === l.tier} className={`level ${tier === l.tier ? "on" : ""}`} onClick={() => setTier(l.tier)}>
                  <span className="radio" aria-hidden="true" />
                  <span><b>{l.name}</b> <span className="sub">({l.short})</span><br /><span className="sub">{l.note}</span></span>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="modal-actions">
          {step > 0 && <button className="btn" onClick={() => setStep(step - 1)}>Back</button>}
          {step < total - 1 ? (
            <button className="btn brand" onClick={() => setStep(step + 1)}>Continue</button>
          ) : (
            <button className="btn brand" onClick={() => onFinish(home, tier)}>Start using Kuntur</button>
          )}
        </div>
      </div>
    </div>
  );
}
