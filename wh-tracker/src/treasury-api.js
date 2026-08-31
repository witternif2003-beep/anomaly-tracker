"use strict";

const axios = require("axios");
const metrics = require("./metrics");
const { createLogger } = require("./logger");

const log = createLogger("treasury-api");
const BASE_URL = process.env.USASPENDING_URL || "https://api.usaspending.gov";

const http = axios.create({ baseURL: BASE_URL, timeout: 30000 });

function fiscalYearRange(fiscalYear) {
  const fy = fiscalYear || currentFiscalYear();
  return { start_date: `${fy - 1}-10-01`, end_date: `${fy}-09-30` };
}

function currentFiscalYear() {
  const now = new Date();
  return now.getUTCMonth() >= 9 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
}

async function post(path, body) {
  try {
    const { data } = await http.post(path, body);
    return data;
  } catch (err) {
    metrics.upstreamErrors.inc({ upstream: "usaspending" });
    const status = err.response ? err.response.status : "network";
    log.error("usaspending request failed", { path, status, error: err.message });
    throw err;
  }
}

/**
 * Contract/grant awards for a recipient name, newest first.
 */
async function searchAwardsByRecipient(recipientName, { fiscalYear, limit = 50 } = {}) {
  const data = await post("/api/v2/search/spending_by_award/", {
    filters: {
      keywords: [recipientName],
      award_type_codes: ["A", "B", "C", "D"],
      time_period: [fiscalYearRange(fiscalYear)],
    },
    fields: [
      "Award ID",
      "Recipient Name",
      "Award Amount",
      "Awarding Agency",
      "Start Date",
      "End Date",
      "Description",
    ],
    sort: "Award Amount",
    order: "desc",
    limit,
    page: 1,
  });
  return (data.results || []).map((row) => ({
    awardId: row["Award ID"],
    recipient: row["Recipient Name"],
    amount: Number(row["Award Amount"]) || 0,
    agency: row["Awarding Agency"],
    startDate: row["Start Date"],
    endDate: row["End Date"],
    description: row.Description || "",
  }));
}

/**
 * Awards grouped by recipient for a fiscal year — used to spot outlier growth.
 */
async function topRecipients({ fiscalYear, limit = 25 } = {}) {
  const data = await post("/api/v2/search/spending_by_category/recipient/", {
    filters: {
      award_type_codes: ["A", "B", "C", "D"],
      time_period: [fiscalYearRange(fiscalYear)],
    },
    limit,
    page: 1,
  });
  return (data.results || []).map((row) => ({
    recipient: row.name,
    amount: Number(row.amount) || 0,
    recipientId: row.recipient_id || row.code || null,
  }));
}

/**
 * Flags recipients whose award total is a statistical outlier (>= mean + k*stddev)
 * or whose single largest award dominates their annual total.
 */
function detectOutliers(recipients, { sigma = 2 } = {}) {
  if (recipients.length < 3) return [];
  const amounts = recipients.map((r) => r.amount);
  const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
  const variance = amounts.reduce((acc, v) => acc + (v - mean) ** 2, 0) / amounts.length;
  const stddev = Math.sqrt(variance);
  if (stddev === 0) return [];
  return recipients
    .filter((r) => r.amount >= mean + sigma * stddev)
    .map((r) => ({
      recipient: r.recipient,
      amount: r.amount,
      zScore: Number(((r.amount - mean) / stddev).toFixed(2)),
      mean,
      stddev,
    }));
}

function severityForZScore(zScore) {
  if (zScore >= 6) return "critical";
  if (zScore >= 4) return "high";
  if (zScore >= 3) return "medium";
  return "low";
}

/**
 * Pipeline entrypoint: pull top recipients, flag outliers, push entities + anomalies.
 */
async function run({ tracker, fiscalYear, sigma = 2, limit = 25 } = {}) {
  const fy = fiscalYear || currentFiscalYear();
  const recipients = await topRecipients({ fiscalYear: fy, limit });
  const outliers = detectOutliers(recipients, { sigma });
  let written = 0;

  for (const outlier of outliers) {
    const entityId = `ent-treasury-${slug(outlier.recipient)}`;
    if (tracker) {
      await tracker.upsertEntity({ id: entityId, label: outlier.recipient, kind: "vendor" });
      await tracker.upsertLink({
        source: "ent-treasury",
        target: entityId,
        kind: "award",
        weight: Math.min(8, Math.round(outlier.zScore)),
      });
      await tracker.addAnomaly({
        title: `Award concentration outlier: ${outlier.recipient}`,
        severity: severityForZScore(outlier.zScore),
        score: Math.min(100, Math.round(outlier.zScore * 12)),
        source: "usaspending",
        entityId,
        detail: `FY${fy} awards of $${outlier.amount.toLocaleString("en-US")} sit ${outlier.zScore}σ above the peer mean of $${Math.round(
          outlier.mean
        ).toLocaleString("en-US")}.`,
        evidence: [`${BASE_URL}/api/v2/search/spending_by_category/recipient/`],
      });
    }
    written += 1;
  }

  log.info("treasury pipeline complete", { fiscalYear: fy, recipients: recipients.length, anomalies: written });
  return { fiscalYear: fy, recipients: recipients.length, anomalies: written, outliers };
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

module.exports = {
  BASE_URL,
  currentFiscalYear,
  searchAwardsByRecipient,
  topRecipients,
  detectOutliers,
  severityForZScore,
  run,
  slug,
};
