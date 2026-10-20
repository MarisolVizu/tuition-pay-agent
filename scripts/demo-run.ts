/**
 * Headless run of the REAL agent, producing execution evidence for the submission.
 *
 *   npm run demo
 *
 * Reads .env.local. If an AI model is configured (LLM_BASE_URL + LLM_API_KEY + LLM_MODEL,
 * or ANTHROPIC_API_KEY), every step is planned by the language model, exactly as in the app.
 * Without a model it says so and uses the rule-based fallback.
 * Output: evidence/sandbox-run.json (transcript, which engine answered each step,
 * transactions, balance, full hash-chained audit log).
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { initialState, tickMarket } from "../lib/sandbox";
import { runAgent, llmConfig, type AgentMeta } from "../lib/agent";
import { decidePending, setTier } from "../lib/actions";
import { verifyChain } from "../lib/audit";
import type { ChatMessage } from "../lib/types";

// minimal .env.local loader (no extra dependency)
for (const f of [".env.local", ".env"]) {
  if (!existsSync(f)) continue;
  for (const raw of readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = raw.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

type Step = { step: string; engine?: string; reply?: string; tools?: string[] };

async function main() {
  const cfg = llmConfig();
  console.log(cfg.configured ? `AI model: ${cfg.model} (${cfg.provider})` : "No AI model configured: using the rule-based fallback.");
  const s = initialState();
  const transcript: Step[] = [];
  const engines: AgentMeta[] = [];

  const say = async (text: string) => {
    const history: ChatMessage[] = [{ role: "user", content: text }];
    const r = await runAgent(s, history);
    engines.push(r.meta);
    const engine = r.meta.mode === "llm" ? `AI model ${r.meta.model}, ${r.meta.rounds} call(s), ${r.meta.latencyMs} ms` : `rule-based fallback${r.meta.fallbackReason ? ` (model failed: ${r.meta.fallbackReason})` : ""}`;
    transcript.push({ step: `user: ${text}`, engine, reply: r.reply, tools: r.events.map((e) => `${e.tool} → ${e.ok ? "ok" : "blocked"}: ${e.summary}`) });
    console.log(`\n▸ ${text}\n  [${engine}]\n${r.reply}`);
  };

  await say("What invoices do I have?");
  await say("Pay my tuition the cheapest safe way");
  const pending = s.pending[0];
  if (pending) {
    const approved = decidePending(s, pending.id, true);
    transcript.push({ step: `human approves ${pending.id}`, reply: approved.message });
  }
  await say("Paga el depósito de vivienda");
  await say("Pay the housing deposit with QuickRemit");
  setTier(s, 0);
  await say("Compare sending 1200 USD");
  setTier(s, 3);
  await say("Paga la cuota de intercambio en China");
  await say("Alert me if USD drops below 3.74");
  let seed = 7;
  tickMarket(s, () => ((seed = (seed * 9301 + 49297) % 233280) / 233280));
  transcript.push({ step: "simulated market move", reply: JSON.stringify(s.rates) });

  const llmSteps = engines.filter((m) => m.mode === "llm").length;
  const evidence = {
    generatedAt: new Date().toISOString(),
    environment: "Kuntur sandbox: simulated accounts, no real money moved",
    agent: cfg.configured ? { model: cfg.model, provider: cfg.provider, stepsAnsweredByModel: `${llmSteps} of ${engines.length}` } : { model: null, note: "no model configured; rule-based fallback" },
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
  console.log(`\nSteps answered by the AI model: ${llmSteps} of ${engines.length}. Transactions: ${s.transactions.length}. Chain valid: ${evidence.chainVerification.valid}.`);
  console.log("Saved evidence/sandbox-run.json");
}
main();
