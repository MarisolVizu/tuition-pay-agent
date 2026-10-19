import { readSigned, respond, error } from "@/lib/http";
import { setTier } from "@/lib/actions";
import type { Tier } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const parsed = await readSigned(req);
  if (parsed instanceof Response) return parsed;
  const tier = parsed.body.tier;
  if (![0, 1, 2, 3].includes(tier as number)) return error("tier must be 0, 1, 2 or 3");
  return respond(setTier(parsed.state, tier as Tier));
}
