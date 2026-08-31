// Server-sent events instead of a websocket: Vercel functions are request-scoped,
// so the stream sends a snapshot, then polls for changes and pushes only when
// `updatedAt` moves. The function closes itself before the platform timeout and
// the viewer's EventSource reconnects automatically.

import { readState, snapshot, applyCors } from "../../lib/store.js";

const POLL_MS = Number(process.env.SSE_POLL_MS || 2000);
const MAX_DURATION_S = Number(process.env.SSE_MAX_DURATION_S || 50);

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });

  let closed = false;
  req.on("close", () => {
    closed = true;
  });

  const send = (type, data) => {
    res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  let state = await readState();
  let lastUpdatedAt = state.updatedAt;
  send("snapshot", snapshot(state));

  const deadline = Date.now() + MAX_DURATION_S * 1000;

  while (!closed && Date.now() < deadline) {
    await sleep(POLL_MS);
    if (closed) break;
    try {
      state = await readState();
    } catch (err) {
      send("error", { error: err.message });
      continue;
    }
    if (state.updatedAt !== lastUpdatedAt) {
      lastUpdatedAt = state.updatedAt;
      send("snapshot", snapshot(state));
    } else {
      res.write(": keep-alive\n\n");
    }
  }

  if (!closed) {
    send("reconnect", { reason: "function duration limit" });
    res.end();
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
