// USAspending.gov spending for the Executive Office of the President (toptier 1100).
//
// GET  → agency profile, sub-agency breakdown, top recipients and statistical outliers
// POST → same, plus persists outlier entities/links/anomalies (requires X-API-Key)
//
// No API key is needed upstream; USAspending is open data.

import { addAnomaly, upsertEntity, upsertLink, requireApiKey, applyCors } from "../lib/store.js";
import { stableKey } from "../lib/ids.js";
import {
  EOP,
  RECIPIENT_CATEGORY_URL,
  agencyProfileUrl,
  currentFiscalYear,
  detectOutliers,
  getJson,
  postJson,
  recipientQuery,
  severityForZScore,
  subAgencyUrl,
} from "../lib/usaspending.js";

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
      getJson(agencyProfileUrl(fiscalYear)),
      getJson(subAgencyUrl(fiscalYear, limit)),
      postJson(RECIPIENT_CATEGORY_URL, recipientQuery(fiscalYear, limit)),
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
          evidence: [RECIPIENT_CATEGORY_URL],
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

