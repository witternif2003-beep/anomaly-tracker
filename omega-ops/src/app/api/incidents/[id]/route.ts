import { z } from "zod";
import { appendAudit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/env";
import { clientIp, handle, json, readJson } from "@/lib/http";

const Patch = z.object({
  state: z.enum(["open", "triaged", "mitigated", "closed"]).optional(),
  priority: z.enum(["p1", "p2", "p3"]).optional(),
  assignee: z.string().trim().max(64).nullable().optional(),
  note: z.string().trim().max(2000).nullable().optional(),
});

export const PATCH = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const p = await requireRole(req, "operator");
  const { id } = await ctx.params;
  const patch = Patch.parse(await readJson(req));
  if (!Object.keys(patch).length) throw new HttpError(400, "nothing to update");
  const sql = await db();
  const [row] = await sql`
    UPDATE ops_incident SET
      state = COALESCE(${patch.state ?? null}, state),
      priority = COALESCE(${patch.priority ?? null}, priority),
      assignee = CASE WHEN ${patch.assignee !== undefined} THEN ${patch.assignee ?? null} ELSE assignee END,
      note = CASE WHEN ${patch.note !== undefined} THEN ${patch.note ?? null} ELSE note END,
      updated_at = now()
    WHERE id = ${id} RETURNING *`;
  if (!row) throw new HttpError(404, "no such incident");
  await appendAudit(sql, { actor: p.actor, role: p.role, action: "incident.updated", subject: `incident:${id}`, details: patch, ipAddress: clientIp(req) });
  return json({ incident: row });
});
