import { principal } from "@/lib/auth";
import { handle, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => json(await principal(req)));
