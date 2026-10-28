import { db } from "@/lib/db";
import { handle, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const state = new URL(req.url).searchParams.get("state");
  const sql = await db();
  const rows = await sql`
    SELECT i.*, f.vendor, f.product, f.title, f.exposure_score, f.anomaly_no, f.cvss, f.epss
    FROM ops_incident i JOIN ops_finding f ON f.cve_id = i.cve_id
    ${state ? sql`WHERE i.state = ${state}` : sql``}
    ORDER BY CASE i.priority WHEN 'p1' THEN 1 WHEN 'p2' THEN 2 ELSE 3 END, f.exposure_score DESC NULLS LAST
    LIMIT 200`;
  return json({ incidents: rows });
});
