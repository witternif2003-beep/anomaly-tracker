import { z } from "zod";
import { appendAudit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { clientIp, handle, json, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

const Asset = z.object({
  name: z.string().trim().min(1).max(120),
  class: z.enum(["service", "host", "appliance", "library", "pipeline"]).default("service"),
  vendor: z.string().trim().max(120).nullable().default(null),
  product: z.string().trim().max(160).nullable().default(null),
  criticality: z.enum(["standard", "elevated", "critical"]).default("standard"),
  owner: z.string().trim().max(64).nullable().default(null),
  group: z.string().trim().min(1).max(80).nullable().default(null),
});

export const GET = handle(async () => {
  const sql = await db();
  const rows = await sql`
    SELECT a.*, (
      SELECT count(*) FROM ops_finding f
      WHERE lower(COALESCE(f.product, '')) = lower(COALESCE(a.product, '~')) OR lower(COALESCE(f.vendor, '')) = lower(COALESCE(a.vendor, '~'))
    ) AS matched_anomalies
    FROM ops_asset a ORDER BY a.id DESC LIMIT 200`;
  return json({ assets: rows });
});

export const POST = handle(async (req: Request) => {
  const p = await requireRole(req, "operator");
  const a = Asset.parse(await readJson(req));
  const sql = await db();
  const [row] = await sql`
    INSERT INTO ops_asset (name, class, vendor, product, criticality, owner, asset_group, created_by)
    VALUES (${a.name}, ${a.class}, ${a.vendor}, ${a.product}, ${a.criticality}, ${a.owner}, ${a.group}, ${p.actor}) RETURNING *`;
  await appendAudit(sql, { actor: p.actor, role: p.role, action: "asset.created", subject: `asset:${row.id}`, details: a, ipAddress: clientIp(req) });
  return json({ asset: row }, { status: 201 });
});
