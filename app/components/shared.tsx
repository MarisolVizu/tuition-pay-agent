import type { AgentEvent, AuditEntry, ChatMessage, SandboxState, Tier } from "@/lib/types";
import type { AgentMeta } from "@/lib/agent";

export type Session = { state: SandboxState; sig: string; chain: { valid: boolean; brokenAt?: number }; mode: "llm" | "rules" };
export type Msg = ChatMessage & { events?: AgentEvent[]; meta?: AgentMeta };
export type View = "home" | "pay" | "chat" | "rates" | "activity" | "settings";

export const LEVELS: { tier: Tier; name: string; short: string; note: string }[] = [
  { tier: 0, name: "View", short: "read only", note: "Kuntur can only look at your balance, bills and rates." },
  { tier: 1, name: "Advise", short: "compare", note: "Kuntur can compare providers and set rate alerts, but can’t prepare payments." },
  { tier: 2, name: "Ask me", short: "you approve", note: "Kuntur prepares payments and you approve each one. Recommended." },
  { tier: 3, name: "Auto", short: "small only", note: "Small payments that pass every check go through on their own. Bigger ones still need you." }
];

export const LOG_LABELS: Record<string, string> = {
  "session.created": "Session started",
  message: "You wrote",
  reply: "Kuntur replied",
  "tool.called": "Kuntur used a tool",
  "tool.blocked": "Action blocked",
  "payment.proposed": "Payment proposed",
  "payment.awaiting_approval": "Waiting for your approval",
  "payment.denied": "Blocked by policy",
  "payment.auto_approved": "Auto-approved by policy",
  "payment.approved": "You approved",
  "payment.rejected": "You cancelled",
  "payment.executed": "Payment sent",
  "tier.changed": "Permission changed",
  "alert.created": "Rate alert created",
  "alert.updated": "Rate alert changed",
  "alert.deleted": "Rate alert deleted",
  "alert.rejected": "Rate alert not valid",
  "alert.triggered": "Rate alert triggered",
  "market.tick": "Demo: simulated rate move",
  "market.reset": "Rates reset to live data",
  "llm.call": "AI model answered",
  "llm.error": "AI model failed"
};

export const ACTOR_LABELS: Record<string, string> = { user: "You", agent: "Kuntur", policy: "Policy engine", system: "System" };

export function Logo({ size = 38 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#1B1F4B" />
      <path d="M6 26c9 0 17 4 26 14 9-10 17-14 26-14-4 3-7 6-9 10l4-1c-4 3-7 6-10 11l3-1c-5 4-9 8-14 13-5-5-9-9-14-13l3 1c-3-5-6-8-10-11l4 1c-2-4-5-7-9-10z" fill="#FF3D7F" />
      <circle cx="32" cy="17" r="6" fill="#FFC23D" />
    </svg>
  );
}

/** Shows who produced an answer: the AI model (with model name, calls, time) or the rule-based fallback. */
export function AgentBadge({ meta }: { meta?: AgentMeta }) {
  if (!meta) return null;
  if (meta.mode === "llm") {
    return (
      <div className="agent-badge ai" title={`Provider: ${meta.provider}`}>
        <span className="dot" /> AI model · <b>{meta.model}</b> · {meta.rounds ?? 1} model call{(meta.rounds ?? 1) === 1 ? "" : "s"} · {(meta.latencyMs / 1000).toFixed(1)} s{meta.tokens ? ` · ${meta.tokens} tokens` : ""}
        {meta.fallbackReason && <> · <span className="warn-text">error: {meta.fallbackReason}</span></>}
      </div>
    );
  }
  return (
    <div className="agent-badge rules" title={meta.fallbackReason ?? "No model configured"}>
      <span className="dot warn" /> Rule-based fallback{meta.fallbackReason ? ` (AI model failed: ${meta.fallbackReason})` : " (no AI model configured)"}
    </div>
  );
}

export async function post(path: string, body: unknown) {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const isFlagged = (raw: string) => /ai assistant|ignore your previous/i.test(raw);

/* ---------------- Downloads ---------------- */

function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const csvCell = (v: unknown) => {
  const t = v === undefined || v === null ? "" : String(v);
  return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
const toCsv = (rows: unknown[][]) => "\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n"); // BOM so Excel reads UTF-8

export function downloadActivityCsv(s: SandboxState) {
  const rows: unknown[][] = [["#", "Date", "Time", "Who", "Event", "Details", "Seal (SHA-256)"]];
  for (const e of s.audit as AuditEntry[]) {
    const d = new Date(e.ts);
    rows.push([e.seq, d.toLocaleDateString(), d.toLocaleTimeString(), ACTOR_LABELS[e.actor] ?? e.actor, LOG_LABELS[e.type] ?? e.type, e.summary, e.hash]);
  }
  download(`kuntur-activity-${s.sessionId.slice(0, 8)}.csv`, toCsv(rows), "text/csv;charset=utf-8");
}

export function downloadPaymentsCsv(s: SandboxState) {
  const rows: unknown[][] = [["Date", "Paid to", "Bill", "Amount", "Currency", "Provider", `Total debited (${s.home})`, "Approved by", "Reference"]];
  for (const t of s.transactions) {
    rows.push([new Date(t.ts).toLocaleString(), t.payeeName, t.invoiceId, t.amount, t.currency, t.providerName, t.debited, t.approvedBy === "human" ? "You" : "Policy (auto, under limit)", t.reference]);
  }
  download(`kuntur-payments-${s.sessionId.slice(0, 8)}.csv`, toCsv(rows), "text/csv;charset=utf-8");
}

export function downloadJson(session: Session) {
  const s = session.state;
  const evidence = {
    exportedAt: new Date().toISOString(),
    environment: "sandbox (simulated accounts, no real money); exchange rates from exchangerate-api.com when live",
    sessionId: s.sessionId,
    agentMode: session.mode,
    homeCurrency: s.home,
    ratesSource: s.ratesSource,
    chainVerification: session.chain,
    finalBalance: s.balance,
    transactions: s.transactions,
    alerts: s.alerts,
    auditLog: s.audit
  };
  download(`kuntur-evidence-${s.sessionId.slice(0, 8)}.json`, JSON.stringify(evidence, null, 2), "application/json");
}
