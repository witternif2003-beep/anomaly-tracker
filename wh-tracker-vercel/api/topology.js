import { readState, snapshot, applyCors } from "../lib/store.js";

// Read-only snapshot for clients that cannot hold an SSE connection (corporate
// proxies that buffer text/event-stream, mobile radios, curl polling).
export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method !== "GET") {
    res.setHeader("allow", "GET, OPTIONS");
    res.status(405).json({ error: "method not allowed" });
    return;
  }

  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const state = await readState();
  res.setHeader("cache-control", "no-store");
  res.status(200).json(snapshot(state, { limit }));
}
