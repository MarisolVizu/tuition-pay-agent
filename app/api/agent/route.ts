import { readSigned, respond, error } from "@/lib/http";
import { runAgent } from "@/lib/agent";
import { sanitizeUserMessage } from "@/lib/guard";
import type { ChatMessage } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const parsed = await readSigned(req);
  if (parsed instanceof Response) return parsed;
  const { state, body } = parsed;
  const raw = Array.isArray(body.messages) ? (body.messages as ChatMessage[]) : [];
  const messages: ChatMessage[] = raw
    .filter((m) => m && (m.role === "user" || m.role === "assistant"))
    .slice(-12)
    .map((m) => ({ role: m.role, content: sanitizeUserMessage(m.content) }))
    .filter((m) => m.content.length > 0);
  if (!messages.length || messages[messages.length - 1].role !== "user") return error("The last message must be from the user");
  const { reply, events, mode } = await runAgent(state, messages);
  return respond(state, { reply, events, agentMode: mode });
}
