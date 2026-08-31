// Shared USAspending.gov access and statistics, used by /api/treasury and
// /api/reference-topology.

export const BASE_URL = process.env.USASPENDING_URL || "https://api.usaspending.gov";
export const EOP = process.env.AGENCY_CODE || "1100";

export async function getJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`status ${response.status} for ${url}`);
  return response.json();
}

export async function postJson(url, body) {
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
      uei: r.uei || null,
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

export function agencyProfileUrl(fiscalYear) {
  return `${BASE_URL}/api/v2/agency/${EOP}/?fiscal_year=${fiscalYear}`;
}

export function subAgencyUrl(fiscalYear, limit) {
  return `${BASE_URL}/api/v2/agency/${EOP}/sub_agency/?fiscal_year=${fiscalYear}&limit=${limit}`;
}

export const RECIPIENT_CATEGORY_URL = `${BASE_URL}/api/v2/search/spending_by_category/recipient/`;

export function recipientQuery(fiscalYear, limit) {
  return {
    filters: {
      time_period: [{ start_date: `${fiscalYear - 1}-10-01`, end_date: `${fiscalYear}-09-30` }],
      agencies: [{ type: "awarding", tier: "toptier", name: "Executive Office of the President" }],
    },
    limit,
  };
}
