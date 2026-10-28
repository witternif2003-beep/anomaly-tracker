import Link from "next/link";
import { Empty, ErrorBox } from "@/components/ui";
import { db } from "@/lib/db";
import { anomalyLabel, classOf, codename, FINDING_COLUMNS, type FindingRow } from "@/lib/findings";
import { num, safe } from "@/lib/safe";

export const dynamic = "force-dynamic";

export default async function Register({ searchParams }: PageProps<"/anomalies">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const { data, error } = await safe(async () => {
    const sql = await db();
    return q
      ? sql.unsafe<FindingRow[]>(`SELECT ${FINDING_COLUMNS} FROM ops_finding WHERE cve_id ILIKE $1 OR vendor ILIKE $1 OR product ILIKE $1 OR title ILIKE $1 ORDER BY anomaly_no DESC LIMIT 300`, [`%${q}%`])
      : sql.unsafe<FindingRow[]>(`SELECT ${FINDING_COLUMNS} FROM ops_finding ORDER BY anomaly_no DESC LIMIT 300`);
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-mono text-lg font-bold">ANOMALY REGISTER</h1>
        <form className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="identifier, vendor, product" className="w-56 rounded border border-line bg-panel px-2 py-1 font-mono text-sm" />
          <button className="rounded border border-line px-3 font-mono text-xs text-dim">filter</button>
        </form>
      </div>
      <ErrorBox error={error} />
      {data && !data.length && <Empty>No anomalies match.</Empty>}
      {data && data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[720px] font-mono text-xs">
            <thead className="bg-panel text-left text-dim">
              <tr>
                {["#", "codename", "identifier", "affected", "class", "severity", "prediction", "exposure"].map((h) => (
                  <th key={h} className="px-3 py-2 font-normal">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.map((f) => (
                <tr key={f.cve_id} className="hover:bg-panel">
                  <td className="px-3 py-1.5 text-dim">{anomalyLabel(f)}</td>
                  <td className="px-3 py-1.5"><Link href={`/anomalies/${f.cve_id}`} className="text-accent hover:underline">{codename(f)}</Link></td>
                  <td className="px-3 py-1.5">{f.cve_id}</td>
                  <td className="max-w-[16rem] truncate px-3 py-1.5">{f.vendor} · {f.product}</td>
                  <td className="px-3 py-1.5 text-dim">{classOf(f)}</td>
                  <td className="px-3 py-1.5">{f.cvss === null ? "—" : `${num(f.cvss, 1)} ${f.cvss_severity ?? ""}`}</td>
                  <td className="px-3 py-1.5">{f.epss === null ? "—" : `${(Number(f.epss) * 100).toFixed(2)}%`}</td>
                  <td className="px-3 py-1.5 text-right">{num(f.exposure_score, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
