import { appendAudit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/env";
import { clientIp, handle, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export const DELETE = handle(async (req: Request, ctx: RouteContext<"/api/assets/[id]">) => {
  const p = await requireRole(req, "admin");
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) throw new HttpError(400, "asset id must be numeric");
  const sql = await db();
  const removed = await sql.begin(async (tx) => {
    const incidents = await tx`DELETE FROM ops_incident WHERE asset_id = ${id} RETURNING id`;
    const [asset] = await tx`DELETE FROM ops_asset WHERE id = ${id} RETURNING *`;
    if (!asset) throw new HttpError(404, "no such asset");
    return { asset, incidents: incidents.length };
  });
  await appendAudit(sql, { actor: p.actor, role: p.role, action: "asset.deleted", subject: `asset:${id}`, details: { name: removed.asset.name, group: removed.asset.asset_group, incidents_removed: removed.incidents }, ipAddress: clientIp(req) });
  return json({ deleted: removed.asset, incidents_removed: removed.incidents });
});
