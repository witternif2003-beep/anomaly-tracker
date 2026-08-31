// Not mounted under src/app/api: compileAnomalyTracker walks the repo at request time
// (server/scout-code-integrity.ts), which no serverless bundle can carry. The client reads
// the prebaked public/static/anomaly.json instead; the Express server exposes GET /v1/anomaly.
import { compileAnomalyTracker } from "../../anomaly-tracker";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? undefined;
  const categoryId = url.searchParams.get("categoryId") ?? undefined;
  const priority = url.searchParams.get("priority") ?? undefined;
  const improvementLimit = url.searchParams.get("improvementLimit");
  const improvementOffset = url.searchParams.get("improvementOffset");
  return Response.json(
    compileAnomalyTracker({
      q,
      categoryId,
      priority,
      improvementLimit: improvementLimit ? Number(improvementLimit) : undefined,
      improvementOffset: improvementOffset ? Number(improvementOffset) : undefined,
    }),
  );
}
