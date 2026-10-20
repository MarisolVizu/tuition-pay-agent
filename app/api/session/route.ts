import { initialState } from "@/lib/sandbox";
import { getLiveRates } from "@/lib/fx";
import { isCurrency } from "@/lib/currencies";
import { respond, error } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Start a sandbox session in the home currency the user chose (default PEN). */
export async function POST(req: Request) {
  let home: unknown = "PEN";
  try {
    const body = await req.json();
    if (body && body.home !== undefined) home = body.home;
  } catch {
    /* empty body → default */
  }
  if (!isCurrency(home)) return error("Unsupported home currency");
  const live = await getLiveRates(home);
  return respond(initialState(live, home));
}
