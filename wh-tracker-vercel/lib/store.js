// Shared state for the serverless viewer.
//
// Vercel functions do not share memory between invocations, so state is persisted
// to Neon Postgres when `DATABASE_URL` is set. Without it the module falls back to
// a per-instance in-memory copy: fine for a demo deploy, but writes are then only
// visible to the instance that served them.

import { neon } from "@neondatabase/serverless";

const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;

export const store = sql ? "neon" : "memory";

const SEVERITIES = ["info", "low", "medium", "high", "critical"];
const SEVERITY_RANK = { info: 1, low: 2, medium: 3, high: 4, critical: 5 };

function seed() {
  return {
    updatedAt: new Date().toISOString(),
    entities: [
      { id: "ent-wh", label: "Executive Office of the President", kind: "office" },
      { id: "ent-treasury", label: "USAspending.gov", kind: "agency" },
      { id: "ent-otx", label: "AlienVault OTX", kind: "feed" },
    ],
    links: [
      { source: "ent-wh", target: "ent-treasury", kind: "spending", weight: 3 },
      { source: "ent-wh", target: "ent-otx", kind: "feed", weight: 1 },
    ],
    anomalies: [],
  };
}

let schemaReady = false;

async function ensureSchema() {
  if (schemaReady) return;
  await sql`create table if not exists wh_state (
    id text primary key,
    state jsonb not null,
    updated_at timestamptz not null default now()
  )`;
  schemaReady = true;
}

function memory() {
  if (!globalThis.__whTrackerState) globalThis.__whTrackerState = seed();
  return globalThis.__whTrackerState;
}

export async function readState() {
  if (!sql) return memory();
  await ensureSchema();
  const rows = await sql`select state from wh_state where id = 'singleton'`;
  if (rows.length) return rows[0].state;
  const fresh = seed();
  await sql`insert into wh_state (id, state) values ('singleton', ${JSON.stringify(fresh)})
            on conflict (id) do nothing`;
  return fresh;
}

async function writeState(state) {
  state.updatedAt = new Date().toISOString();
  if (!sql) {
    globalThis.__whTrackerState = state;
    return state;
  }
  await ensureSchema();
  await sql`insert into wh_state (id, state, updated_at) values ('singleton', ${JSON.stringify(state)}, now())
            on conflict (id) do update set state = excluded.state, updated_at = now()`;
  return state;
}

export function summarize(state) {
  const bySeverity = Object.fromEntries(SEVERITIES.map((s) => [s, 0]));
  let maxScore = 0;
  for (const anomaly of state.anomalies) {
    bySeverity[anomaly.severity] = (bySeverity[anomaly.severity] || 0) + 1;
    maxScore = Math.max(maxScore, anomaly.score || 0);
  }
  return {
    entities: state.entities.length,
    links: state.links.length,
    anomalies: state.anomalies.length,
    bySeverity,
    maxScore,
    updatedAt: state.updatedAt,
    store,
  };
}

export function snapshot(state, { limit = 50 } = {}) {
  return {
    topology: { entities: state.entities, links: state.links },
    anomalies: state.anomalies.slice(0, limit),
    summary: summarize(state),
  };
}

export function validateAnomaly(input) {
  if (!input || typeof input !== "object") return "body must be a JSON object";
  if (!input.title || typeof input.title !== "string") return "title is required";
  if (!SEVERITIES.includes(input.severity)) {
    return `severity must be one of ${SEVERITIES.join(", ")}`;
  }
  const score = Number(input.score);
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    return "score must be a number between 0 and 100";
  }
  return null;
}

/** Adds an anomaly, replacing any existing entry with the same id. */
export async function addAnomaly(anomaly) {
  const state = await readState();
  const record = {
    id: anomaly.id || `anom-${Date.now().toString(36)}`,
    title: anomaly.title,
    severity: anomaly.severity,
    score: Number(anomaly.score),
    source: anomaly.source || "manual",
    entityId: anomaly.entityId || null,
    detail: anomaly.detail || "",
    evidence: Array.isArray(anomaly.evidence) ? anomaly.evidence : [],
    detectedAt: anomaly.detectedAt || new Date().toISOString(),
  };
  state.anomalies = [record, ...state.anomalies.filter((a) => a.id !== record.id)].slice(0, 200);
  await writeState(state);
  return record;
}

export async function upsertEntity(entity) {
  const state = await readState();
  const existing = state.entities.find((e) => e.id === entity.id);
  if (existing) Object.assign(existing, entity);
  else state.entities.push(entity);
  await writeState(state);
  return entity;
}

export async function upsertLink(link) {
  const state = await readState();
  const existing = state.links.find((l) => l.source === link.source && l.target === link.target);
  if (existing) Object.assign(existing, link);
  else state.links.push(link);
  await writeState(state);
  return link;
}

export function severityRank(severity) {
  return SEVERITY_RANK[severity] || 0;
}

/**
 * CORS is opt-in: `ALLOWED_ORIGINS` is a comma-separated allowlist, `*` opens the
 * API to every site. Unlisted origins get no CORS header, so browsers block them.
 */
export function applyCors(req, res) {
  const allowed = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);
  const origin = (req.headers.origin || "").replace(/\/$/, "");

  if (allowed.includes("*")) res.setHeader("access-control-allow-origin", "*");
  else if (origin && allowed.includes(origin)) {
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("vary", "origin");
  }

  res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type, x-api-key");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}

export function requireApiKey(req, res) {
  const expected = process.env.API_KEY;
  if (!expected) {
    res.status(503).json({ error: "API_KEY is not configured" });
    return false;
  }
  if (req.headers["x-api-key"] !== expected) {
    res.status(401).json({ error: "invalid or missing X-API-Key" });
    return false;
  }
  return true;
}
