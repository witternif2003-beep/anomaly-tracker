import { z } from "zod";
import { normalizeAddress } from "@/lib/address";
import { getAgent, validateCommand } from "@/lib/agents";
import { appendAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/env";
import { clientIp, handle, json, readJson } from "@/lib/http";
import { checkSecondFactor } from "@/lib/second-factor";
import { requireUser } from "@/lib/session";

const Body = z.object({ message: z.string().max(2000), signature: z.string().regex(/^0x[0-9a-fA-F]+$/), totp: z.string().regex(/^\d{6}$/).optional() });

export const POST = handle(async (req: Request, ctx: RouteContext<"/api/agents/[address]/topup">) => {
  const user = await requireUser();
  const body = Body.safeParse(await readJson(req, 10_000));
  if (!body.success) throw new HttpError(400, "expected {message, signature}");
  const sql = await db();
  await checkSecondFactor(sql, user, body.data.totp);
  const agent = await getAgent(sql, normalizeAddress((await ctx.params).address));
  const cmd = await validateCommand(sql, agent, user, body.data.message, body.data.signature, "topup");
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO agent_commands (agent_address, type, payload, message, creator_signature, created_by)
    VALUES (${agent.address}, 'topup', ${sql.json(cmd.payload as never)}, ${body.data.message}, ${body.data.signature}, ${user})
    RETURNING id`;
  await appendAudit(sql, {
    actor: user,
    agentAddress: agent.address,
    action: "topup_requested",
    details: { commandId: row.id, amountUsd: cmd.payload.amountUsd, signature: body.data.signature },
    ipAddress: clientIp(req),
  });
  return json({ commandId: row.id, status: "pending", note: "Executed by the agent's own wallet via x402 on its next omega-sync --apply run." }, { status: 202 });
});
