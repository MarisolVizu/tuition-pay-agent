import { readSigned, respond, error } from "@/lib/http";
import { createAlert, deleteAlert, updateAlert } from "@/lib/actions";
import type { Currency } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** User actions on rate alerts: create (replaces the alert for that currency), update, delete. */
export async function POST(req: Request) {
  const parsed = await readSigned(req);
  if (parsed instanceof Response) return parsed;
  const { state, body } = parsed;
  const action = body.action;
  const direction = body.direction as "below" | "above";
  const target = Number(body.target);
  if (action === "create") return respond(state, { result: createAlert(state, body.currency as Currency, direction, target, "user") });
  if (action === "update" && typeof body.id === "string") return respond(state, { result: updateAlert(state, body.id, direction, target, "user") });
  if (action === "delete" && typeof body.id === "string") return respond(state, { result: deleteAlert(state, body.id, "user") });
  return error("action must be create, update or delete");
}
