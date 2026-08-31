"use strict";

require("dotenv").config();

const http = require("http");

const metrics = require("./metrics");
const { createLogger } = require("./logger");
const { createTrackerClient } = require("./tracker-client");
const fec = require("../fec-taxii-pipeline");
const treasury = require("./treasury-api");
const otx = require("./otx-enrichment");

const log = createLogger("scheduler");
const SCHEDULER_PORT = Number(process.env.SCHEDULER_PORT || 4010);

const PIPELINES = [
  {
    name: "fec",
    intervalMinutes: Number(process.env.FEC_INTERVAL_MINUTES || 360),
    enabled: () => Boolean(process.env.FEC_API_KEY && process.env.FEC_COMMITTEE_IDS),
    run: (tracker) => fec.run({ tracker }),
  },
  {
    name: "treasury",
    intervalMinutes: Number(process.env.TREASURY_INTERVAL_MINUTES || 720),
    enabled: () => process.env.TREASURY_ENABLED !== "false",
    run: (tracker) => treasury.run({ tracker }),
  },
  {
    name: "otx",
    intervalMinutes: Number(process.env.OTX_INTERVAL_MINUTES || 180),
    enabled: () => Boolean(process.env.OTX_API_KEY && process.env.OTX_INDICATORS),
    run: (tracker) => otx.run({ tracker }),
  },
];

const lastRun = new Map();

async function runPipeline(pipeline, tracker) {
  if (!pipeline.enabled()) {
    log.warn("pipeline skipped: missing configuration", { pipeline: pipeline.name });
    metrics.pipelineRuns.inc({ pipeline: pipeline.name, result: "skipped" });
    lastRun.set(pipeline.name, { at: new Date().toISOString(), result: "skipped" });
    return "skipped";
  }
  const end = metrics.pipelineDuration.startTimer({ pipeline: pipeline.name });
  try {
    const result = await pipeline.run(tracker);
    metrics.pipelineRuns.inc({ pipeline: pipeline.name, result: "ok" });
    metrics.pipelineLastSuccess.set({ pipeline: pipeline.name }, Date.now() / 1000);
    lastRun.set(pipeline.name, { at: new Date().toISOString(), result: "ok", detail: summarize(result) });
    log.info("pipeline ok", { pipeline: pipeline.name, ...summarize(result) });
    return "ok";
  } catch (err) {
    metrics.pipelineRuns.inc({ pipeline: pipeline.name, result: "error" });
    lastRun.set(pipeline.name, { at: new Date().toISOString(), result: "error", detail: err.message });
    log.error("pipeline failed", { pipeline: pipeline.name, error: err.message });
    return "error";
  } finally {
    end();
  }
}

function summarize(result) {
  if (!result || typeof result !== "object") return {};
  const { anomalies, committees, recipients, indicators } = result;
  return { anomalies, committees, recipients, indicators };
}

/**
 * Publish a series for every enabled pipeline so freshness alerts can fire
 * before the first successful run.
 */
function markEnabledPipelines() {
  for (const pipeline of PIPELINES) {
    metrics.pipelineEnabled.set({ pipeline: pipeline.name }, pipeline.enabled() ? 1 : 0);
  }
  metrics.schedulerStart.set(Date.now() / 1000);
}

function scheduleAll(tracker) {
  const timers = [];
  for (const pipeline of PIPELINES) {
    const intervalMs = Math.max(1, pipeline.intervalMinutes) * 60000;
    // Jitter the first run so all pipelines do not hit upstream APIs at once.
    const startDelay = Math.floor(Math.random() * 30000) + 5000;
    timers.push(
      setTimeout(() => {
        runPipeline(pipeline, tracker);
        timers.push(setInterval(() => runPipeline(pipeline, tracker), intervalMs));
      }, startDelay)
    );
    log.info("pipeline scheduled", { pipeline: pipeline.name, intervalMinutes: pipeline.intervalMinutes });
  }
  return timers;
}

function startStatusServer() {
  const server = http.createServer(async (req, res) => {
    if (req.url === "/metrics") {
      res.setHeader("content-type", metrics.registry.contentType);
      res.end(await metrics.registry.metrics());
      return;
    }
    if (req.url === "/health") {
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          ok: true,
          service: "wh-pipeline-scheduler",
          pipelines: PIPELINES.map((p) => ({
            name: p.name,
            intervalMinutes: p.intervalMinutes,
            enabled: p.enabled(),
            lastRun: lastRun.get(p.name) || null,
          })),
        })
      );
      return;
    }
    res.statusCode = 404;
    res.end('{"error":"not found"}');
  });
  server.listen(SCHEDULER_PORT, process.env.HOST || "0.0.0.0", () =>
    log.info("scheduler status listening", { port: SCHEDULER_PORT })
  );
  return server;
}

async function main() {
  const tracker = createTrackerClient({});
  const once = process.argv.includes("--once");
  const only = process.argv.find((a) => a.startsWith("--pipeline="));
  const selected = only ? only.split("=")[1] : null;

  if (once) {
    let failed = false;
    for (const pipeline of PIPELINES) {
      if (selected && pipeline.name !== selected) continue;
      if ((await runPipeline(pipeline, tracker)) === "error") failed = true;
    }
    if (failed) process.exitCode = 1;
    return;
  }

  const server = startStatusServer();
  markEnabledPipelines();
  const timers = scheduleAll(tracker);
  const shutdown = () => {
    for (const timer of timers) {
      clearTimeout(timer);
      clearInterval(timer);
    }
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

if (require.main === module) {
  main().catch((err) => {
    log.error("scheduler crashed", { error: err.message });
    process.exit(1);
  });
}

module.exports = { PIPELINES, runPipeline, scheduleAll, markEnabledPipelines };
