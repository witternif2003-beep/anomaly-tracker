"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type TelemetryTick = {
  id: string;
  seq: number;
  entityId: string;
  entityName: string;
  entityType: string;
  city: string;
  anomalyId: string;
  priority: string;
  title: string;
  categoryId: string;
  categoryLabel: string;
  fbiCategory: string | null;
  artifact: string | null;
  collectionStatus: string;
  narrativeTimestamp: string | null;
  active: boolean;
};

export type TelemetryPayload = {
  mode: string;
  tickMs: number;
  active: boolean;
  liveSurveillance: boolean;
  intercepts: boolean;
  crossProduct?: boolean;
  note: string;
  totalTicks: number;
  p1Ticks: number;
  entityCount?: number;
  anomalyCount?: number;
  stream: TelemetryTick[];
};

type EntityLite = {
  id: string;
  name: string;
  entityType: string;
  city: { label: string } | string;
};

type AnomalyLite = {
  id: string;
  priority: string;
  title: string;
  categoryId?: string;
  categoryLabel: string;
  fbiCategory?: string;
  artifact?: string;
  collectionStatus?: string;
  narrativeTimestamp?: string;
  entityName?: string;
};

function priorityTone(priority: string) {
  if (priority === "P1") return "bg-destructive text-destructive-foreground";
  if (priority === "P2") return "bg-amber-500/90 text-black";
  return "bg-muted text-muted-foreground";
}

function expandCrossProduct(
  entities: EntityLite[],
  anomalies: AnomalyLite[],
  preferP1: boolean,
): TelemetryTick[] {
  const pool = preferP1 ? anomalies.filter((a) => a.priority === "P1") : anomalies;
  const use = pool.length ? pool : anomalies;
  const out: TelemetryTick[] = [];
  let seq = 0;
  for (const entity of entities) {
    const city = typeof entity.city === "string" ? entity.city : entity.city.label;
    for (const anomaly of use) {
      seq += 1;
      out.push({
        id: `tel-${entity.id}-${anomaly.id}-${seq}`,
        seq,
        entityId: entity.id,
        entityName: entity.name,
        entityType: entity.entityType,
        city,
        anomalyId: anomaly.id,
        priority: anomaly.priority,
        title: anomaly.title,
        categoryId: anomaly.categoryId ?? "unknown",
        categoryLabel: anomaly.categoryLabel,
        fbiCategory: anomaly.fbiCategory ?? null,
        artifact: anomaly.artifact ?? null,
        collectionStatus: anomaly.collectionStatus ?? "fixture",
        narrativeTimestamp: anomaly.narrativeTimestamp ?? null,
        active: true,
      });
    }
  }
  return out;
}

