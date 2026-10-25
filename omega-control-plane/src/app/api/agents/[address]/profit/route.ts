import { normalizeAddress } from "@/lib/address";
import { getAgent } from "@/lib/agents";
import { db } from "@/lib/db";
import { handle, json } from "@/lib/http";
import { computeProfit } from "@/lib/profit";

export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/agents/[address]/profit">) => {
  const sql = await db();
  const agent = await getAgent(sql, normalizeAddress((await ctx.params).address));
  return json(await computeProfit(sql, agent));
});
