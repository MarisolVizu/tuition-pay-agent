import { createHash } from "crypto";
import type { AuditActor, AuditEntry, SandboxState } from "./types";
import { maskPII } from "./guard";

const GENESIS = "0".repeat(64);
const MAX_ENTRIES = 300;

function hashEntry(e: Omit<AuditEntry, "hash">): string {
  const payload = JSON.stringify([e.seq, e.ts, e.actor, e.type, e.summary, e.data ?? null, e.prevHash]);
  return createHash("sha256").update(payload).digest("hex");
}

/** Mask PII in string values only; numbers (amounts, rates) are left untouched. */
function maskValue(v: unknown): unknown {
  if (typeof v === "string") return maskPII(v);
  if (Array.isArray(v)) return v.map(maskValue);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, maskValue(x)]));
  return v;
}

function maskData(data?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!data) return undefined;
  return maskValue(data) as Record<string, unknown>;
}

/** Append a tamper-evident, hash-chained entry. Mutates and returns state. */
export function audit(
  state: SandboxState,
  actor: AuditActor,
  type: string,
  summary: string,
  data?: Record<string, unknown>
): SandboxState {
  const prev = state.audit[state.audit.length - 1];
  const base: Omit<AuditEntry, "hash"> = {
    seq: prev ? prev.seq + 1 : 1,
    ts: new Date().toISOString(),
    actor,
    type,
    summary: maskPII(summary),
    data: maskData(data),
    prevHash: prev ? prev.hash : GENESIS
  };
  state.audit.push({ ...base, hash: hashEntry(base) });
  if (state.audit.length > MAX_ENTRIES) state.audit = state.audit.slice(-MAX_ENTRIES);
  return state;
}

/** Verify every link of the chain. Works on a trimmed chain (checks internal links). */
export function verifyChain(entries: AuditEntry[]): { valid: boolean; brokenAt?: number } {
  for (let i = 0; i < entries.length; i++) {
    const { hash, ...rest } = entries[i];
    if (hashEntry(rest) !== hash) return { valid: false, brokenAt: entries[i].seq };
    if (i > 0 && entries[i].prevHash !== entries[i - 1].hash) return { valid: false, brokenAt: entries[i].seq };
  }
  return { valid: true };
}
