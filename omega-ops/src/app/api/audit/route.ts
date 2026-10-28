import { type AuditRow, verifyAuditRows } from "@/lib/audit";
import { db } from "@/lib/db";
import { handle, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const limit = Math.min(500, Math.max(1, Number(new URL(req.url).searchParams.get("limit") ?? 100)));
  const sql = await db();
  const all = await sql<AuditRow[]>`SELECT * FROM ops_audit ORDER BY seq`;
  const verification = verifyAuditRows(Array.from(all));
  return json({ verification, entries: Array.from(all).slice(-limit).reverse() });
});
