import { parseMode } from "@/lib/optimize/types";
import { suggestLive, suggestionBotStatus } from "@/lib/optimize/suggest";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const input = url.searchParams.get("input") ?? url.searchParams.get("q") ?? "";
  if (!input.trim()) {
    return Response.json(suggestionBotStatus());
  }
  return Response.json(suggestLive(input, parseMode(url.searchParams.get("mode"))));
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send a JSON body." }, { status: 400 });
  }
  const payload = body as { input?: unknown; q?: unknown; mode?: unknown };
  const input = String(payload.input ?? payload.q ?? "");
  return Response.json(suggestLive(input, parseMode(payload.mode)));
}
