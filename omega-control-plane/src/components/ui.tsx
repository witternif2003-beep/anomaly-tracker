import type { ReactNode } from "react";

export function Card({ title, children, right, source }: { title?: ReactNode; children: ReactNode; right?: ReactNode; source?: ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-panel p-4">
      {(title || right) && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {title && <h2 className="text-sm font-semibold tracking-wide text-fg">{title}</h2>}
          {right && <div className="ml-auto">{right}</div>}
        </div>
      )}
      {children}
      {source && <p className="mt-3 break-words font-mono text-[11px] text-dim">source: {source}</p>}
    </section>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "good" | "warn" | "bad" }) {
  const color = tone === "good" ? "text-good" : tone === "warn" ? "text-warn" : tone === "bad" ? "text-bad" : "text-fg";
  return (
    <div className="rounded-md border border-line bg-bg/50 p-3">
      <div className="text-[11px] uppercase tracking-wider text-dim">{label}</div>
      <div className={`mt-1 break-all font-mono text-lg ${color}`}>{value}</div>
      {hint && <div className="mt-1 break-words text-[11px] text-dim">{hint}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-md border border-dashed border-line p-4 text-center text-sm text-dim">{children}</div>;
}

export function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null;
  return <div className="rounded-md border border-bad/40 bg-bad/10 p-3 text-sm text-bad">{error}</div>;
}

const TIER_TONE: Record<string, string> = {
  high: "border-good/50 text-good",
  normal: "border-good/50 text-good",
  low_compute: "border-warn/50 text-warn",
  critical: "border-bad/50 text-bad",
  dead: "border-bad bg-bad/20 text-bad",
};

export function TierBadge({ tier }: { tier?: string | null }) {
  if (!tier) return <span className="rounded border border-line px-2 py-0.5 font-mono text-[11px] text-dim">no snapshot</span>;
  return <span className={`rounded border px-2 py-0.5 font-mono text-[11px] ${TIER_TONE[tier] ?? "border-line text-dim"}`}>{tier}</span>;
}

function cell(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function RowsTable({ rows, columns, max = 50, empty = "No rows in this snapshot." }: { rows?: Record<string, unknown>[] | null; columns?: string[]; max?: number; empty?: ReactNode }) {
  if (!rows || rows.length === 0) return <Empty>{empty}</Empty>;
  const cols = columns ?? Object.keys(rows[0]);
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-max border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-line text-dim">
            {cols.map((c) => (
              <th key={c} className="whitespace-nowrap px-2 py-1.5 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, max).map((r, i) => (
            <tr key={i} className="border-b border-line/50 align-top">
              {cols.map((c) => {
                const s = cell(r[c]);
                return (
                  <td key={c} className="max-w-72 px-2 py-1.5 font-mono" title={s.length > 120 ? s : undefined}>
                    <span className="line-clamp-3 break-words">{s}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > max && <p className="mt-2 text-[11px] text-dim">showing {max} of {rows.length}</p>}
    </div>
  );
}

export function Bars({ data, label, value, format = (n) => String(n) }: { data: Record<string, unknown>[]; label: string; value: string; format?: (n: number) => string }) {
  if (!data.length) return <Empty>No data in this snapshot.</Empty>;
  const max = Math.max(...data.map((d) => Number(d[value]) || 0), 1);
  return (
    <div className="space-y-1">
      {data.map((d, i) => {
        const n = Number(d[value]) || 0;
        return (
          <div key={i} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2 text-xs">
            <span className="truncate font-mono text-dim">{String(d[label] ?? "—")}</span>
            <div className="h-2 rounded bg-line">
              <div className="h-2 rounded bg-accent" style={{ width: `${(n / max) * 100}%` }} />
            </div>
            <span className="font-mono">{format(n)}</span>
          </div>
        );
      })}
    </div>
  );
}

export function Sparkline({ points, height = 60 }: { points: number[]; height?: number }) {
  if (points.length < 2) return <Empty>Need at least two snapshots to chart.</Empty>;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const w = 300;
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${((i / (points.length - 1)) * w).toFixed(1)},${(height - ((p - min) / span) * (height - 4) - 2).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="h-16 w-full" preserveAspectRatio="none">
      <path d={d} fill="none" stroke="var(--color-accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
