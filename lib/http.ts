import { NextResponse } from "next/server";
import type { SandboxState } from "./types";
import { signState, verifyState } from "./signing";
import { verifyChain } from "./audit";

export const mode = () => ((process.env.LLM_API_KEY && process.env.LLM_BASE_URL) || process.env.ANTHROPIC_API_KEY ? "llm" : "rules");

export function respond(state: SandboxState, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ state, sig: signState(state), chain: verifyChain(state.audit), mode: mode(), ...extra });
}

export function error(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

const MAX_BODY = 400_000;

export async function readSigned(req: Request): Promise<{ state: SandboxState; body: Record<string, unknown> } | Response> {
  const text = await req.text();
  if (text.length > MAX_BODY) return error("Request too large", 413);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text);
  } catch {
    return error("Invalid JSON");
  }
  if (!verifyState(body.state, body.sig)) return error("Sandbox state signature is invalid. The session was modified outside the server; start a new session.", 401);
  return { state: body.state as SandboxState, body };
}
