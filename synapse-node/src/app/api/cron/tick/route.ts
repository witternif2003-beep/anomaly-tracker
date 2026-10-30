import { requireOperator } from "@/lib/auth";
import { db } from "@/lib/db";
import { tick } from "@/lib/engine";
import { handle, json } from "@/lib/http";

export const maxDuration = 300;

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. */
export const GET = handle(async (req: Request) => {
  await requireOperator(req);
  return json(await tick(await db()));
});
