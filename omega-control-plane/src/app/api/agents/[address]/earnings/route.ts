import { normalizeAddress } from "@/lib/address";
import { getAgent } from "@/lib/agents";
import { db } from "@/lib/db";
import { computeEarnings } from "@/lib/earnings";
import { handle, json } from "@/lib/http";

export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/agents/[address]/earnings">) => {
  const sql = await db();
  const agent = await getAgent(sql, normalizeAddress((await ctx.params).address));
  return json(await computeEarnings(sql, agent));
});
