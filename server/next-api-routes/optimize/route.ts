import { optimize } from "@/lib/optimize";
import { parseMode } from "@/lib/optimize/types";
import type { OptimizeRequest } from "@/lib/optimize";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send a JSON body." }, { status: 400 });
  }

  const payload = body as Partial<OptimizeRequest>;
  if (typeof payload.input !== "string") {
    return Response.json({ error: "Field `input` is required." }, { status: 400 });
  }

  try {
    const result = optimize({
      input: payload.input,
      mode: parseMode(payload.mode),
      requestType: payload.requestType ?? "auto",
      platform: payload.platform ?? "chatgpt",
      answers: payload.answers,
      skipQuestions: Boolean(payload.skipQuestions),
    });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Optimization failed.";
    return Response.json({ error: message }, { status: 400 });
  }
}
