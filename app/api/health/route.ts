import { NextResponse } from "next/server";
import { llmConfig, pingModel } from "@/lib/agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET: which model is configured (never returns keys). */
export async function GET() {
  const c = llmConfig();
  return NextResponse.json({ configured: c.configured, provider: c.provider ?? null, model: c.model ?? null, fallback: (process.env.AGENT_FALLBACK ?? "on").toLowerCase() !== "off" });
}

/** POST: make a tiny real call to the model and report latency and its reply. */
export async function POST() {
  return NextResponse.json(await pingModel());
}
