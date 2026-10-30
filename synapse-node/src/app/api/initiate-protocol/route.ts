import { z } from "zod";
import { requireOperator } from "@/lib/auth";
import { db } from "@/lib/db";
import { handle, json, readJson } from "@/lib/http";

const Body = z.object({
  prompt: z.string().trim().min(1).max(20_000),
  instruction: z.string().trim().max(4_000).default(""),
});

export const POST = handle(async (req: Request) => {
  const p = await requireOperator(req);
  const { prompt, instruction } = Body.parse(await readJson(req));
  const sql = await db();
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO synapse_master_prompts (prompt_text, instruction, created_by)
    VALUES (${prompt}, ${instruction}, ${p.actor}) RETURNING id`;
  return json({ status: "PROTOCOL INITIATED", prompt_id: row.id }, { status: 201 });
});
