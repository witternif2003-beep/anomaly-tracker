"use strict";

const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const STATE_FILE = path.join(DATA_DIR, "state.json");

const SEVERITIES = ["info", "low", "medium", "high", "critical"];

const EMPTY_STATE = { entities: [], links: [], anomalies: [], updatedAt: null };

let state = null;
let writeQueue = Promise.resolve();

function load() {
  if (state) return state;
  try {
    state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    for (const key of Object.keys(EMPTY_STATE)) {
      if (state[key] === undefined) state[key] = EMPTY_STATE[key];
    }
  } catch {
    state = structuredClone(EMPTY_STATE);
    seed(state);
    persist();
  }
  return state;
}

// Baseline graph: only the upstream feeds the pipelines read from, each carrying
// its source URL. Entities beyond these come from a pipeline run, so an idle
// tracker shows the feeds it is wired to rather than invented vendors.
function seed(target) {
  const entities = [
    {
      id: "ent-eop",
      label: "Executive Office of the President",
      kind: "office",
      source: "https://api.usaspending.gov/api/v2/agency/1100/",
    },
    {
      id: "ent-treasury",
      label: "USAspending.gov",
      kind: "feed",
      source: "https://api.usaspending.gov",
    },
    {
      id: "ent-fec",
      label: "FEC Schedule A",
      kind: "feed",
      source: "https://api.open.fec.gov/v1/schedules/schedule_a/",
    },
    {
      id: "ent-otx",
      label: "AlienVault OTX",
      kind: "feed",
      source: "https://otx.alienvault.com/api/v1",
    },
  ];
  const links = [
    { id: "lnk-1", source: "ent-eop", target: "ent-treasury", kind: "spending", weight: 3 },
    { id: "lnk-2", source: "ent-eop", target: "ent-fec", kind: "filing", weight: 1 },
    { id: "lnk-3", source: "ent-eop", target: "ent-otx", kind: "feed", weight: 1 },
  ];
  target.entities = entities;
  target.links = links;
  target.anomalies = [];
  target.updatedAt = new Date().toISOString();
}

function persist() {
  const snapshot = JSON.stringify(state, null, 2);
  writeQueue = writeQueue.then(async () => {
    await fs.promises.mkdir(DATA_DIR, { recursive: true });
    const tmp = `${STATE_FILE}.${process.pid}.tmp`;
    await fs.promises.writeFile(tmp, snapshot);
    await fs.promises.rename(tmp, STATE_FILE);
  });
  return writeQueue;
}

function topology() {
  const s = load();
  return { entities: s.entities, links: s.links, updatedAt: s.updatedAt };
}

function listAnomalies({ severity, entityId, limit = 200 } = {}) {
  const s = load();
  let rows = s.anomalies;
  if (severity) rows = rows.filter((a) => a.severity === severity);
  if (entityId) rows = rows.filter((a) => a.entityId === entityId);
  return rows.slice(-limit).reverse();
}

function upsertEntity(entity) {
  const s = load();
  const existing = s.entities.find((e) => e.id === entity.id);
  if (existing) Object.assign(existing, entity);
  else s.entities.push(entity);
  s.updatedAt = new Date().toISOString();
  persist();
  return entity;
}

function upsertLink(link) {
  const s = load();
  const id = link.id || `lnk-${link.source}-${link.target}-${link.kind}`;
  const next = { ...link, id };
  const existing = s.links.find((l) => l.id === id);
  if (existing) Object.assign(existing, next);
  else s.links.push(next);
  s.updatedAt = new Date().toISOString();
  persist();
  return next;
}

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
}

function addAnomaly(input) {
  const s = load();
  if (!input || typeof input.title !== "string" || input.title.trim() === "") {
    throw new ValidationError("title is required");
  }
  const severity = input.severity || "medium";
  if (!SEVERITIES.includes(severity)) {
    throw new ValidationError(`severity must be one of ${SEVERITIES.join(", ")}`);
  }
  const score = input.score === undefined ? 0 : Number(input.score);
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    throw new ValidationError("score must be a number between 0 and 100");
  }
  const anomaly = {
    id: input.id || randomUUID(),
    title: input.title.trim(),
    severity,
    score,
    source: input.source || "manual",
    entityId: input.entityId || null,
    detail: typeof input.detail === "string" ? input.detail : "",
    evidence: Array.isArray(input.evidence) ? input.evidence : [],
    detectedAt: input.detectedAt || new Date().toISOString(),
  };
  const dupe = s.anomalies.find((a) => a.id === anomaly.id);
  if (dupe) {
    Object.assign(dupe, anomaly);
  } else {
    s.anomalies.push(anomaly);
  }
  s.updatedAt = anomaly.detectedAt;
  persist();
  return anomaly;
}

function summary() {
  const s = load();
  const bySeverity = {};
  for (const level of SEVERITIES) bySeverity[level] = 0;
  for (const a of s.anomalies) bySeverity[a.severity] = (bySeverity[a.severity] || 0) + 1;
  const scores = s.anomalies.map((a) => a.score);
  return {
    entities: s.entities.length,
    links: s.links.length,
    anomalies: s.anomalies.length,
    bySeverity,
    maxScore: scores.length ? Math.max(...scores) : 0,
    updatedAt: s.updatedAt,
  };
}

function flush() {
  return writeQueue;
}

module.exports = {
  SEVERITIES,
  ValidationError,
  DATA_DIR,
  STATE_FILE,
  topology,
  listAnomalies,
  addAnomaly,
  upsertEntity,
  upsertLink,
  summary,
  flush,
};
