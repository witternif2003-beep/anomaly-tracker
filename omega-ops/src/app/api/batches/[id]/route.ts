import { db } from "@/lib/db";
import { HttpError } from "@/lib/env";
import { FINDING_COLUMNS } from "@/lib/findings";
import { handle, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const sql = await db();
  const [batch] = await sql`SELECT * FROM ops_batch WHERE id = ${id}`;
  if (!batch) throw new HttpError(404, "no such batch");
  const stages = await sql`SELECT * FROM ops_stage WHERE batch_id = ${id} ORDER BY id`;
  const anomalies = await sql.unsafe(`SELECT ${FINDING_COLUMNS} FROM ops_finding WHERE last_seen_batch = $1 ORDER BY exposure_score DESC NULLS LAST`, [id]);
  return json({ batch, stages, anomalies });
});
