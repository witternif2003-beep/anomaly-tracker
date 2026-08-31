// Reference topology for demos and empty deployments.
//
// Every node and edge here is derived at request time from USAspending.gov open
// data for the Executive Office of the President (toptier 1100) and carries the
// upstream URL it came from. Nothing is invented: no SIGINT/intelligence-sharing
// nodes, no fabricated incidents. Anomalies are the same mean + sigma·stddev
// outliers /api/treasury computes, so a viewer showing this topology is showing
// real, citable award concentration rather than a story.
//
// The payload is flagged `reference: true` so the viewer can label it instead of
// passing it off as tracker state, and it is never written to the store.

import { applyCors } from "../lib/store.js";
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
  if (req.method !== "GET") {
    res.setHeader("allow", "GET, OPTIONS");
    res.status(405).json({ error: "method not allowed" });
    return;
  }

  const fiscalYear = Number(req.query.fiscalYear) || currentFiscalYear();
  const sigma = Number(req.query.sigma) || 2;
  const limit = Math.min(50, Math.max(3, Number(req.query.limit) || 12));

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

  const root = {
    id: "ent-wh",
    label: agency.name || "Executive Office of the President",
    kind: "office",
    reference: true,
    source: agencyProfileUrl(fiscalYear),
  };
  const entities = [root];
  const links = [];

  for (const row of subAgencies.results || []) {
    const id = `ent-subagency-${stableKey(row.name)}`;
    entities.push({
      id,
      label: row.name,
      kind: "sub-agency",
      reference: true,
      obligated: Number(row.total_obligations) || 0,
      source: subAgencyUrl(fiscalYear, limit),
    });
    links.push({ source: root.id, target: id, kind: "appropriation", weight: 2, reference: true });
  }

  const recipients = (recipientPage.results || []).map((row) => ({
    name: row.name || "unknown recipient",
    uei: row.uei || null,
    obligated: Number(row.amount) || 0,
  }));

  for (const recipient of recipients) {
    const id = `ent-recipient-${stableKey(recipient.uei || recipient.name)}`;
    entities.push({
      id,
      label: recipient.name,
      kind: "recipient",
      reference: true,
      obligated: recipient.obligated,
      source: RECIPIENT_CATEGORY_URL,
    });
    links.push({ source: root.id, target: id, kind: "spending", weight: 1, reference: true });
  }

  const outliers = detectOutliers(recipients, { sigma });
  // Outliers are derived at request time from the FY totals, so the only honest
  // timestamp is when this payload was computed.
  const detectedAt = new Date().toISOString();
  const anomalies = outliers.map((outlier) => ({
    id: `ref-eop-fy${fiscalYear}-${stableKey(outlier.uei || outlier.name)}`,
    title: `Award concentration: ${outlier.name}`,
    severity: severityForZScore(outlier.zScore),
    score: Math.min(100, Math.round(outlier.zScore * 12)),
    source: "usaspending",
    entityId: `ent-recipient-${stableKey(outlier.uei || outlier.name)}`,
    detail: `FY${fiscalYear} award obligations of $${outlier.obligated.toLocaleString("en-US")} sit ${
      outlier.zScore
    }σ above the EOP recipient mean of $${Math.round(outlier.mean).toLocaleString("en-US")}.`,
    evidence: [RECIPIENT_CATEGORY_URL],
    reference: true,
    detectedAt,
  }));

  res.setHeader("cache-control", "s-maxage=3600, stale-while-revalidate=86400");
  res.status(200).json({
    reference: true,
    label: `reference topology · USAspending FY${fiscalYear}`,
    toptierCode: EOP,
    fiscalYear,
    sigma,
    topology: { entities, links },
    anomalies,
    summary: {
      entities: entities.length,
      links: links.length,
      anomalies: anomalies.length,
      maxScore: anomalies.reduce((max, a) => Math.max(max, a.score), 0),
    },
    sources: [agencyProfileUrl(fiscalYear), subAgencyUrl(fiscalYear, limit), RECIPIENT_CATEGORY_URL],
    timestamp: new Date().toISOString(),
  });
}
