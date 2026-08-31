// AlienVault OTX threat intel. Two modes:
//
//   ?indicators=domain:example.com,ip:8.8.8.8 → per-indicator enrichment
//   (no indicators)                          → the account's subscribed pulse feed
//
// GET returns the data; POST additionally persists entities/links/anomalies and
// requires X-API-Key. OTX_INDICATORS supplies a default indicator list.

import { addAnomaly, upsertEntity, upsertLink, requireApiKey, applyCors } from "../lib/store.js";
import { stableKey } from "../lib/ids.js";

const BASE_URL = process.env.OTX_URL || "https://otx.alienvault.com";

const INDICATOR_PATHS = {
  domain: (v) => `/api/v1/indicators/domain/${encodeURIComponent(v)}/general`,
  hostname: (v) => `/api/v1/indicators/hostname/${encodeURIComponent(v)}/general`,
  ip: (v) => `/api/v1/indicators/IPv4/${encodeURIComponent(v)}/general`,
  url: (v) => `/api/v1/indicators/url/${encodeURIComponent(v)}/general`,
};

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("allow", "GET, POST, OPTIONS");
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  const persist = req.method === "POST";
  if (persist && !requireApiKey(req, res)) return;

  const apiKey = process.env.OTX_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "OTX_API_KEY is not configured" });
    return;
  }

  const indicators = parseIndicators(req.query.indicators || process.env.OTX_INDICATORS || "");
  res.setHeader("cache-control", persist ? "no-store" : "s-maxage=600");

  try {
    const payload = indicators.length
      ? await enrichIndicators(indicators, apiKey, persist)
      : await subscribedPulses(apiKey, persist, Math.min(50, Number(req.query.limit) || 10));
    res.status(200).json({ ...payload, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(502).json({ error: `otx request failed: ${err.message}` });
  }
}

async function enrichIndicators(indicators, apiKey, persist) {
  const results = [];
  let persisted = 0;

  for (const indicator of indicators) {
    const result = await lookup(indicator, apiKey);
    if (!result) continue;
    results.push(result);
    if (!persist || !result.pulseCount) continue;

    const entityId = `ent-indicator-${indicator.type}-${stableKey(indicator.value)}`;
    await upsertEntity({ id: entityId, label: indicator.value, kind: "indicator" });
    await upsertLink({ source: "ent-otx", target: entityId, kind: "indicator", weight: 1 });
    await addAnomaly({
      id: `otx-${indicator.type}-${stableKey(indicator.value)}`,
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
    persisted += 1;
  }

  return { mode: "indicators", indicators: indicators.length, results, persisted };
}

async function subscribedPulses(apiKey, persist, limit) {
  const data = await otxJson(`/api/v1/pulses/subscribed?limit=${limit}`, apiKey);
  const feeds = (data.results || []).map((pulse) => ({
    source: "OTX",
    id: pulse.id,
    name: pulse.name,
    adversary: pulse.adversary || null,
    created: pulse.created,
    tlp: pulse.tlp || "white",
    indicators: Array.isArray(pulse.indicators) ? pulse.indicators.length : pulse.indicator_count || 0,
    tags: (pulse.tags || []).slice(0, 5),
  }));

  let persisted = 0;
  if (persist) {
    for (const feed of feeds) {
      const entityId = `ent-pulse-${stableKey(feed.id || feed.name)}`;
      await upsertEntity({ id: entityId, label: feed.name, kind: "pulse" });
      await upsertLink({ source: "ent-otx", target: entityId, kind: "pulse", weight: 1 });
      await addAnomaly({
        id: `otx-pulse-${stableKey(feed.id || feed.name)}`,
        title: `${feed.name}${feed.adversary ? ` — ${feed.adversary}` : ""}`,
        severity: severityForPulses(feed.indicators),
        score: Math.min(100, feed.indicators),
        source: "otx",
        entityId,
        detail: `Subscribed OTX pulse with ${feed.indicators} indicators (TLP ${feed.tlp})${
          feed.tags.length ? `; tags: ${feed.tags.join(", ")}` : ""
        }`,
        evidence: feed.id ? [`${BASE_URL}/pulse/${feed.id}`] : [],
        detectedAt: feed.created,
      });
      persisted += 1;
    }
  }

  return { mode: "pulses", feedCount: feeds.length, feeds, persisted };
}

async function lookup(indicator, apiKey) {
  const buildPath = INDICATOR_PATHS[indicator.type];
  if (!buildPath) throw new Error(`unsupported indicator type: ${indicator.type}`);
  const data = await otxJson(buildPath(indicator.value), apiKey, { allow404: true });
  if (!data) return null;
  return {
    type: indicator.type,
    value: indicator.value,
    pulseCount: data.pulse_info ? data.pulse_info.count || 0 : 0,
    pulses: Array.isArray(data.pulse_info?.pulses)
      ? data.pulse_info.pulses.slice(0, 5).map((p) => ({ name: p.name, id: p.id }))
      : [],
    reputation: data.reputation ?? null,
    country: data.country_name || null,
    asn: data.asn || null,
  };
}

async function otxJson(path, apiKey, { allow404 = false } = {}) {
  const response = await fetch(`${BASE_URL}${path}`, { headers: { "x-otx-api-key": apiKey } });
  if (allow404 && response.status === 404) return null;
  if (!response.ok) throw new Error(`status ${response.status}`);
  return response.json();
}

/** OTX pulse/indicator volume mapped onto the tracker's severity scale. */
export function severityForPulses(count) {
  if (count >= 50) return "critical";
  if (count >= 20) return "high";
  if (count >= 8) return "medium";
  if (count >= 1) return "low";
  return "info";
}

export function parseIndicators(raw) {
  return String(raw)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [type, ...rest] = entry.split(":");
      return { type: type.trim(), value: rest.join(":").trim() };
    })
    .filter((i) => i.value && INDICATOR_PATHS[i.type]);
}
