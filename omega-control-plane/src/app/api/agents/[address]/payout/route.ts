import { z } from "zod";
import { normalizeAddress } from "@/lib/address";
import { getAgent, queueCommand } from "@/lib/agents";
import { appendAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/env";
import { clientIp, handle, json, readJson } from "@/lib/http";
import { requireUser } from "@/lib/session";

const Body = z.object({ message: z.string().max(2000), signature: z.string().regex(/^0x[0-9a-fA-F]+$/), totp: z.string().regex(/^\d{6}$/).optional() });

export const POST = handle(async (req: Request, ctx: RouteContext<"/api/agents/[address]/payout">) => {
  const user = await requireUser();
  const body = Body.safeParse(await readJson(req, 10_000));
  if (!body.success) throw new HttpError(400, "expected {message, signature}");
  const sql = await db();
  const agent = await getAgent(sql, normalizeAddress((await ctx.params).address));
  const { id, cmd } = await queueCommand(sql, agent, user, body.data, "payout");
  await appendAudit(sql, {
    actor: user,
    agentAddress: agent.address,
    action: "payout_requested",
    details: { commandId: id, amountUsd: cmd.payload.amountUsd, to: cmd.payload.to, signature: body.data.signature },
    ipAddress: clientIp(req),
  });
  return json({ commandId: id, status: "pending", note: "Sent as a USDC transfer on Base from the agent's own wallet on its next omega-sync --apply run." }, { status: 202 });
});
