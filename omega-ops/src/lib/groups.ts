import type { Sql } from "postgres";
import { db } from "./db";
import { anomalyDetail } from "./detail";
import { HttpError } from "./env";
import { FINDING_COLUMNS, type FindingRow } from "./findings";

/** An asset matches an anomaly when its catalogued vendor or product is the same (case-insensitive). */
export const assetMatch = (sql: Sql) =>
  sql`(lower(COALESCE(f.product, '')) = lower(COALESCE(a.product, '~')) OR lower(COALESCE(f.vendor, '')) = lower(COALESCE(a.vendor, '~')))`;

export interface GroupSummary {
  name: string;
  assets: number;
  anomalies: number;
  open_incidents: number;
  newest_anomaly: number | null;
}

export async function groupSummaries(): Promise<GroupSummary[]> {
  const sql = await db();
  const rows = await sql<{ name: string; assets: string; anomalies: string; open_incidents: string; newest_anomaly: string | null }[]>`
    SELECT g.name,
      (SELECT count(*) FROM ops_asset a WHERE lower(a.asset_group) = lower(g.name)) AS assets,
      (SELECT count(DISTINCT f.cve_id) FROM ops_finding f JOIN ops_asset a ON ${assetMatch(sql)} WHERE lower(a.asset_group) = lower(g.name)) AS anomalies,
      (SELECT max(f.anomaly_no) FROM ops_finding f JOIN ops_asset a ON ${assetMatch(sql)} WHERE lower(a.asset_group) = lower(g.name)) AS newest_anomaly,
      (SELECT count(DISTINCT i.cve_id) FROM ops_incident i JOIN ops_finding f ON f.cve_id = i.cve_id JOIN ops_asset a ON ${assetMatch(sql)}
        WHERE lower(a.asset_group) = lower(g.name) AND i.state IN ('open', 'triaged')) AS open_incidents
    FROM (SELECT DISTINCT ON (lower(asset_group)) asset_group AS name FROM ops_asset WHERE asset_group IS NOT NULL ORDER BY lower(asset_group), id) g
    ORDER BY g.name`;
  return rows.map((r) => ({ name: r.name, assets: Number(r.assets), anomalies: Number(r.anomalies), open_incidents: Number(r.open_incidents), newest_anomaly: r.newest_anomaly === null ? null : Number(r.newest_anomaly) }));
}

const FULL_RECORDS = 60;

export async function groupDetail(name: string) {
  const sql = await db();
  const assets = await sql<{ id: string; name: string; class: string; vendor: string | null; product: string | null; criticality: string; owner: string | null; asset_group: string }[]>`
    SELECT id, name, class, vendor, product, criticality, owner, asset_group FROM ops_asset WHERE lower(asset_group) = lower(${name}) ORDER BY id`;
  if (!assets.length) throw new HttpError(404, "no such asset group");
  const ids = assets.map((a) => a.id);
  const matched = await sql.unsafe<(FindingRow & { matched_assets: string[] })[]>(
    `SELECT ${FINDING_COLUMNS.split(",").map((c) => `f.${c.trim()}`).join(", ")}, array_agg(DISTINCT a.name) AS matched_assets
     FROM ops_finding f JOIN ops_asset a ON (lower(COALESCE(f.product, '')) = lower(COALESCE(a.product, '~')) OR lower(COALESCE(f.vendor, '')) = lower(COALESCE(a.vendor, '~')))
     WHERE a.id = ANY($1::bigint[])
     GROUP BY f.cve_id ORDER BY f.anomaly_no DESC LIMIT 300`,
    [ids],
  );
  const records: Awaited<ReturnType<typeof anomalyDetail>>[] = [];
  const head = matched.slice(0, FULL_RECORDS);
  for (let k = 0; k < head.length; k += 8) {
    const chunk = await Promise.allSettled(head.slice(k, k + 8).map((f) => anomalyDetail(f.cve_id)));
    for (const r of chunk) if (r.status === "fulfilled") records.push(r.value);
  }
  return { name: assets[0].asset_group, assets, matched: matched.map((m) => ({ cve_id: m.cve_id, anomaly_no: m.anomaly_no, matched_assets: m.matched_assets })), records, total: matched.length, fullRecords: FULL_RECORDS };
}
