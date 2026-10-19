import { createHmac, timingSafeEqual } from "crypto";
import type { SandboxState } from "./types";

/**
 * The sandbox is stateless on the server (Vercel serverless). The client holds the state,
 * but every state is HMAC-signed, so the browser cannot edit balances, limits, tier or
 * invoice status without the server rejecting it.
 */
function secret(): string {
  const s = process.env.STATE_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production" && process.env.VERCEL) {
    console.warn("[kuntur] STATE_SECRET is missing or short. Set it in Vercel project settings.");
  }
  return "kuntur-dev-only-secret-change-me";
}

export function signState(state: SandboxState): string {
  return createHmac("sha256", secret()).update(JSON.stringify(state)).digest("hex");
}

export function verifyState(state: unknown, sig: unknown): state is SandboxState {
  if (!state || typeof state !== "object" || typeof sig !== "string" || !/^[a-f0-9]{64}$/.test(sig)) return false;
  const expected = Buffer.from(signState(state as SandboxState), "hex");
  const given = Buffer.from(sig, "hex");
  return expected.length === given.length && timingSafeEqual(expected, given);
}
