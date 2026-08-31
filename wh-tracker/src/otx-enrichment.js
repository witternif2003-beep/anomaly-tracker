"use strict";

const axios = require("axios");
const metrics = require("./metrics");
const { createLogger } = require("./logger");
const { slug } = require("./treasury-api");

const log = createLogger("otx-enrichment");
const BASE_URL = process.env.OTX_URL || "https://otx.alienvault.com";

function client(apiKey) {
  const key = apiKey || process.env.OTX_API_KEY;
  if (!key) throw new Error("OTX_API_KEY is not set");
  return axios.create({
    baseURL: BASE_URL,
    timeout: 20000,
    headers: { "X-OTX-API-KEY": key },
  });
}

const INDICATOR_PATHS = {
  domain: (value) => `/api/v1/indicators/domain/${encodeURIComponent(value)}/general`,
  hostname: (value) => `/api/v1/indicators/hostname/${encodeURIComponent(value)}/general`,
  ip: (value) => `/api/v1/indicators/IPv4/${encodeURIComponent(value)}/general`,
  url: (value) => `/api/v1/indicators/url/${encodeURIComponent(value)}/general`,
};

/**
 * Look up a single indicator. Returns null on 404 (unknown indicator).
 */
async function lookup(type, value, { apiKey } = {}) {
  const buildPath = INDICATOR_PATHS[type];
  if (!buildPath) throw new Error(`unsupported indicator type: ${type}`);
  try {
    const { data } = await client(apiKey).get(buildPath(value));
    return {
      type,
      value,
      pulseCount: data.pulse_info ? data.pulse_info.count || 0 : 0,
      pulses: data.pulse_info && Array.isArray(data.pulse_info.pulses)
        ? data.pulse_info.pulses.slice(0, 5).map((p) => ({ name: p.name, id: p.id, tags: p.tags || [] }))
        : [],
      reputation: data.reputation ?? null,
      country: data.country_name || null,
      asn: data.asn || null,
    };
  } catch (err) {
    if (err.response && err.response.status === 404) return null;
    metrics.upstreamErrors.inc({ upstream: "otx" });
    log.error("otx lookup failed", {
      type,
      status: err.response ? err.response.status : "network",
      error: err.message,
    });
    throw err;
  }
}

function severityForPulses(pulseCount) {
  if (pulseCount >= 20) return "critical";
  if (pulseCount >= 8) return "high";
  if (pulseCount >= 3) return "medium";
  if (pulseCount >= 1) return "low";
  return "info";
}

/**
 * Pipeline entrypoint: enrich a list of indicators and record anomalies for
 * anything with OTX pulse activity.
 */
async function run({ tracker, indicators, apiKey } = {}) {
  const list = indicators && indicators.length ? indicators : parseIndicatorEnv();
  const results = [];
  let written = 0;

  for (const indicator of list) {
    const result = await lookup(indicator.type, indicator.value, { apiKey });
    if (!result) continue;
    results.push(result);
    if (result.pulseCount === 0) continue;

    const entityId = `ent-indicator-${slug(indicator.value)}`;
    if (tracker) {
      await tracker.upsertEntity({ id: entityId, label: indicator.value, kind: "indicator" });
      await tracker.addAnomaly({
        title: `OTX pulse activity on ${indicator.value}`,
        severity: severityForPulses(result.pulseCount),
        score: Math.min(100, result.pulseCount * 5),
        source: "otx",
        entityId,
        detail: `${result.pulseCount} OTX pulses reference this ${indicator.type}${
          result.pulses.length ? `: ${result.pulses.map((p) => p.name).join("; ")}` : ""
        }`,
        evidence: result.pulses.map((p) => `${BASE_URL}/pulse/${p.id}`),
      });
    }
    written += 1;
  }

  log.info("otx pipeline complete", { indicators: list.length, anomalies: written });
  return { indicators: list.length, anomalies: written, results };
}

/**
 * OTX_INDICATORS="domain:example.com,ip:8.8.8.8"
 */
function parseIndicatorEnv(raw = process.env.OTX_INDICATORS || "") {
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [type, ...rest] = entry.split(":");
      return { type: type.trim(), value: rest.join(":").trim() };
    })
    .filter((i) => i.type && i.value && INDICATOR_PATHS[i.type]);
}

module.exports = { BASE_URL, lookup, run, severityForPulses, parseIndicatorEnv };
