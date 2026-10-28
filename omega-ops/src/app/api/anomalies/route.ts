import { db } from "@/lib/db";
import { FINDING_COLUMNS } from "@/lib/findings";
import { handle, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const url = new URL(req.url);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));
  const q = (url.searchParams.get("q") ?? "").trim();
  const sql = await db();
  const rows = q
    ? await sql.unsafe(
        `SELECT ${FINDING_COLUMNS} FROM ops_finding
         WHERE cve_id ILIKE $1 OR vendor ILIKE $1 OR product ILIKE $1 OR title ILIKE $1
         ORDER BY exposure_score DESC NULLS LAST LIMIT $2`,
        [`%${q}%`, limit],
      )
    : await sql.unsafe(`SELECT ${FINDING_COLUMNS} FROM ops_finding ORDER BY anomaly_no DESC LIMIT $1`, [limit]);
  return json({ anomalies: rows });
});
