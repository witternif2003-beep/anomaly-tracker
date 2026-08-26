"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type BlackOwnedScanTarget = {
  id: string;
  name: string;
  city: string;
  sector: string;
  entityType: string;
  kind: "verified-roster" | "new-to-scan";
  blackOwned: boolean;
  ownershipVerification: string;
  signal: string;
  priority: string;
  scanAction: string;
  source: string;
};

export type BlackOwnedScanTick = {
  id: string;
  seq: number;
  loggedAtOffsetMs: number;
  status: "scanning" | "queued" | "logged-new" | "revalidated" | "crime-search" | "documented";
  target: BlackOwnedScanTarget;
  message: string;
  priority?: string;
  crimeCategoryId?: string;
  crimeCategoryLabel?: string;
  caseId?: string | null;
  caseTitle?: string | null;
  documentation?: string;
};

export type BlackOwnedScanBotPayload = {
  object: string;
  title: string;
  mode: string;
  tickMs: number;
  active: boolean;
  liveSurveillance: boolean;
  liveCertQueries: boolean;
  liveCrimeFeeds?: boolean;
  note: string;
  verifiedCount: number;
  candidateCount: number;
  queueLength: number;
  crimeCategoryCount?: number;
  crimeCaseCount?: number;
  scanActions: string[];
  sources: string[];
  targets: BlackOwnedScanTarget[];
  stream: BlackOwnedScanTick[];
};

export type BusinessCrimeCatalog = {
  object: string;
  title: string;
  period: string;
  note: string;
  liveFeeds: boolean;
  trends: Array<{ id: string; label: string; detail: string; source: string }>;
  categoryCount: number;
  caseCount: number;
  categories: Array<{
    id: string;
    label: string;
    definition: string;
    priority: string;
    businessLawHook: string;
  }>;
  cases: Array<{
    id: string;
    title: string;
    categoryId: string;
    categoryLabel: string;
    financialImpact: string;
    source: string;
    collectionStatus: string;
  }>;
};

function priorityTone(priority: string) {
  if (priority === "P1") return "bg-destructive text-destructive-foreground";
  if (priority === "P2") return "bg-amber-500/90 text-black";
  return "bg-muted text-muted-foreground";
}

function statusTone(status: BlackOwnedScanTick["status"]) {
  if (status === "logged-new") return "border-emerald-400/40 bg-emerald-500/10 text-emerald-200";
  if (status === "documented") return "border-rose-400/40 bg-rose-500/10 text-rose-100";
  if (status === "crime-search") return "border-sky-400/35 bg-sky-500/10 text-sky-100";
  if (status === "scanning") return "border-primary/40 bg-primary/10 text-primary";
  if (status === "revalidated") return "border-teal-400/30 bg-teal-500/10 text-teal-100";
  return "border-border/50 bg-background/40 text-muted-foreground";
}

