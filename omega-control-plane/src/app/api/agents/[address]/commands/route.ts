import { normalizeAddress } from "@/lib/address";
import { getAgent, verifyAgentRequest } from "@/lib/agents";
import { appendAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { clientIp, handle, json } from "@/lib/http";

/** Agent-signed pull of creator-signed commands. Marks pending -> delivered. */
export const GET = handle(async (req: Request, ctx: RouteContext<"/api/agents/[address]/commands">) => {
  const address = normalizeAddress((await ctx.params).address);
  await verifyAgentRequest(req, address);
  const sql = await db();
  const agent = await getAgent(sql, address);
  const rows = await sql<{ id: string; type: string; payload: unknown; message: string; creator_signature: string; created_by: string; status: string }[]>`
    UPDATE agent_commands SET status = 'delivered', updated_at = now()
    WHERE agent_address = ${agent.address} AND status IN ('pending','delivered')
    RETURNING id, type, payload, message, creator_signature, created_by, status, created_at`;
  if (rows.length) {
    await appendAudit(sql, { actor: address, agentAddress: address, action: "commands_delivered", details: { ids: rows.map((r) => r.id) }, ipAddress: clientIp(req) });
  }
  return json({ creatorAddress: agent.creator_address, commands: rows });
});
