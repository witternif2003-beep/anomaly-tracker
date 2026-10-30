import { db } from "@/lib/db";
import { handle, json } from "@/lib/http";
import { listPrompts } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const GET = handle(async () => json({ prompts: await listPrompts(await db()) }));
