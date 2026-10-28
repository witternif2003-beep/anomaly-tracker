import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { handle, json } from "@/lib/http";
import { runBatch } from "@/lib/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = handle(async () => {
  const sql = await db();
  const rows = await sql`SELECT * FROM ops_batch ORDER BY id DESC LIMIT 50`;
  return json({ batches: rows });
});

export const POST = handle(async (req: Request) => {
  const p = await requireRole(req, "operator");
  const result = await runBatch({ trigger: p.via === "cron" ? "schedule" : "manual", actor: p.actor, role: p.role });
  return json(result, { status: 201 });
});
