import { initialState } from "@/lib/sandbox";
import { getLiveRates } from "@/lib/fx";
import { respond } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const live = await getLiveRates();
  return respond(initialState(live));
}
