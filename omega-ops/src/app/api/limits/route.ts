import { z } from "zod";
import { appendAudit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { clientIp, handle, json, readJson } from "@/lib/http";

const Body = z.object({ key: z.enum(["batch_max", "daily_max"]), units: z.number().min(0).max(100000) });

export const PUT = handle(async (req: Request) => {
  const p = await requireRole(req, "admin");
  const { key, units } = Body.parse(await readJson(req));
  const sql = await db();
  const [row] = await sql`
    INSERT INTO ops_limit (key, units, updated_by) VALUES (${key}, ${units}, ${p.actor})
    ON CONFLICT (key) DO UPDATE SET units = EXCLUDED.units, updated_at = now(), updated_by = EXCLUDED.updated_by RETURNING *`;
  await appendAudit(sql, { actor: p.actor, role: p.role, action: "limit.updated", subject: `limit:${key}`, details: { units }, ipAddress: clientIp(req) });
  return json({ limit: row });
});