export function BlackOwnedScanBot({ bot }: { bot: BlackOwnedScanBotPayload }) {
  const stream = useMemo(() => bot.stream ?? [], [bot.stream]);
  const [cursor, setCursor] = useState(0);
  const [clock, setClock] = useState("");
  const [log, setLog] = useState<BlackOwnedScanTick[]>([]);
  const [newCount, setNewCount] = useState(0);
  const [docCount, setDocCount] = useState(0);

  useEffect(() => {
    if (!stream.length) return;
    const tickMs = Math.max(500, bot.tickMs || 1600);
    setLog([stream[0]]);
    setCursor(0);
    setNewCount(stream[0]?.status === "logged-new" ? 1 : 0);
    setDocCount(stream[0]?.status === "documented" ? 1 : 0);
    setClock(new Date().toISOString());
    const id = window.setInterval(() => {
      setCursor((c) => {
        const next = (c + 1) % stream.length;
        const row = stream[next];
        setLog((prev) => [row, ...prev].slice(0, 28));
        if (row.status === "logged-new") setNewCount((n) => n + 1);
        if (row.status === "documented") setDocCount((n) => n + 1);
        setClock(new Date().toISOString());
        return next;
      });
    }, tickMs);
    return () => window.clearInterval(id);
  }, [stream, bot.tickMs]);

  const head = stream[cursor] ?? log[0] ?? null;
  const verified = useMemo(
    () => bot.targets.filter((t) => t.kind === "verified-roster"),
    [bot.targets],
  );
  const candidates = useMemo(
    () => bot.targets.filter((t) => t.kind === "new-to-scan"),
    [bot.targets],
  );

  return (
    <Card className="overflow-hidden border-emerald-500/20">
      <CardHeader className="border-b border-border/40">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 font-display text-lg">
              <span className="hud-beacon" aria-hidden />
              Black-owned scan bot · crime taxonomy search
            </CardTitle>
            <CardDescription className="mt-1 max-w-3xl">{bot.note}</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-emerald-500/20 text-emerald-200">ACTIVE 24/7</Badge>
            <Badge variant="outline">{bot.mode}</Badge>
            <Badge variant="outline">{bot.crimeCategoryCount ?? 52} crime cats</Badge>
            <Badge variant="outline">{bot.crimeCaseCount ?? 60} cases</Badge>
            <Badge variant="secondary">liveCrimeFeeds={String(bot.liveCrimeFeeds ?? false)}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 pt-4 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="hud-stat space-y-3 !items-stretch">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
            <span>Fixture clock · search + document violations</span>
            <span className="font-mono normal-case tracking-normal text-emerald-300/90">{clock}</span>
          </div>
          {head ? (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <Badge className={priorityTone(head.priority ?? head.target.priority)}>
                  {head.priority ?? head.target.priority}
                </Badge>
                <Badge variant="outline" className={cn("border", statusTone(head.status))}>
                  {head.status}
                </Badge>
                <Badge variant="secondary">{head.target.kind}</Badge>
              </div>
              <p className="font-display text-base leading-snug">{head.target.name}</p>
              <p className="text-sm text-muted-foreground">
                {head.target.city} · {head.target.sector} · {head.target.entityType}
              </p>
              {head.crimeCategoryLabel ? (
                <p className="rounded-md border border-sky-400/25 bg-sky-500/5 px-3 py-2 text-sm">
                  <span className="font-medium text-sky-100">{head.crimeCategoryLabel}</span>
                  {head.caseTitle ? (
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Case typology · {head.caseTitle}
                    </span>
                  ) : null}
                </p>
              ) : null}
              <p className="rounded-md border border-emerald-400/25 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-100/90">
                {head.documentation ?? head.message}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Scan stream empty — regenerate static data.</p>
          )}
          <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
            <div className="rounded-lg border border-border/40 px-2 py-2">
              <p className="font-display text-lg">{bot.queueLength}</p>
              <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">Queue</p>
            </div>
            <div className="rounded-lg border border-border/40 px-2 py-2">
              <p className="font-display text-lg">{newCount}</p>
              <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">New logged</p>
            </div>
            <div className="rounded-lg border border-border/40 px-2 py-2">
              <p className="font-display text-lg">{docCount}</p>
              <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">Documented</p>
            </div>
            <div className="rounded-lg border border-border/40 px-2 py-2">
              <p className="font-display text-lg">{stream.length}</p>
              <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">24/7 ticks</p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <p className="mb-2 text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
              Live scan / crime documentation log
            </p>
            <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
              {log.map((row) => (
                <li
                  key={`${row.id}-${row.seq}`}
                  className={cn("rounded-lg border px-2.5 py-2 text-xs", statusTone(row.status))}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-foreground">
                      {(row.priority ?? row.target.priority) + " · "}
                      {row.target.name}
                    </span>
                    <span className="font-mono text-[10px] uppercase opacity-80">{row.status}</span>
                  </div>
                  <p className="mt-0.5 text-muted-foreground">
                    {row.crimeCategoryLabel
                      ? `${row.crimeCategoryLabel}`
                      : `${row.target.city} · ${row.target.scanAction}`}
                  </p>
                </li>
              ))}
            </ul>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
                Verified roster
              </p>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {verified.slice(0, 6).map((t) => (
                  <li key={t.id}>
                    <span className="text-foreground">{t.name}</span> · {t.city}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1 text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
                New businesses to scan
              </p>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {candidates.slice(0, 6).map((t) => (
                  <li key={t.id}>
                    <span className="text-foreground">{t.name}</span> · {t.priority}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function BusinessCrimeCatalogPanel({ catalog }: { catalog: BusinessCrimeCatalog }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{catalog.title}</CardTitle>
        <CardDescription>{catalog.note}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{catalog.categoryCount} categories</Badge>
          <Badge variant="outline">{catalog.caseCount} cases</Badge>
          <Badge variant="secondary">liveFeeds={String(catalog.liveFeeds)}</Badge>
          <Badge variant="outline">{catalog.period}</Badge>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {catalog.trends.map((t) => (
            <div key={t.id} className="rounded-lg border border-border/50 px-3 py-2 text-sm">
              <p className="font-medium">{t.label}</p>
              <p className="text-xs text-muted-foreground">{t.detail}</p>
            </div>
          ))}
        </div>
        <div>
          <p className="mb-2 text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
            Violation categories searched on every company scan
          </p>
          <div className="grid max-h-56 gap-1.5 overflow-y-auto sm:grid-cols-2">
            {catalog.categories.map((c) => (
              <div key={c.id} className="rounded-md border border-border/40 px-2.5 py-1.5 text-xs">
                <span className="font-medium text-foreground">{c.label}</span>
                <span className="ml-2 text-muted-foreground">{c.priority}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
            Case typologies in scan DB
          </p>
          <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-muted-foreground">
            {catalog.cases.map((c) => (
              <li key={c.id}>
                <span className="text-foreground">{c.title}</span> · {c.categoryLabel} ·{" "}
                {c.financialImpact}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
