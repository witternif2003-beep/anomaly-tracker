import { normalizeAddress } from "@/lib/address";
import { getAgent } from "@/lib/agents";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/env";

export const maxDuration = 60;

/** Server-sent events: emits each new agent-signed snapshot summary (Vercel functions cannot hold WebSockets). */
export async function GET(req: Request, ctx: RouteContext<"/api/agents/[address]/telemetry">) {
  let sql: Awaited<ReturnType<typeof db>>;
  let address: string;
  try {
    address = normalizeAddress((await ctx.params).address);
    sql = await db();
    await getAgent(sql, address);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "error" }), { status });
  }
  const enc = new TextEncoder();
  let lastId = "0";
  const deadline = Date.now() + 55_000;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      send("hello", { address, retryMs: 3000 });
      while (!req.signal.aborted && Date.now() < deadline) {
        try {
          const rows = await sql`
            SELECT s.id, s.captured_at, s.received_at, s.survival_tier, s.credits_cents, s.turn_count,
                   s.payload->>'agentState' AS agent_state,
                   s.payload->'tables'->'turns'->0 AS last_turn,
                   s.payload->'tables'->'tool_calls'->0 AS last_tool_call,
                   s.payload->'tables'->'heartbeat_history'->0 AS last_heartbeat,
                   s.payload->'aggregates'->'inference_by_model' AS inference_by_model
            FROM snapshots s WHERE s.agent_address = ${address} AND s.id > ${lastId}
            ORDER BY s.id DESC LIMIT 1`;
          if (rows[0]) {
            lastId = String(rows[0].id);
            send("snapshot", rows[0]);
          } else {
            send("ping", { at: new Date().toISOString() });
          }
        } catch {
          send("error", { message: "query failed" });
        }
        await new Promise((r) => setTimeout(r, 5000));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
}
