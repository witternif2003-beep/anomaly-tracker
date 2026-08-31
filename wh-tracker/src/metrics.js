"use strict";

const client = require("prom-client");

const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

const httpRequests = new client.Counter({
  name: "wh_http_requests_total",
  help: "HTTP requests handled",
  labelNames: ["service", "method", "route", "status"],
  registers: [registry],
});

const httpDuration = new client.Histogram({
  name: "wh_http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["service", "method", "route", "status"],
  buckets: [0.01, 0.05, 0.1, 0.3, 1, 3, 10],
  registers: [registry],
});

const anomalies = new client.Gauge({
  name: "wh_anomalies_total",
  help: "Tracked anomalies by severity",
  labelNames: ["severity"],
  registers: [registry],
});

const anomalyScoreMax = new client.Gauge({
  name: "wh_anomaly_score_max",
  help: "Highest anomaly score currently tracked",
  registers: [registry],
});

const topologyNodes = new client.Gauge({
  name: "wh_topology_nodes",
  help: "Entities in the topology graph",
  registers: [registry],
});

const topologyEdges = new client.Gauge({
  name: "wh_topology_edges",
  help: "Links in the topology graph",
  registers: [registry],
});

const wsClients = new client.Gauge({
  name: "wh_ws_clients",
  help: "Connected websocket clients",
  registers: [registry],
});

const pipelineRuns = new client.Counter({
  name: "wh_pipeline_runs_total",
  help: "Pipeline executions",
  labelNames: ["pipeline", "result"],
  registers: [registry],
});

const pipelineDuration = new client.Histogram({
  name: "wh_pipeline_duration_seconds",
  help: "Pipeline execution duration in seconds",
  labelNames: ["pipeline"],
  buckets: [0.5, 2, 5, 15, 60, 300],
  registers: [registry],
});

const pipelineLastSuccess = new client.Gauge({
  name: "wh_pipeline_last_success_timestamp_seconds",
  help: "Unix timestamp of the last successful pipeline run",
  labelNames: ["pipeline"],
  registers: [registry],
});

const pipelineEnabled = new client.Gauge({
  name: "wh_pipeline_enabled",
  help: "1 when a pipeline is configured to run, 0 when it is skipped",
  labelNames: ["pipeline"],
  registers: [registry],
});

const schedulerStart = new client.Gauge({
  name: "wh_scheduler_start_timestamp_seconds",
  help: "Unix timestamp of the last scheduler start",
  registers: [registry],
});

const upstreamErrors = new client.Counter({
  name: "wh_upstream_errors_total",
  help: "Errors returned by upstream open-data APIs",
  labelNames: ["upstream"],
  registers: [registry],
});

const pdfReports = new client.Counter({
  name: "wh_pdf_reports_total",
  help: "PDF reports rendered",
  labelNames: ["result"],
  registers: [registry],
});

const pdfDuration = new client.Histogram({
  name: "wh_pdf_render_duration_seconds",
  help: "PDF render duration in seconds",
  buckets: [0.5, 1, 3, 10, 30],
  registers: [registry],
});

function httpMetrics(service) {
  return function middleware(req, res, next) {
    const end = httpDuration.startTimer();
    res.on("finish", () => {
      const route = req.route ? req.baseUrl + req.route.path : "unmatched";
      const labels = {
        service,
        method: req.method,
        route,
        status: String(res.statusCode),
      };
      end(labels);
      httpRequests.inc(labels);
    });
    next();
  };
}

function observeSummary(sum) {
  for (const [severity, count] of Object.entries(sum.bySeverity)) {
    anomalies.set({ severity }, count);
  }
  anomalyScoreMax.set(sum.maxScore);
  topologyNodes.set(sum.entities);
  topologyEdges.set(sum.links);
}

module.exports = {
  registry,
  httpMetrics,
  observeSummary,
  wsClients,
  pipelineRuns,
  pipelineDuration,
  pipelineLastSuccess,
  pipelineEnabled,
  schedulerStart,
  upstreamErrors,
  pdfReports,
  pdfDuration,
};
