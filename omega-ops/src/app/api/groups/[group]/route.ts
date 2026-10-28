import { groupDetail } from "@/lib/groups";
import { handle, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/groups/[group]">) => {
  const { group } = await ctx.params;
  const g = await groupDetail(decodeURIComponent(group));
  return json({ group: g.name, assets: g.assets, total: g.total, matched: g.matched, records: g.records });
});
