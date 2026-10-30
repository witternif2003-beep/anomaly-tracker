import { z } from "zod";
import { requireOperator } from "@/lib/auth";
import { PROMPT_STATUSES } from "@/lib/constants";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/env";
import { handle, json, readJson } from "@/lib/http";
import { promptIdParam } from "@/lib/queries";

const Body = z.object({ status: z.enum(PROMPT_STATUSES) });

export const PATCH = handle(async (req: Request, ctx: RouteContext<"/api/prompts/[id]">) => {
  await requireOperator(req);
  const id = promptIdParam((await ctx.params).id);
  if (!id) throw new HttpError(400, "prompt id required");
  const { status } = Body.parse(await readJson(req));
  const sql = await db();
  const rows = await sql`UPDATE synapse_master_prompts SET status = ${status}, updated_at = now() WHERE id = ${id} RETURNING id`;
  if (!rows.length) throw new HttpError(404, "prompt not found");
  return json({ ok: true, id, status });
});
