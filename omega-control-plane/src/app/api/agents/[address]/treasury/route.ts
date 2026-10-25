import { z } from "zod";
import { normalizeAddress } from "@/lib/address";
import { getAgent, getPolicy, requireCreator } from "@/lib/agents";
import { appendAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/env";
import { clientIp, handle, json, readJson } from "@/lib/http";
import { requireUser } from "@/lib/session";

export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/agents/[address]/treasury">) => {
  const sql = await db();
  const agent = await getAgent(sql, normalizeAddress((await ctx.params).address));
  return json({ policy: await getPolicy(sql, agent.address) });
});

const Body = z.object({
  max_topup_usd: z.number().int().min(0).max(2500),
  daily_topup_cap_usd: z.number().int().min(0).max(10_000),
  surplus_threshold_usd: z.number().int().min(0).max(1_000_000),
});

export const PUT = handle(async (req: Request, ctx: RouteContext<"/api/agents/[address]/treasury">) => {
  const user = await requireUser();
  const body = Body.safeParse(await readJson(req, 10_000));
  if (!body.success) throw new HttpError(400, "invalid policy");
  const sql = await db();
  const agent = await getAgent(sql, normalizeAddress((await ctx.params).address));
  requireCreator(agent, user);
  const before = await getPolicy(sql, agent.address);
  const p = body.data;
  await sql`
    INSERT INTO treasury_policies (agent_address, max_topup_usd, daily_topup_cap_usd, surplus_threshold_usd, updated_by, updated_at)
    VALUES (${agent.address}, ${p.max_topup_usd}, ${p.daily_topup_cap_usd}, ${p.surplus_threshold_usd}, ${user}, now())
    ON CONFLICT (agent_address) DO UPDATE SET max_topup_usd = EXCLUDED.max_topup_usd,
      daily_topup_cap_usd = EXCLUDED.daily_topup_cap_usd, surplus_threshold_usd = EXCLUDED.surplus_threshold_usd,
      updated_by = EXCLUDED.updated_by, updated_at = now()`;
  await appendAudit(sql, {
    actor: user,
    agentAddress: agent.address,
    action: "treasury_policy_updated",
    details: { before: { max: before.max_topup_usd, daily: before.daily_topup_cap_usd, surplus: before.surplus_threshold_usd }, after: p },
    ipAddress: clientIp(req),
  });
  return json({ policy: await getPolicy(sql, agent.address) });
});
