import { db } from "@/lib/db";
import { handle, json } from "@/lib/http";
import { listBatches, promptIdParam } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const url = new URL(req.url);
  const after = url.searchParams.get("after");
  const batches = await listBatches(await db(), {
    promptId: promptIdParam(url.searchParams.get("prompt")),
    afterSeq: after !== null && /^\d+$/.test(after) ? Number(after) : null,
    limit: Number(url.searchParams.get("limit") ?? 60) || 60,
  });
  return json({ batches });
});
