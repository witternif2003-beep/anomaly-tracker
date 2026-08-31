"use strict";

require("dotenv").config();

const http = require("http");
const path = require("path");
const express = require("express");
const { WebSocketServer } = require("ws");
const { randomUUID } = require("crypto");

const store = require("./src/store");
const metrics = require("./src/metrics");
const { createLogger } = require("./src/logger");

const log = createLogger("tracker");
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const API_KEY = process.env.API_KEY || "";
const PDF_SERVICE_URL = process.env.PDF_SERVICE_URL || "http://localhost:4005";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(metrics.httpMetrics("tracker"));

function requireApiKey(req, res, next) {
  if (!API_KEY) {
    return res.status(503).json({ error: "API_KEY is not configured; mutating routes are disabled" });
  }
  const provided = req.get("x-api-key");
  if (provided !== API_KEY) return res.status(401).json({ error: "invalid api key" });
  return next();
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "wh-tracker", uptimeSeconds: Math.round(process.uptime()) });
});

app.get("/api/summary", (req, res) => {
  const sum = store.summary();
  metrics.observeSummary(sum);
  res.json(sum);
});

app.get("/api/topology", (req, res) => {
  res.json(store.topology());
});

app.get("/api/anomalies", (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 200, 1000);
  res.json({
    anomalies: store.listAnomalies({
      severity: req.query.severity,
      entityId: req.query.entityId,
      limit,
    }),
  });
});

app.post("/api/anomalies", requireApiKey, (req, res) => {
  try {
    const anomaly = store.addAnomaly(req.body);
    broadcast({ type: "anomaly", anomaly });
    metrics.observeSummary(store.summary());
    log.info("anomaly recorded", { id: anomaly.id, severity: anomaly.severity });
    res.status(201).json(anomaly);
  } catch (err) {
    if (err instanceof store.ValidationError) return res.status(400).json({ error: err.message });
    throw err;
  }
});

app.post("/api/entities", requireApiKey, (req, res) => {
  const { id, label, kind } = req.body || {};
  if (!id || !label) return res.status(400).json({ error: "id and label are required" });
  const entity = store.upsertEntity({ id, label, kind: kind || "entity" });
  broadcast({ type: "topology", topology: store.topology() });
  res.status(201).json(entity);
});

app.post("/api/links", requireApiKey, (req, res) => {
  const { source, target, kind, weight } = req.body || {};
  if (!source || !target) return res.status(400).json({ error: "source and target are required" });
  const link = store.upsertLink({ source, target, kind: kind || "link", weight: Number(weight) || 1 });
  broadcast({ type: "topology", topology: store.topology() });
  res.status(201).json(link);
});

app.post("/api/report", requireApiKey, async (req, res) => {
  const payload = {
    title: (req.body && req.body.title) || "WH Anomaly Tracker report",
    summary: store.summary(),
    anomalies: store.listAnomalies({ limit: Number(req.body && req.body.limit) || 50 }),
    topology: store.topology(),
  };
  try {
    const upstream = await fetch(`${PDF_SERVICE_URL}/render`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": API_KEY },
      body: JSON.stringify(payload),
    });
    if (!upstream.ok) {
      const detail = await upstream.text();
      log.warn("pdf service rejected render", { status: upstream.status });
      return res.status(502).json({ error: "pdf service error", status: upstream.status, detail });
    }
    const pdf = Buffer.from(await upstream.arrayBuffer());
    res.setHeader("content-type", "application/pdf");
    res.setHeader("content-disposition", `attachment; filename="wh-report-${Date.now()}.pdf"`);
    res.send(pdf);
  } catch (err) {
    log.error("pdf service unreachable", { error: err.message });
    res.status(502).json({ error: "pdf service unreachable", detail: err.message });
  }
});

app.get("/metrics", async (req, res) => {
  metrics.observeSummary(store.summary());
  res.setHeader("content-type", metrics.registry.contentType);
  res.send(await metrics.registry.metrics());
});

app.get("/vendor/three.module.js", (req, res) => {
  res.sendFile(path.join(__dirname, "node_modules", "three", "build", "three.module.js"));
});
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

app.use((req, res) => res.status(404).json({ error: "not found" }));

// eslint-disable-next-line no-unused-vars -- express identifies error handlers by arity
app.use((err, req, res, next) => {
  log.error("unhandled request error", { error: err.message, stack: err.stack });
  res.status(500).json({ error: "internal error" });
});

const server = http.createServer(app);

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim().replace(/\/$/, ""))
  .filter(Boolean);

/**
 * Browsers always send Origin on a websocket upgrade, so a cross-site page can
 * otherwise read the feed through a visitor's browser. Same-origin upgrades and
 * non-browser clients (no Origin) pass; anything else needs ALLOWED_ORIGINS.
 */
function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const normalized = origin.replace(/\/$/, "");
  if (ALLOWED_ORIGINS.includes(normalized)) return true;
  try {
    return new URL(normalized).host === req.headers.host;
  } catch {
    return false;
  }
}

const wss = new WebSocketServer({
  server,
  path: "/ws",
  verifyClient: ({ req }, done) => {
    if (originAllowed(req)) return done(true);
    log.warn("websocket upgrade rejected", { origin: req.headers.origin });
    return done(false, 403, "origin not allowed");
  },
});

function broadcast(message) {
  const data = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(data);
  }
}

wss.on("connection", (socket) => {
  socket.id = randomUUID();
  socket.isAlive = true;
  metrics.wsClients.set(wss.clients.size);
  socket.on("pong", () => {
    socket.isAlive = true;
  });
  socket.on("close", () => metrics.wsClients.set(wss.clients.size));
  socket.send(
    JSON.stringify({
      type: "snapshot",
      topology: store.topology(),
      anomalies: store.listAnomalies({ limit: 50 }),
      summary: store.summary(),
    })
  );
});

const heartbeat = setInterval(() => {
  for (const socket of wss.clients) {
    if (!socket.isAlive) {
      socket.terminate();
      continue;
    }
    socket.isAlive = false;
    socket.ping();
  }
  metrics.wsClients.set(wss.clients.size);
}, 30000);

server.listen(PORT, HOST, () => {
  log.info("tracker listening", { url: `http://${HOST}:${PORT}` });
});

function shutdown(signal) {
  log.info("shutting down", { signal });
  clearInterval(heartbeat);
  for (const socket of wss.clients) socket.close(1001, "server shutting down");
  server.close(async () => {
    await store.flush();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 8000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

module.exports = { app, server, broadcast };
