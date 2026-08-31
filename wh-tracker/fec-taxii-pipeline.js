"use strict";

require("dotenv").config();

const axios = require("axios");

const stix = require("./src/stix");
const metrics = require("./src/metrics");
const { createLogger } = require("./src/logger");
const { createTrackerClient } = require("./src/tracker-client");
const { slug } = require("./src/treasury-api");

const log = createLogger("fec-taxii");
const FEC_URL = process.env.FEC_URL || "https://api.open.fec.gov";
const LARGE_CONTRIBUTION_USD = Number(process.env.FEC_LARGE_CONTRIBUTION_USD || 100000);

function fecClient(apiKey) {
  const key = apiKey || process.env.FEC_API_KEY;
  if (!key) throw new Error("FEC_API_KEY is not set");
  return axios.create({
    baseURL: FEC_URL,
    timeout: 30000,
    params: { api_key: key },
  });
}

function mapReceipt(row) {
  return {
    transactionId: row.transaction_id,
    committeeId: row.committee_id,
    committeeName: row.committee ? row.committee.name : row.committee_id,
    contributor: row.contributor_name || row.contributor_employer || "unknown",
    employer: row.contributor_employer || null,
    amount: Number(row.contribution_receipt_amount) || 0,
    date: row.contribution_receipt_date,
    state: row.contributor_state || null,
  };
}

/**
 * Schedule A (itemized receipts) for a committee, largest first.
 *
 * Results are sorted by descending amount and followed through the FEC's
 * keyset pagination until a page drops below `minAmount` (0 disables the
 * early stop) or `maxPages` is reached.
 */
async function fetchReceipts({
  committeeId,
  cycle,
  perPage = 50,
  apiKey,
  maxPages = Number(process.env.FEC_MAX_PAGES || 10),
  minAmount = LARGE_CONTRIBUTION_USD,
} = {}) {
  const client = fecClient(apiKey);
  const receipts = [];
  let cursor = {};

  for (let page = 0; page < Math.max(1, maxPages); page += 1) {
    let data;
    try {
      ({ data } = await client.get("/v1/schedules/schedule_a/", {
        params: {
          committee_id: committeeId,
          two_year_transaction_period: cycle,
          sort: "-contribution_receipt_amount",
          per_page: perPage,
          ...cursor,
        },
      }));
    } catch (err) {
      metrics.upstreamErrors.inc({ upstream: "fec" });
      log.error("fec request failed", {
        status: err.response ? err.response.status : "network",
        error: err.message,
      });
      throw err;
    }

    const rows = (data.results || []).map(mapReceipt);
    receipts.push(...rows);
    if (!rows.length) break;

    // Sorted descending, so once a page ends below the threshold no later
    // receipt can qualify.
    if (minAmount > 0 && rows[rows.length - 1].amount < minAmount) break;

    const next = data.pagination && data.pagination.last_indexes;
    if (!next || !Object.keys(next).length) break;
    cursor = next;
  }

  return receipts;
}

function severityForAmount(amount) {
  if (amount >= LARGE_CONTRIBUTION_USD * 10) return "critical";
  if (amount >= LARGE_CONTRIBUTION_USD * 4) return "high";
  if (amount >= LARGE_CONTRIBUTION_USD) return "medium";
  return "low";
}

function toAnomalies(receipts) {
  return receipts
    .filter((r) => r.amount >= LARGE_CONTRIBUTION_USD)
    .map((r) => ({
      id: `fec-${r.transactionId || slug(`${r.committeeId}-${r.contributor}-${r.date}`)}`,
      title: `Large contribution: ${r.contributor} → ${r.committeeName}`,
      severity: severityForAmount(r.amount),
      score: Math.min(100, Math.round((r.amount / LARGE_CONTRIBUTION_USD) * 25)),
      source: "fec",
      entityId: `ent-committee-${slug(r.committeeId)}`,
      detail: `$${r.amount.toLocaleString("en-US")} received ${r.date}${
        r.employer ? ` from an employee of ${r.employer}` : ""
      }.`,
      evidence: [`${FEC_URL}/v1/schedules/schedule_a/?committee_id=${encodeURIComponent(r.committeeId)}`],
      detectedAt: r.date ? new Date(r.date).toISOString() : new Date().toISOString(),
      _receipt: r,
    }));
}

