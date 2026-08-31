import {
  readState,
  snapshot,
  addAnomaly,
  upsertEntity,
  validateAnomaly,
  requireApiKey,
  applyCors,
} from "../lib/store.js";

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method === "GET") {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const state = await readState();
    res.setHeader("cache-control", "no-store");
    res.status(200).json(snapshot(state, { limit }));
    return;
  }

  if (req.method === "POST") {
    if (!requireApiKey(req, res)) return;
    const body = typeof req.body === "string" ? safeParse(req.body) : req.body;
    const invalid = validateAnomaly(body);
    if (invalid) {
      res.status(400).json({ error: invalid });
      return;
    }
    if (body.entityId) {
      const state = await readState();
      if (!state.entities.some((e) => e.id === body.entityId)) {
        await upsertEntity({ id: body.entityId, label: body.entityId, kind: "unknown" });
      }
    }
    const anomaly = await addAnomaly(body);
    res.status(201).json({ anomaly });
    return;
  }

  res.setHeader("allow", "GET, POST, OPTIONS");
  res.status(405).json({ error: "method not allowed" });
}

function safeParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
