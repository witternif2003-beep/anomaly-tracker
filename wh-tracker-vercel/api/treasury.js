// USAspending.gov spending for the Executive Office of the President (toptier 1100).
//
// GET  → agency profile, sub-agency breakdown, top recipients and statistical outliers
// POST → same, plus persists outlier entities/links/anomalies (requires X-API-Key)
//
// No API key is needed upstream; USAspending is open data.

import { addAnomaly, upsertEntity, upsertLink, requireApiKey, applyCors } from "../lib/store.js";
import { stableKey } from "../lib/ids.js";

const BASE_URL = process.env.USASPENDING_URL || "https://api.usaspending.gov";
const EOP = process.env.AGENCY_CODE || "1100";

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("allow", "GET, POST, OPTIONS");
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  if (req.method === "POST" && !requireApiKey(req, res)) return;

  const fiscalYear = Number(req.query.fiscalYear) || currentFiscalYear();
  const sigma = Number(req.query.sigma) || 2;
  const limit = Math.min(100, Math.max(3, Number(req.query.limit) || 20));

  let agency;
  let subAgencies;
  let recipientPage;
  try {
    [agency, subAgencies, recipientPage] = await Promise.all([
      getJson(`${BASE_URL}/api/v2/agency/${EOP}/?fiscal_year=${fiscalYear}`),
      getJson(
        `${BASE_URL}/api/v2/agency/${EOP}/sub_agency/?fiscal_year=${fiscalYear}&limit=${limit}`
      ),
      postJson(`${BASE_URL}/api/v2/search/spending_by_category/recipient/`, {
        filters: {
          time_period: [{ start_date: `${fiscalYear - 1}-10-01`, end_date: `${fiscalYear}-09-30` }],
          agencies: [{ type: "awarding", tier: "toptier", name: "Executive Office of the President" }],
        },
        limit,
      }),
    ]);
  } catch (err) {
    res.status(502).json({ error: `usaspending request failed: ${err.message}` });
    return;
  }

  const components = (subAgencies.results || []).flatMap((row) =>
    (row.children || [{ code: row.abbreviation, name: row.name, total_obligations: row.total_obligations }]).map(
      (child) => ({
        name: child.name,
        subAgency: row.name,
        obligated: Number(child.total_obligations) || 0,
        transactions: Number(child.transaction_count) || 0,
      })
    )
  );
  const recipients = (recipientPage.results || []).map((row) => ({
    name: row.name || "unknown recipient",
    uei: row.uei || null,
    obligated: Number(row.amount) || 0,
  }));
  const outliers = detectOutliers(recipients, { sigma });
  const persisted = [];

  if (req.method === "POST") {
    for (const outlier of outliers) {
      const entityId = `ent-recipient-${stableKey(outlier.uei || outlier.name)}`;
      await upsertEntity({ id: entityId, label: outlier.name, kind: "recipient" });
      await upsertLink({
        source: "ent-wh",
        target: entityId,
        kind: "spending",
        weight: Math.min(8, Math.round(outlier.zScore)),
      });
      persisted.push(
        await addAnomaly({
          id: `eop-fy${fiscalYear}-${stableKey(outlier.uei || outlier.name)}`,
          title: `Award concentration: ${outlier.name}`,
          severity: severityForZScore(outlier.zScore),
          score: Math.min(100, Math.round(outlier.zScore * 12)),
          source: "usaspending",
          entityId,
          detail: `FY${fiscalYear} award obligations of $${outlier.obligated.toLocaleString("en-US")} sit ${
            outlier.zScore
          }σ above the EOP recipient mean of $${Math.round(outlier.mean).toLocaleString("en-US")}.`,
          evidence: [`${BASE_URL}/api/v2/search/spending_by_category/recipient/`],
        })
      );
    }
  }

  res.setHeader("cache-control", req.method === "POST" ? "no-store" : "s-maxage=3600");
  res.status(200).json({
    agency: agency.name || "Executive Office of the President",
    abbreviation: agency.abbreviation || "EOP",
    mission: agency.mission || null,
    toptierCode: EOP,
    fiscalYear,
    subtierAgencyCount: agency.subtier_agency_count ?? null,
    obligated: components.reduce((sum, c) => sum + c.obligated, 0),
    subAgencies: components,
    recipients,
    sigma,
    outliers,
    persisted: persisted.length,
    source: "USAspending.gov",
    timestamp: new Date().toISOString(),
  });
}

async function getJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`status ${response.status} for ${url}`);
  return response.json();
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`status ${response.status} for ${url}`);
  return response.json();
}

export function currentFiscalYear() {
  const now = new Date();
  return now.getUTCMonth() >= 9 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
}

/** Entries at or above `mean + sigma * stddev` of the peer group. */
export function detectOutliers(rows, { sigma = 2 } = {}) {
  if (rows.length < 3) return [];
  const amounts = rows.map((r) => r.obligated);
  const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
  const variance = amounts.reduce((acc, v) => acc + (v - mean) ** 2, 0) / amounts.length;
  const stddev = Math.sqrt(variance);
  if (stddev === 0) return [];
  return rows
    .filter((r) => r.obligated >= mean + sigma * stddev)
    .map((r) => ({
      name: r.name,
      obligated: r.obligated,
      zScore: Number(((r.obligated - mean) / stddev).toFixed(2)),
      mean,
      stddev,
    }));
}

export function severityForZScore(zScore) {
  if (zScore >= 6) return "critical";
  if (zScore >= 4) return "high";
  if (zScore >= 3) return "medium";
  return "low";
}
