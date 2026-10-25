import { z } from "zod";
import { normalizeAddress } from "@/lib/address";
import { getAgent, latestSnapshot, validateCommand } from "@/lib/agents";
import { appendAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/env";
import { sha256Hex } from "@/lib/hash";
import { clientIp, handle, json, readJson } from "@/lib/http";
import { checkSecondFactor } from "@/lib/second-factor";
import { requireUser } from "@/lib/session";

export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/agents/[address]/soul">) => {
  const sql = await db();
  const agent = await getAgent(sql, normalizeAddress((await ctx.params).address));
  const snap = await latestSnapshot(sql, agent.address);
  const pending = await sql`
    SELECT id, status, payload->>'content' AS content, created_by, created_at, updated_at, result FROM agent_commands
    WHERE agent_address = ${agent.address} AND type = 'soul_update' ORDER BY id DESC LIMIT 20`;
  return json({
    snapshotId: snap?.id ?? null,
    capturedAt: snap?.captured_at ?? null,
    creatorAddress: agent.creator_address,
    source: "~/.automaton/SOUL.md and state.db soul_history (agent-signed snapshot)",
    content: snap?.payload.soul?.content ?? null,
    history: snap?.payload.soul?.history ?? [],
    updates: pending,
  });
});

const Body = z.object({ message: z.string().max(60_000), signature: z.string().regex(/^0x[0-9a-fA-F]+$/), totp: z.string().regex(/^\d{6}$/).optional() });

export const PUT = handle(async (req: Request, ctx: RouteContext<"/api/agents/[address]/soul">) => {
  const user = await requireUser();
  const body = Body.safeParse(await readJson(req, 120_000));
  if (!body.success) throw new HttpError(400, "expected {message, signature}");
  const sql = await db();
  await checkSecondFactor(sql, user, body.data.totp);
  const agent = await getAgent(sql, normalizeAddress((await ctx.params).address));
  const cmd = await validateCommand(sql, agent, user, body.data.message, body.data.signature, "soul_update");
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO agent_commands (agent_address, type, payload, message, creator_signature, created_by)
    VALUES (${agent.address}, 'soul_update', ${sql.json(cmd.payload as never)}, ${body.data.message}, ${body.data.signature}, ${user})
    RETURNING id`;
  await appendAudit(sql, {
    actor: user,
    agentAddress: agent.address,
    action: "update_soul_requested",
    details: { commandId: row.id, contentSha256: sha256Hex(String(cmd.payload.content)), signature: body.data.signature },
    ipAddress: clientIp(req),
  });
  return json({ commandId: row.id, status: "pending" }, { status: 202 });
});
