import { anomalyDetail } from "@/lib/detail";
import { handle, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ cve: string }> }) => {
  const { cve } = await ctx.params;
  return json(await anomalyDetail(cve));
});
