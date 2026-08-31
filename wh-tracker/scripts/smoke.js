"use strict";

require("dotenv").config();

const TRACKER = process.env.TRACKER_URL || "http://localhost:3000";
const PDF = process.env.PDF_SERVICE_URL || "http://localhost:4005";
const API_KEY = process.env.API_KEY || "";

const checks = [];

function record(name, ok, detail) {
  checks.push({ name, ok, detail });
  process.stdout.write(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}\n`);
}

async function json(url, options) {
  const res = await fetch(url, options);
  const body = await res.text();
  let parsed = null;
  try {
    parsed = JSON.parse(body);
  } catch {
    /* non-json response */
  }
  return { res, body, parsed };
}

async function main() {
  const health = await json(`${TRACKER}/api/health`);
  record("tracker /api/health", health.res.ok && health.parsed && health.parsed.ok === true);

  const topology = await json(`${TRACKER}/api/topology`);
  record(
    "tracker /api/topology",
    topology.res.ok && Array.isArray(topology.parsed.entities),
    `${topology.parsed ? topology.parsed.entities.length : 0} entities`
  );

  const viewer = await fetch(`${TRACKER}/`);
  const html = await viewer.text();
  record("tracker 3D viewer", viewer.ok && html.includes("WH Anomaly Tracker"));

  const three = await fetch(`${TRACKER}/vendor/three.module.js`);
  record("tracker three.js bundle", three.ok);

  const metrics = await fetch(`${TRACKER}/metrics`);
  const metricsBody = await metrics.text();
  record("tracker /metrics", metrics.ok && metricsBody.includes("wh_anomalies_total"));

  const unauthorized = await fetch(`${TRACKER}/api/anomalies`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "should be rejected" }),
  });
  record("tracker rejects unauthenticated writes", unauthorized.status === 401 || unauthorized.status === 503);

  if (API_KEY) {
    const created = await json(`${TRACKER}/api/anomalies`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": API_KEY },
      body: JSON.stringify({
        title: "Smoke test anomaly",
        severity: "low",
        score: 12,
        source: "smoke",
        entityId: "ent-treasury",
      }),
    });
    record("tracker accepts authenticated writes", created.res.status === 201);

    const invalid = await json(`${TRACKER}/api/anomalies`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": API_KEY },
      body: JSON.stringify({ title: "bad severity", severity: "nope" }),
    });
    record("tracker validates payloads", invalid.res.status === 400);
  }

  const pdfHealth = await json(`${PDF}/health`);
  record("pdf-service /health", pdfHealth.res.ok, pdfHealth.parsed ? `chrome: ${pdfHealth.parsed.chrome}` : "");

  if (API_KEY) {
    const report = await fetch(`${TRACKER}/api/report`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": API_KEY },
      body: JSON.stringify({ title: "Smoke report" }),
    });
    const buffer = Buffer.from(await report.arrayBuffer());
    record(
      "tracker /api/report renders pdf",
      report.ok && buffer.subarray(0, 4).toString() === "%PDF",
      `${buffer.length} bytes`
    );
  }

  const failed = checks.filter((c) => !c.ok);
  process.stdout.write(`\n${checks.length - failed.length}/${checks.length} checks passed\n`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  process.stderr.write(`smoke run failed: ${err.message}\n`);
  process.exit(1);
});