export function LiveTelemetryFeed({
  telemetry,
  entities,
  anomalies,
  onSelectAnomaly,
  preferP1 = true,
}: {
  telemetry: TelemetryPayload;
  entities?: EntityLite[];
  anomalies?: AnomalyLite[];
  onSelectAnomaly?: (anomalyId: string) => void;
  preferP1?: boolean;
}) {
  const stream = useMemo(() => {
    if (telemetry.crossProduct && entities?.length && anomalies?.length) {
      return expandCrossProduct(entities, anomalies, preferP1);
    }
    const base = preferP1
      ? telemetry.stream.filter((t) => t.priority === "P1")
      : telemetry.stream;
    return base.length ? base : telemetry.stream;
  }, [telemetry, entities, anomalies, preferP1]);

  const [cursor, setCursor] = useState(0);
  const [clock, setClock] = useState("");
  const [feed, setFeed] = useState<TelemetryTick[]>([]);
  const cursorRef = useRef(0);

  useEffect(() => {
    if (!stream.length) return;
    const tickMs = Math.max(400, telemetry.tickMs || 1200);
    cursorRef.current = 0;
    setFeed([stream[0]]);
    setCursor(0);
    setClock(new Date().toISOString());
    const id = window.setInterval(() => {
      const next = (cursorRef.current + 1) % stream.length;
      cursorRef.current = next;
      const row = stream[next];
      setCursor(next);
      setFeed((prev) => [row, ...prev].slice(0, 18));
      setClock(new Date().toISOString());
    }, tickMs);
    return () => window.clearInterval(id);
  }, [stream, telemetry.tickMs]);

  const head = stream[cursor] ?? feed[0] ?? null;
  const entitiesCovered = useMemo(() => new Set(stream.map((t) => t.entityId)).size, [stream]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/40">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 font-display text-lg">
              <span className="hud-beacon" aria-hidden />
              Live P1 telemetry
            </CardTitle>
            <CardDescription className="mt-1 max-w-2xl">{telemetry.note}</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-emerald-500/20 text-emerald-200">ACTIVE 24/7</Badge>
            <Badge variant="outline">{telemetry.mode}</Badge>
            <Badge variant="outline">
              {stream.length.toLocaleString()} live ticks · {entitiesCovered} entities
            </Badge>
            <Badge variant="secondary">liveSurveillance={String(telemetry.liveSurveillance)}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 pt-4 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="hud-stat space-y-3 !items-stretch">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
            <span>Fixture clock</span>
            <span className="font-mono normal-case tracking-normal text-primary/90">{clock}</span>
          </div>
          {head ? (
            <button
              type="button"
              className="w-full rounded-xl border border-primary/25 bg-primary/5 p-4 text-left transition hover:border-primary/50"
              onClick={() => onSelectAnomaly?.(head.anomalyId)}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "rounded px-2 py-0.5 text-[10px] font-semibold",
                    priorityTone(head.priority),
                  )}
                >
                  {head.priority}
                </span>
                {head.collectionStatus === "constrained" ? (
                  <Badge variant="outline">constrained</Badge>
                ) : (
                  <Badge variant="secondary">fixture</Badge>
                )}
                <span className="text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
                  seq {head.seq}
                </span>
              </div>
              <p className="mt-2 font-display text-xl leading-tight">{head.title}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {head.entityName} · {head.entityType} · {head.city}
              </p>
              {head.artifact ? (
                <p className="mt-2 font-mono text-xs text-primary/90">{head.artifact}</p>
              ) : null}
              <p className="mt-2 text-xs text-muted-foreground">
                {head.fbiCategory ? `${head.fbiCategory} → ` : null}
                {head.categoryLabel}
                {head.narrativeTimestamp ? ` · ${head.narrativeTimestamp}` : null}
              </p>
            </button>
          ) : (
            <p className="text-sm text-muted-foreground">Waiting for fixture clock…</p>
          )}
          <div className="grid grid-cols-3 gap-2">
            <div className="hud-stat">
              <span className="hud-stat-value">{telemetry.totalTicks.toLocaleString()}</span>
              <span className="hud-stat-label">Total ticks</span>
            </div>
            <div className="hud-stat">
              <span className="hud-stat-value">{(preferP1 ? stream.length : telemetry.p1Ticks).toLocaleString()}</span>
              <span className="hud-stat-label">P1 ticks</span>
            </div>
            <div className="hud-stat">
              <span className="hud-stat-value">{entitiesCovered}</span>
              <span className="hud-stat-label">Businesses</span>
            </div>
          </div>
        </div>

        <div className="flex max-h-[420px] flex-col gap-2 overflow-y-auto pr-1">
          {feed.map((row, i) => (
            <button
              key={`${row.id}-${i}`}
              type="button"
              onClick={() => onSelectAnomaly?.(row.anomalyId)}
              className={cn(
                "animate-rise rounded-lg border border-border/50 bg-background/30 px-3 py-2 text-left transition hover:border-primary/35",
                i === 0 && "border-primary/40 bg-primary/10",
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    row.priority === "P1" ? "bg-destructive tracker-pulse" : "bg-primary",
                  )}
                />
                <span className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                  {row.priority} · {row.entityName}
                </span>
              </div>
              <p className="mt-1 text-sm leading-snug">{row.title}</p>
              {row.artifact ? (
                <p className="mt-1 truncate font-mono text-[10px] text-primary/80">{row.artifact}</p>
              ) : null}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
