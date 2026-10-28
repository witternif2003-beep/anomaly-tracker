import Link from "next/link";
import { anomalyLabel, classOf, codename, type FindingRow, plainText } from "@/lib/findings";
import { ATTACK_SOURCE, type Attribution } from "@/lib/attack";
import type { Metric } from "@/lib/metrics";

const SRC_TONE: Record<Metric["source"], string> = {
  catalog: "text-warn",
  scoring: "text-accent",
  prediction: "text-good",
  platform: "text-fg",
  derived: "text-dim",
};

const d = (v: string | Date | null) => (v ? String(v instanceof Date ? v.toISOString() : v).slice(0, 10) : "—");

/** One anomaly in the fixed record layout used across every batch. */
export function AnomalyRecord({ f, metrics, incident, attribution, compact = false }: { f: FindingRow; metrics?: Metric[]; incident?: { state: string; priority: string } | null; attribution?: Attribution; compact?: boolean }) {
  const ransomware = f.ransomware?.toLowerCase() === "known";
  return (
    <article className="rounded-lg border border-line bg-panel p-4 font-mono text-[12px] leading-relaxed">
      <header className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Link href={`/anomalies/${f.cve_id}`} className="text-sm font-bold text-accent hover:underline">
          ANOMALY {anomalyLabel(f)} – CODENAME: {codename(f)}
        </Link>
        <span className="text-dim">exposure {Number(f.exposure_score ?? 0).toFixed(2)}</span>
        {incident && (
          <span className="rounded border border-warn/50 px-1.5 text-[11px] text-warn">
            incident {incident.priority} · {incident.state}
          </span>
        )}
      </header>
      <dl className="grid grid-cols-1 gap-y-0.5 sm:grid-cols-[11rem_minmax(0,1fr)]">
        <dt className="text-dim">IDENTIFIER</dt>
        <dd className="break-words">{f.cve_id}</dd>
        <dt className="text-dim">ANOMALY CLASS</dt>
        <dd className="break-words">{classOf(f)}</dd>
        <dt className="text-dim">AFFECTED SYSTEMS</dt>
        <dd className="break-words">
          {f.vendor ?? "—"} · {f.product ?? "—"}
        </dd>
        <dt className="text-dim">CATALOGUED</dt>
        <dd>
          {d(f.date_added)} · window closes {d(f.due_date)}
        </dd>
        <dt className="text-dim">DEEP DIVE</dt>
        <dd className="break-words">
          (1) Method: {f.title ?? "—"}. (2) Mechanism: {f.cwes.length ? f.cwes.join(", ") : "no weakness classification published"}. (3) Status:{" "}
          {incident ? `incident ${incident.state}` : "monitored, below incident threshold"}; record {f.vuln_status ?? "status not published"}.
        </dd>
        {!compact && (
          <>
            <dt className="text-dim">SUMMARY</dt>
            <dd className="break-words text-dim">{plainText(f.summary) ?? "—"}</dd>
          </>
        )}
        <dt className="text-dim">Ω ANOMALY</dt>
        <dd className="break-words">
          {ransomware
            ? "Extortion campaign use is recorded against this entry."
            : f.epss_percentile !== null && Number(f.epss_percentile) >= 0.99
              ? `Predicted exploitation ranks at percentile ${(Number(f.epss_percentile) * 100).toFixed(2)} of all scored records.`
              : f.cvss !== null && Number(f.cvss) >= 9
                ? `Severity ${Number(f.cvss).toFixed(1)} with active exploitation catalogued.`
                : "Active exploitation catalogued; no further distinguishing signal in the sources."}
        </dd>
        {attribution && (
          <>
            <dt className="text-dim">ESPIONAGE ATTRIBUTION</dt>
            <dd className="break-words">
              {attribution.links.length ? (
                <ol className="space-y-1.5">
                  {attribution.links.map((l, n) => (
                    <li key={l.actor_id}>
                      ({n + 1}){" "}
                      <a className="text-accent hover:underline" href={l.actor_url} target="_blank" rel="noreferrer">
                        {l.actor_name} · {l.actor_id}
                      </a>{" "}
                      <span className="text-dim">ATT&amp;CK {l.actor_kind}</span>. {l.statement} <span className="text-dim">Basis: {l.espionage_note}</span>
                      {l.citations.length > 0 && (
                        <span className="block text-[11px] text-dim">
                          cited by ATT&amp;CK:{" "}
                          {l.citations.slice(0, 4).map((c, k) => (
                            <span key={c.url}>
                              {k > 0 && " · "}
                              <a className="text-accent hover:underline break-all" href={c.url} target="_blank" rel="noreferrer">
                                {c.name}
                              </a>
                            </span>
                          ))}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              ) : (
                <span className="text-dim">No group or campaign that MITRE ATT&amp;CK{attribution.version ? ` v${attribution.version}` : ""} describes as an espionage actor is recorded exploiting this CVE.</span>
              )}
              <span className="block text-[11px] text-dim">
                Attribution as published by MITRE ATT&amp;CK{attribution.version ? ` v${attribution.version}` : ""}, not an OMEGA finding. {ATTACK_SOURCE.notice}
              </span>
            </dd>
          </>
        )}
        <dt className="text-dim">SOURCE OF RECORD</dt>
        <dd className="break-all">
          <a className="text-accent hover:underline" href={`https://nvd.nist.gov/vuln/detail/${f.cve_id}`} target="_blank" rel="noreferrer">
            nvd.nist.gov/vuln/detail/{f.cve_id}
          </a>
          {f.source_url && (
            <>
              {" · "}
              <a className="text-accent hover:underline" href={f.source_url} target="_blank" rel="noreferrer">
                vendor advisory
              </a>
            </>
          )}
        </dd>
      </dl>
      {metrics && (
        <div className="mt-3 border-t border-line pt-3">
          <div className="mb-1 text-dim">· [50-METRIC ANOMALY BLOCK – ANOMALY {anomalyLabel(f)}]</div>
          <div className="grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2 lg:grid-cols-3">
            {metrics.map((m) => (
              <div key={m.no} className="flex gap-2">
                <span className="text-dim">{m.no}</span>
                <span className="min-w-0 flex-1 truncate" title={m.label}>
                  {m.label}
                </span>
                <span className={`max-w-[55%] truncate text-right ${m.value === null ? "text-dim" : SRC_TONE[m.source]}`} title={m.value ?? "not published by the source"}>
                  {m.value ?? "—"}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-dim">
            colour key: <span className="text-warn">catalog</span> · <span className="text-accent">severity scoring</span> · <span className="text-good">exploit prediction</span> · <span className="text-fg">platform measurement</span> · derived. “—” means the source publishes no value.
          </p>
        </div>
      )}
    </article>
  );
}
