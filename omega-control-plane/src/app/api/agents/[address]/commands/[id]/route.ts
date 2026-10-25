import { verifyMessage, type Hex } from "viem";
import { z } from "zod";
import { normalizeAddress } from "@/lib/address";
import { getAgent } from "@/lib/agents";
import { appendAudit } from "@/lib/audit";
import { ackMessage } from "@/lib/command-message";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/env";
import { sha256Hex } from "@/lib/hash";
import { clientIp, handle, json, readJson } from "@/lib/http";

const Body = z.object({ payload: z.string().max(20_000), signature: z.string().regex(/^0x[0-9a-fA-F]+$/) });
const Ack = z.object({ commandId: z.string(), status: z.enum(["applied", "failed", "rejected"]), result: z.record(z.string(), z.unknown()), at: z.string().datetime() });

/** Agent-signed acknowledgement of a command outcome. */
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/agents/[address]/commands/[id]">) => {
  const params = await ctx.params;
  const address = normalizeAddress(params.address);
  const body = Body.safeParse(await readJson(req, 30_000));
  if (!body.success) throw new HttpError(400, "expected {payload, signature}");
  const ok = await verifyMessage({ address, message: ackMessage(sha256Hex(body.data.payload)), signature: body.data.signature as Hex }).catch(() => false);
  if (!ok) throw new HttpError(401, "ack signature does not recover to agent wallet");
  const ack = Ack.safeParse(JSON.parse(body.data.payload));
  if (!ack.success || ack.data.commandId !== params.id) throw new HttpError(400, "invalid ack payload");
  if (Math.abs(Date.now() - Date.parse(ack.data.at)) > 600_000) throw new HttpError(400, "ack outside 10 min window");
  const sql = await db();
  await getAgent(sql, address);
  const [row] = await sql`
    UPDATE agent_commands SET status = ${ack.data.status}, result = ${sql.json(ack.data.result as never)}, updated_at = now()
    WHERE id = ${params.id} AND agent_address = ${address} AND status = 'delivered' RETURNING id, type`;
  if (!row) throw new HttpError(409, "command not in delivered state");
  await appendAudit(sql, {
    actor: address,
    agentAddress: address,
    action: `command_${ack.data.status}`,
    details: { commandId: params.id, type: row.type, result: ack.data.result, signature: body.data.signature },
    ipAddress: clientIp(req),
  });
  return json({ id: params.id, status: ack.data.status });
});
