import { getAgent } from "@/lib/agents";
import { appendAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/env";
import { clientIp, handle, json, readJson } from "@/lib/http";
import { verifySignedSnapshot } from "@/lib/snapshot";

export const POST = handle(async (req: Request, ctx: RouteContext<"/api/agents/[address]/snapshots">) => {
  const body = await readJson(req, 4_500_000);
  const v = await verifySignedSnapshot(body, (await ctx.params).address);
  const sql = await db();
  const agent = await getAgent(sql, v.agent);
  const creator = v.payload.config.creatorAddress ?? null;
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO snapshots (agent_address, payload_sha256, signature, captured_at, survival_tier, credits_cents, turn_count, payload)
    VALUES (${v.agent}, ${v.payloadSha256}, ${v.signature}, ${v.payload.capturedAt}, ${v.tier}, ${v.payload.creditsCents},
            ${v.payload.turnCount}, ${sql.json(JSON.parse(JSON.stringify(v.payload)))})
    ON CONFLICT (payload_sha256) DO NOTHING RETURNING id`;
  if (!row) throw new HttpError(409, "snapshot already ingested (replay)");
  await sql`
    UPDATE agents SET last_snapshot_id = ${row.id}, last_snapshot_at = ${v.payload.capturedAt},
      name = COALESCE(${v.payload.config.name ?? null}, name),
      creator_address = COALESCE(${creator}, creator_address),
      sandbox_id = COALESCE(${v.payload.config.sandboxId ?? null}, sandbox_id)
    WHERE address = ${v.agent}`;
  if (agent.creator_address && creator && agent.creator_address.toLowerCase() !== creator.toLowerCase()) {
    await appendAudit(sql, { actor: v.agent, agentAddress: v.agent, action: "creator_changed", details: { from: agent.creator_address, to: creator }, ipAddress: clientIp(req) });
  }
  await appendAudit(sql, {
    actor: v.agent,
    agentAddress: v.agent,
    action: "snapshot_ingested",
    details: { snapshotId: row.id, payloadSha256: v.payloadSha256, tier: v.tier, creditsCents: v.payload.creditsCents, turnCount: v.payload.turnCount },
    ipAddress: clientIp(req),
  });
  return json({ id: row.id, payloadSha256: v.payloadSha256, survivalTier: v.tier }, { status: 201 });
});

export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/agents/[address]/snapshots">) => {
  const sql = await db();
  const agent = await getAgent(sql, (await ctx.params).address);
  const rows = await sql`
    SELECT id, captured_at, received_at, survival_tier, credits_cents, turn_count, payload_sha256
    FROM snapshots WHERE agent_address = ${agent.address} ORDER BY id DESC LIMIT 500`;
  return json({ snapshots: rows });
});
