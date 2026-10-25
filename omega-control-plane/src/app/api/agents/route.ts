import { z } from "zod";
import { normalizeAddress } from "@/lib/address";
import { appendAudit } from "@/lib/audit";
import { db, hasDb } from "@/lib/db";
import { HttpError } from "@/lib/env";
import { clientIp, handle, json, readJson } from "@/lib/http";
import { requireUser } from "@/lib/session";

export const GET = handle(async () => {
  if (!hasDb()) return json({ agents: [], database: "not_configured" });
  const sql = await db();
  const agents = await sql`
    SELECT a.address, a.name, a.creator_address, a.sandbox_id, a.added_by, a.created_at, a.last_snapshot_at,
           s.survival_tier, s.credits_cents, s.turn_count, s.payload->>'agentState' AS agent_state,
           s.payload->>'creditsSource' AS credits_source
    FROM agents a LEFT JOIN snapshots s ON s.id = a.last_snapshot_id
    ORDER BY a.created_at ASC`;
  return json({ agents, database: "ok" });
});

const Body = z.object({ address: z.string(), name: z.string().max(100).optional() });

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const body = Body.safeParse(await readJson(req, 10_000));
  if (!body.success) throw new HttpError(400, "expected {address, name?}");
  const address = normalizeAddress(body.data.address);
  const sql = await db();
  const [row] = await sql`
    INSERT INTO agents (address, name, added_by) VALUES (${address}, ${body.data.name ?? null}, ${user})
    ON CONFLICT (address) DO NOTHING RETURNING address`;
  if (!row) throw new HttpError(409, "agent already registered");
  await appendAudit(sql, { actor: user, agentAddress: address, action: "register_agent", details: { name: body.data.name ?? null }, ipAddress: clientIp(req) });
  return json({ address }, { status: 201 });
});
