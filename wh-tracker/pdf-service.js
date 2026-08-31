"use strict";

require("dotenv").config();

const fs = require("fs");
const express = require("express");
const puppeteer = require("puppeteer-core");

const metrics = require("./src/metrics");
const { createLogger } = require("./src/logger");

const log = createLogger("pdf-service");
const PORT = Number(process.env.PDF_PORT || 4005);
const HOST = process.env.HOST || "0.0.0.0";
const API_KEY = process.env.API_KEY || "";
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
].filter(Boolean);

function resolveChrome() {
  return CHROME_CANDIDATES.find((candidate) => {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "4mb" }));
app.use(metrics.httpMetrics("pdf-service"));

app.get("/health", (req, res) => {
  const chrome = resolveChrome();
  res.json({ ok: Boolean(chrome), service: "wh-pdf-service", chrome: chrome || null });
});

app.get("/metrics", async (req, res) => {
  res.setHeader("content-type", metrics.registry.contentType);
  res.send(await metrics.registry.metrics());
});

function requireApiKey(req, res, next) {
  if (!API_KEY) return res.status(503).json({ error: "API_KEY is not configured" });
  if (req.get("x-api-key") !== API_KEY) return res.status(401).json({ error: "invalid api key" });
  return next();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function renderHtml(payload) {
  const summary = payload.summary || {};
  const bySeverity = summary.bySeverity || {};
  const anomalies = Array.isArray(payload.anomalies) ? payload.anomalies : [];
  const rows = anomalies
    .map(
      (a) => `<tr>
        <td>${escapeHtml(a.detectedAt)}</td>
        <td class="sev sev-${escapeHtml(a.severity)}">${escapeHtml(a.severity)}</td>
        <td>${escapeHtml(a.score)}</td>
        <td>${escapeHtml(a.title)}</td>
        <td>${escapeHtml(a.entityId || "-")}</td>
        <td>${escapeHtml(a.source)}</td>
      </tr>`
    )
    .join("\n");
  const severityCells = Object.entries(bySeverity)
    .map(([level, count]) => `<li><span>${escapeHtml(level)}</span><strong>${escapeHtml(count)}</strong></li>`)
    .join("\n");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(payload.title)}</title>
<style>
  :root { color-scheme: light; }
  body { font: 12px/1.5 -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #10151c; margin: 32px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .meta { color: #5b6673; margin-bottom: 24px; }
  ul.kpi { list-style: none; display: flex; gap: 12px; padding: 0; margin: 0 0 24px; }
  ul.kpi li { border: 1px solid #dfe4ea; border-radius: 6px; padding: 8px 12px; min-width: 78px; }
  ul.kpi span { display: block; text-transform: uppercase; font-size: 9px; letter-spacing: .08em; color: #6b7683; }
  ul.kpi strong { font-size: 18px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #e6eaee; vertical-align: top; }
  th { background: #f5f7f9; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; }
  .sev { text-transform: capitalize; font-weight: 600; }
  .sev-critical { color: #b3001b; }
  .sev-high { color: #d1450b; }
  .sev-medium { color: #a8760a; }
  .sev-low { color: #2b7a3d; }
  .empty { color: #6b7683; font-style: italic; }
</style></head>
<body>
  <h1>${escapeHtml(payload.title)}</h1>
  <div class="meta">Generated ${escapeHtml(new Date().toISOString())} &middot; ${escapeHtml(
    summary.entities || 0
  )} entities &middot; ${escapeHtml(summary.links || 0)} links</div>
  <ul class="kpi">
    <li><span>anomalies</span><strong>${escapeHtml(summary.anomalies || 0)}</strong></li>
    <li><span>max score</span><strong>${escapeHtml(summary.maxScore || 0)}</strong></li>
    ${severityCells}
  </ul>
  <h2>Anomalies</h2>
  ${
    rows
      ? `<table><thead><tr><th>Detected</th><th>Severity</th><th>Score</th><th>Title</th><th>Entity</th><th>Source</th></tr></thead><tbody>${rows}</tbody></table>`
      : `<p class="empty">No anomalies recorded.</p>`
  }
</body></html>`;
}

app.post("/render", requireApiKey, async (req, res) => {
  const payload = {
    title: (req.body && req.body.title) || "WH Anomaly Tracker report",
    summary: (req.body && req.body.summary) || {},
    anomalies: (req.body && req.body.anomalies) || [],
  };
  const executablePath = resolveChrome();
  if (!executablePath) {
    metrics.pdfReports.inc({ result: "no_chrome" });
    return res.status(503).json({
      error: "no chromium binary found; set CHROME_PATH",
      searched: CHROME_CANDIDATES,
    });
  }
  const end = metrics.pdfDuration.startTimer();
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath,
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });
    const page = await browser.newPage();
    await page.setContent(renderHtml(payload), { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "letter",
      printBackground: true,
      margin: { top: "18mm", bottom: "18mm", left: "14mm", right: "14mm" },
    });
    metrics.pdfReports.inc({ result: "ok" });
    res.setHeader("content-type", "application/pdf");
    res.send(Buffer.from(pdf));
  } catch (err) {
    metrics.pdfReports.inc({ result: "error" });
    log.error("render failed", { error: err.message });
    res.status(500).json({ error: "render failed", detail: err.message });
  } finally {
    end();
    if (browser) await browser.close().catch(() => {});
  }
});

app.post("/preview", requireApiKey, (req, res) => {
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.send(
    renderHtml({
      title: (req.body && req.body.title) || "WH Anomaly Tracker report",
      summary: (req.body && req.body.summary) || {},
      anomalies: (req.body && req.body.anomalies) || [],
    })
  );
});

const server = app.listen(PORT, HOST, () => {
  log.info("pdf service listening", { url: `http://${HOST}:${PORT}`, chrome: resolveChrome() || null });
});

function shutdown(signal) {
  log.info("shutting down", { signal });
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 8000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

module.exports = { app, renderHtml };
