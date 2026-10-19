import { readSigned, respond, error } from "@/lib/http";
import { decidePending } from "@/lib/actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Human-only endpoint. The agent has no tool that reaches this code path. */
export async function POST(req: Request) {
  const parsed = await readSigned(req);
  if (parsed instanceof Response) return parsed;
  const { state, body } = parsed;
  if (typeof body.pendingId !== "string" || typeof body.approve !== "boolean") return error("pendingId and approve are required");
  const result = decidePending(state, body.pendingId, body.approve);
  return respond(state, { result });
}
