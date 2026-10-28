import { groupSummaries } from "@/lib/groups";
import { handle, json } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = handle(async () => json({ groups: await groupSummaries() }));
