/**
 * Headless sandbox run that produces execution evidence for the submission.
 *   npm run demo   →  evidence/sandbox-run.json
 */
import { writeFileSync, mkdirSync } from "fs";
import { initialState, tickMarket } from "../lib/sandbox";
import { runRules } from "../lib/agent";
import { decidePending, setTier } from "../lib/actions";
import { verifyChain } from "../lib/audit";

const s = initialState();
const transcript: { step: string; reply?: string; tools?: string[] }[] = [];
const say = (text: string) => {
  const r = runRules(s, text);
  transcript.push({ step: `user: ${text}`, reply: r.reply, tools: r.events.map((e) => `${e.tool} → ${e.ok ? "ok" : "blocked"}: ${e.summary}`) });
};

say("What invoices do I have?");
say("Pay my tuition the cheapest safe way");
const pending = s.pending[0];
const approved = decidePending(s, pending.id, true);
transcript.push({ step: `human approves ${pending.id}`, reply: approved.message });
say("Paga el depósito de vivienda");
say("Pay the housing deposit with QuickRemit");
setTier(s, 0);
say("Compare sending 1200 USD");
setTier(s, 3);
say("Paga la cuota de intercambio en China");
say("Alert me if USD drops below 3.74");
let seed = 7;
tickMarket(s, () => ((seed = (seed * 9301 + 49297) % 233280) / 233280));
transcript.push({ step: "market tick", reply: JSON.stringify(s.rates) });

const evidence = {
  generatedAt: new Date().toISOString(),
  environment: "Kuntur sandbox — simulated accounts, no real money moved",
  sessionId: s.sessionId,
  chainVerification: verifyChain(s.audit),
  homeCurrency: s.home,
      finalBalance: s.balance,
  transactions: s.transactions,
  alerts: s.alerts,
  transcript,
  auditLog: s.audit
};
mkdirSync("evidence", { recursive: true });
writeFileSync("evidence/sandbox-run.json", JSON.stringify(evidence, null, 2));
console.log(`Transactions: ${s.transactions.length}, audit entries: ${s.audit.length}, chain valid: ${evidence.chainVerification.valid}`);
for (const t of transcript) console.log(`\n▸ ${t.step}\n${t.reply ?? ""}`);
