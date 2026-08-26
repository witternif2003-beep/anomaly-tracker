import { compileAnomalyTracker } from "../../../../server/anomaly-tracker";

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
