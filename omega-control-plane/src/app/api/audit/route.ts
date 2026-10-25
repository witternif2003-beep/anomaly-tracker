import { verifyAuditRows, type AuditRow } from "@/lib/audit";
import { db, hasDb } from "@/lib/db";
import { handle, json } from "@/lib/http";

export const GET = handle(async (req: Request) => {
  if (!hasDb()) return json({ database: "not_configured", rows: [], verification: null });
  const sql = await db();
  const agent = new URL(req.url).searchParams.get("agent");
  const all = await sql<AuditRow[]>`SELECT * FROM audit_log ORDER BY seq ASC`;
  const verification = verifyAuditRows(all);
  const rows = (agent ? all.filter((r) => r.agent_address?.toLowerCase() === agent.toLowerCase()) : all).slice(-300).reverse();
  return json({ verification, rows });
});
