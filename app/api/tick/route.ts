import { readSigned, respond } from "@/lib/http";
import { resetToLive, tickMarket } from "@/lib/sandbox";
import { getLiveRates } from "@/lib/fx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Demo control: simulate a market move, or reset to the real reference rate ({ reset: true }). */
export async function POST(req: Request) {
  const parsed = await readSigned(req);
  if (parsed instanceof Response) return parsed;
  const { state, body } = parsed;
  if (body.reset === true) return respond(resetToLive(state, await getLiveRates(state.home)));
  return respond(tickMarket(state));
}
