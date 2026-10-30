import { requireOperator } from "@/lib/auth";
import { db } from "@/lib/db";
import { tick } from "@/lib/engine";
import { handle, json } from "@/lib/http";
import { promptIdParam } from "@/lib/queries";

export const maxDuration = 300;

/** Operator "run batch now": ignores the batch interval, still honours the lease and daily cap. */
export const POST = handle(async (req: Request) => {
  await requireOperator(req);
  const promptId = promptIdParam(new URL(req.url).searchParams.get("prompt")) ?? undefined;
  return json(await tick(await db(), { promptId, force: true }));
});
