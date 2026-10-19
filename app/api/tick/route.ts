import { readSigned, respond } from "@/lib/http";
import { tickMarket } from "@/lib/sandbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const parsed = await readSigned(req);
  if (parsed instanceof Response) return parsed;
  return respond(tickMarket(parsed.state));
}
