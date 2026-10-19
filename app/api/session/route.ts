import { initialState } from "@/lib/sandbox";
import { respond } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return respond(initialState());
}
