import { db } from "@/lib/db";
import { tick, type TickResult } from "@/lib/engine";
import { handle } from "@/lib/http";
import { listBatches, promptIdParam } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const POLL_MS = 2000;
const STREAM_MS = 240_000;

/**
 * SSE: pushes new batches (event id = batch seq, so EventSource resumes via Last-Event-ID) and,
 * while a viewer is connected, advances the engine one batch at a time when an ACTIVE prompt is due.
 */
export const GET = handle(async (req: Request, ctx: RouteContext<"/api/stream-batches/[promptId]">) => {
  const promptId = promptIdParam((await ctx.params).promptId);
  const url = new URL(req.url);
  const resume = req.headers.get("last-event-id") ?? url.searchParams.get("after");
  let lastSeq = resume && /^\d+$/.test(resume) ? Number(resume) : null;
  const sql = await db();
  if (lastSeq === null) {
    const [r] = await sql<{ m: string | null }[]>`
      SELECT max(seq) AS m FROM synapse_output_batches ${promptId ? sql`WHERE master_prompt_id = ${promptId}` : sql``}`;
    lastSeq = r.m === null ? 0 : Number(r.m);
  }

  const enc = new TextEncoder();
  const started = Date.now();
  let inflight: Promise<TickResult> | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (s: string) => {
        if (!closed) controller.enqueue(enc.encode(s));
      };
      const event = (name: string, data: unknown, id?: number) =>
        send(`${id !== undefined ? `id: ${id}\n` : ""}event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
      req.signal.addEventListener("abort", () => {
        closed = true;
      });
      send("retry: 1500\n\n");
      try {
        while (!closed && Date.now() - started < STREAM_MS) {
          const fresh = await listBatches(sql, { promptId, afterSeq: lastSeq, limit: 100 });
          for (const b of fresh) {
            lastSeq = b.seq;
            event("batch", b, b.seq);
          }
          if (!inflight) {
            inflight = tick(sql, { promptId: promptId ?? undefined })
              .then((r) => {
                if (r.ran || r.reason !== "no ACTIVE prompt is due") event("engine", r);
                return r;
              })
              .catch((err: unknown): TickResult => {
                console.error(err);
                const r: TickResult = { ran: false, reason: "engine error" };
                event("engine", r);
                return r;
              })
              .finally(() => {
                inflight = null;
              });
          }
          send(`: ping ${Date.now()}\n\n`);
          await new Promise((r) => setTimeout(r, POLL_MS));
        }
        if (inflight) await inflight;
        const tail = await listBatches(sql, { promptId, afterSeq: lastSeq, limit: 100 });
        for (const b of tail) event("batch", b, b.seq);
      } catch (err) {
        console.error(err);
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {}
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});
