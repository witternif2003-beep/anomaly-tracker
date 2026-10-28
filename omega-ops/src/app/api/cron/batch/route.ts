import { requireRole } from "@/lib/auth";
import { handle, json } from "@/lib/http";
import { runBatch } from "@/lib/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Vercel's scheduler calls this with the CRON_SECRET bearer token. */
export const GET = handle(async (req: Request) => {
  const p = await requireRole(req, "operator");
  const result = await runBatch({ trigger: "schedule", actor: p.actor, role: p.role });
  return json(result);
});
