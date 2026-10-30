import { db } from "@/lib/db";
import { handle, json } from "@/lib/http";
import { promptIdParam, telemetrySummary } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) =>
  json(await telemetrySummary(await db(), promptIdParam(new URL(req.url).searchParams.get("prompt")))),
);