function toStixBundle(anomalies) {
  const objects = [];
  for (const anomaly of anomalies) {
    const receipt = anomaly._receipt;
    const committee = stix.identity(receipt.committeeName, "government");
    const contributor = stix.identity(receipt.contributor);
    const indicator = stix.observedAnomaly(anomaly);
    objects.push(committee, contributor, indicator);
    objects.push(stix.relationship(contributor.id, committee.id, "related-to"));
    objects.push(stix.relationship(indicator.id, committee.id, "indicates"));
  }
  return stix.bundle(objects);
}

/**
 * Publish a STIX bundle to a TAXII 2.1 collection. No-op when TAXII_URL is unset.
 */
async function publishToTaxii(bundle, { url, user, pass } = {}) {
  const endpoint = url || process.env.TAXII_URL;
  if (!endpoint) {
    log.warn("TAXII_URL unset; skipping publish", { objects: bundle.objects.length });
    return { published: false, reason: "TAXII_URL unset" };
  }
  const username = user || process.env.TAXII_USER;
  const password = pass || process.env.TAXII_PASS;
  try {
    const { data, status } = await axios.post(
      endpoint.replace(/\/$/, "") + "/objects/",
      bundle,
      {
        timeout: 30000,
        headers: {
          "content-type": "application/taxii+json;version=2.1",
          accept: "application/taxii+json;version=2.1",
        },
        auth: username ? { username, password } : undefined,
      }
    );
    log.info("published to taxii", { status, objects: bundle.objects.length });
    return { published: true, status, response: data };
  } catch (err) {
    metrics.upstreamErrors.inc({ upstream: "taxii" });
    log.error("taxii publish failed", {
      status: err.response ? err.response.status : "network",
      error: err.message,
    });
    throw err;
  }
}

async function run({ tracker, committeeIds, cycle, apiKey, publish = true } = {}) {
  const committees = committeeIds && committeeIds.length ? committeeIds : parseCommitteeEnv();
  if (!committees.length) {
    log.warn("no committees configured; set FEC_COMMITTEE_IDS");
    return { committees: 0, anomalies: 0, published: false };
  }
  const cycleYear = cycle || Number(process.env.FEC_CYCLE) || defaultCycle();
  const all = [];

  for (const committeeId of committees) {
    const receipts = await fetchReceipts({ committeeId, cycle: cycleYear, apiKey });
    const anomalies = toAnomalies(receipts);
    all.push(...anomalies);

    if (tracker) {
      const first = receipts[0];
      await tracker.upsertEntity({
        id: `ent-committee-${slug(committeeId)}`,
        label: first ? first.committeeName : committeeId,
        kind: "committee",
      });
      await tracker.upsertLink({
        source: "ent-fec",
        target: `ent-committee-${slug(committeeId)}`,
        kind: "filing",
        weight: Math.min(8, anomalies.length || 1),
      });
      for (const anomaly of anomalies) {
        const { _receipt, ...payload } = anomaly;
        void _receipt;
        await tracker.addAnomaly(payload);
      }
    }
  }

  const bundle = toStixBundle(all);
  let publishResult = { published: false, reason: "publish disabled" };
  if (publish && all.length) publishResult = await publishToTaxii(bundle);

  log.info("fec pipeline complete", {
    committees: committees.length,
    anomalies: all.length,
    cycle: cycleYear,
    published: publishResult.published,
  });
  return { committees: committees.length, anomalies: all.length, cycle: cycleYear, bundle, publishResult };
}

function defaultCycle() {
  const year = new Date().getUTCFullYear();
  return year % 2 === 0 ? year : year + 1;
}

function parseCommitteeEnv(raw = process.env.FEC_COMMITTEE_IDS || "") {
  return raw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

if (require.main === module) {
  const tracker = createTrackerClient({});
  run({ tracker })
    .then((result) => {
      log.info("done", { anomalies: result.anomalies });
      process.exit(0);
    })
    .catch((err) => {
      log.error("pipeline failed", { error: err.message });
      process.exit(1);
    });
}

module.exports = {
  FEC_URL,
  fetchReceipts,
  toAnomalies,
  toStixBundle,
  publishToTaxii,
  severityForAmount,
  parseCommitteeEnv,
  run,
};
