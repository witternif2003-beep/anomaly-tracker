import { env } from "@/lib/env";
import { json } from "@/lib/http";

/** Public Conway Cloud sandbox pricing (GET /v1/credits/pricing, no auth). */
export async function GET() {
  const url = `${env.conwayApiUrl}/v1/credits/pricing`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), next: { revalidate: 3600 } });
    if (!res.ok) return json({ source: url, error: `HTTP ${res.status}` }, { status: 502 });
    const data = await res.json();
    return json({ source: url, fetchedAt: new Date().toISOString(), pricing: data.pricing ?? data });
  } catch (e) {
    return json({ source: url, error: e instanceof Error ? e.message : "fetch failed" }, { status: 502 });
  }
}
