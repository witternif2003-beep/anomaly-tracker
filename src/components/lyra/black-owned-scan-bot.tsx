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
  status: "scanning" | "queued" | "logged-new" | "revalidated";
  target: BlackOwnedScanTarget;
  message: string;
};

export type BlackOwnedScanBotPayload = {
  object: string;
  title: string;
  mode: string;
  tickMs: number;
  active: boolean;
  liveSurveillance: boolean;
  liveCertQueries: boolean;
  note: string;
  verifiedCount: number;
  candidateCount: number;
  queueLength: number;
  scanActions: string[];
  sources: string[];
  targets: BlackOwnedScanTarget[];
  stream: BlackOwnedScanTick[];
};

function priorityTone(priority: string) {
  if (priority === "P1") return "bg-destructive text-destructive-foreground";
  if (priority === "P2") return "bg-amber-500/90 text-black";
  return "bg-muted text-muted-foreground";
}

function statusTone(status: BlackOwnedScanTick["status"]) {
  if (status === "logged-new") return "border-emerald-400/40 bg-emerald-500/10 text-emerald-200";
  if (status === "scanning") return "border-primary/40 bg-primary/10 text-primary";
  if (status === "revalidated") return "border-sky-400/30 bg-sky-500/10 text-sky-200";
  return "border-border/50 bg-background/40 text-muted-foreground";
}

export function BlackOwnedScanBot({ bot }: { bot: BlackOwnedScanBotPayload }) {
  const stream = useMemo(() => bot.stream ?? [], [bot.stream]);
  const [cursor, setCursor] = useState(0);
  const [clock, setClock] = useState("");
  const [log, setLog] = useState<BlackOwnedScanTick[]>([]);
  const [newCount, setNewCount] = useState(0);

  useEffect(() => {
    if (!stream.length) return;
    const tickMs = Math.max(500, bot.tickMs || 1600);
    setLog([stream[0]]);
    setCursor(0);
    setNewCount(stream[0]?.status === "logged-new" ? 1 : 0);
    setClock(new Date().toISOString());
    const id = window.setInterval(() => {
      setCursor((c) => {
        const next = (c + 1) % stream.length;
        const row = stream[next];
        setLog((prev) => [row, ...prev].slice(0, 24));
        if (row.status === "logged-new") setNewCount((n) => n + 1);
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
              Black-owned scan bot
            </CardTitle>
            <CardDescription className="mt-1 max-w-3xl">{bot.note}</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-emerald-500/20 text-emerald-200">ACTIVE 24/7</Badge>
            <Badge variant="outline">{bot.mode}</Badge>
            <Badge variant="outline">{bot.verifiedCount} verified roster</Badge>
            <Badge variant="outline">{bot.candidateCount} new-to-scan</Badge>
            <Badge variant="secondary">liveCERT={String(bot.liveCertQueries)}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 pt-4 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="hud-stat space-y-3 !items-stretch">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
            <span>Fixture clock · searching Black-owned businesses</span>
            <span className="font-mono normal-case tracking-normal text-emerald-300/90">{clock}</span>
          </div>
          {head ? (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <Badge className={priorityTone(head.target.priority)}>{head.target.priority}</Badge>
                <Badge variant="outline" className={cn("border", statusTone(head.status))}>
                  {head.status}
                </Badge>
                <Badge variant="secondary">{head.target.kind}</Badge>
              </div>
              <p className="font-display text-base leading-snug">{head.target.name}</p>
              <p className="text-sm text-muted-foreground">
                {head.target.city} · {head.target.sector} · {head.target.entityType}
              </p>
              <p className="rounded-md border border-emerald-400/25 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-100/90">
                {head.message}
              </p>
              <p className="font-mono text-xs text-muted-foreground">
                action={head.target.scanAction} · source={head.target.source} · signal=
                {head.target.signal}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Scan stream empty — regenerate static data.</p>
          )}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border border-border/40 px-2 py-2">
              <p className="font-display text-lg">{bot.queueLength}</p>
              <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">Queue</p>
            </div>
            <div className="rounded-lg border border-border/40 px-2 py-2">
              <p className="font-display text-lg">{newCount}</p>
              <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">New logged</p>
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
              Live scan log
            </p>
            <ul className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
              {log.map((row) => (
                <li
                  key={`${row.id}-${row.seq}-${row.target.id}`}
                  className={cn(
                    "rounded-lg border px-2.5 py-2 text-xs",
                    statusTone(row.status),
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-foreground">{row.target.name}</span>
                    <span className="font-mono text-[10px] uppercase opacity-80">{row.status}</span>
                  </div>
                  <p className="mt-0.5 text-muted-foreground">
                    {row.target.city} · {row.target.scanAction}
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
                {verified.slice(0, 7).map((t) => (
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
                {candidates.slice(0, 7).map((t) => (
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
