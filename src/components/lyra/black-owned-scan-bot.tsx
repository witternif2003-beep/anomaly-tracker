"use client";

import {
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  backlogCounters,
  discoveryIndexAt,
  discoveryStore,
  seedFromScanPayload,
  synthesizeBusiness,
  synthesizeViolation,
  type DiscoverySeed,
  type SyntheticBusiness,
} from "@/lib/continuous-discovery";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ScrollStableFeed } from "@/components/lyra/scroll-stable-feed";

export type BlackOwnedScanTarget = {
  id: string;
  name: string;
  normalizedName?: string;
  city: string;
  sector: string;
  entityType: string;
  kind: "verified-roster" | "new-to-scan" | "discovery-pool";
  blackOwned: boolean;
  ownershipVerification: string;
  signal: string;
  priority: string;
  scanAction: string;
  source: string;
  channelId?: string | null;
  fingerprint?: string;
  score?: number;
  queueStatus?: string;
};

export type BlackOwnedScanTick = {
  id: string;
  seq: number;
  loggedAtOffsetMs: number;
  status:
    | "scanning"
    | "queued"
    | "logged-new"
    | "revalidated"
    | "crime-search"
    | "documented"
    | "discovered"
    | "fingerprinted"
    | "gated"
    | "auto-queued"
    | "gate-pass"
    | "dead-lettered";
  target: BlackOwnedScanTarget;
  message: string;
  priority?: string;
  crimeCategoryId?: string;
  crimeCategoryLabel?: string;
  caseId?: string | null;
  caseTitle?: string | null;
  documentation?: string;
  stage?: string;
  autoQueued?: boolean;
};

export type BlackOwnedScanBotPayload = {
  object: string;
  title: string;
  mode: string;
  tickMs: number;
  discoveryTickMs?: number;
  schemaVersion?: number;
  active: boolean;
  autoQueueOnDiscover?: boolean;
  idempotentAdmit?: boolean;
  liveSurveillance: boolean;
  liveCertQueries: boolean;
  liveCrimeFeeds?: boolean;
  note: string;
  verifiedCount: number;
  candidateCount: number;
  discoveryPoolCount?: number;
  queueLength: number;
  queueCapacity?: number;
  crimeCategoryCount?: number;
  crimeCaseCount?: number;
  scanActions: string[];
  sources: string[];
  discoveryChannels?: Array<{
    id: string;
    label: string;
    priorityBoost: number;
    hardening: string;
  }>;
  pipelineStages?: string[];
  retryPolicy?: {
    maxAttempts: number;
    backoffMs: number;
    jitterPct: number;
    idempotentAdmit: boolean;
  };
  circuitBreaker?: {
    failureThreshold: number;
    cooldownMs: number;
    halfOpenProbes: number;
  };
  deadLetter?: { enabled: boolean; maxSize: number; reasons: string[] };
  integrityHash?: string;
  metrics?: Record<string, number>;
  hardening?: {
    title: string;
    gateCount: number;
    okCount: number;
    hardeningScore: number;
    allOk: boolean;
    note: string;
    results: Array<{ id: string; group: string; detail: string; ok: boolean }>;
  };
  discoverySynthesis?: DiscoverySeed;
  targets: BlackOwnedScanTarget[];
  discoveryPool?: BlackOwnedScanTarget[];
  queue?: BlackOwnedScanTarget[];
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

type QueueRow = BlackOwnedScanTarget & {
  admittedAt: string;
  autoQueued: boolean;
  discoveryChannel?: string;
};

type DiscoveryLog = {
  renderKey: string;
  at: string;
  business: string;
  priority: string;
  channel: string;
  action: string;
};

function priorityTone(priority: string) {
  if (priority === "P1") return "bg-destructive text-destructive-foreground";
  if (priority === "P2") return "bg-amber-500/90 text-black";
  return "bg-muted text-muted-foreground";
}

function statusTone(status: BlackOwnedScanTick["status"] | string) {
  if (status === "logged-new" || status === "auto-queued") {
    return "border-emerald-400/40 bg-emerald-500/10 text-emerald-200";
  }
  if (status === "documented") return "border-rose-400/40 bg-rose-500/10 text-rose-100";
  if (status === "crime-search") return "border-sky-400/35 bg-sky-500/10 text-sky-100";
  if (status === "scanning" || status === "discovered") {
    return "border-primary/40 bg-primary/10 text-primary";
  }
  if (status === "revalidated" || status === "gate-pass") {
    return "border-teal-400/30 bg-teal-500/10 text-teal-100";
  }
  if (status === "fingerprinted" || status === "gated") {
    return "border-violet-400/30 bg-violet-500/10 text-violet-100";
  }
  return "border-border/50 bg-background/40 text-muted-foreground";
}

/** Visible rows are capped; the counters keep climbing without growing the DOM. */
const QUEUE_RENDER_CAP = 120;

function syntheticToTarget(business: SyntheticBusiness): BlackOwnedScanTarget {
  return {
    id: business.id,
    name: business.name,
    normalizedName: business.name.toLowerCase(),
    city: business.city,
    sector: business.sector,
    entityType: business.entityType,
    kind: "discovery-pool",
    blackOwned: true,
    ownershipVerification: "pending-discovery",
    signal: business.signal,
    priority: business.priority,
    scanAction: "discovery-channel-normalize",
    source: business.source,
    channelId: business.channelId,
    fingerprint: business.fingerprint,
    queueStatus: "discovered",
  };
}

function sortByPriority(rows: QueueRow[]) {
  const rank = (p: string) => (p === "P1" ? 0 : p === "P2" ? 1 : 2);
  return [...rows].sort(
    (a, b) => rank(a.priority) - rank(b.priority) || (b.score ?? 0) - (a.score ?? 0),
  );
}

export function BlackOwnedScanBot({ bot }: { bot: BlackOwnedScanBotPayload }) {
  const stream = useMemo(() => bot.stream ?? [], [bot.stream]);
  const discoveryPool = useMemo(() => bot.discoveryPool ?? [], [bot.discoveryPool]);
  const seedQueue = useMemo(() => {
    const fromQueue = bot.queue ?? bot.targets.filter((t) => t.kind === "new-to-scan");
    return sortByPriority(
      fromQueue.map((t) => ({
        ...t,
        admittedAt: "seed",
        autoQueued: true,
        discoveryChannel: t.channelId ?? "seed",
      })),
    );
  }, [bot.queue, bot.targets]);

  const verified = useMemo(
    () => bot.targets.filter((t) => t.kind === "verified-roster"),
    [bot.targets],
  );

  const [cursor, setCursor] = useState(0);
  const [clock, setClock] = useState("");
  const [log, setLog] = useState<Array<BlackOwnedScanTick & { renderKey: string }>>([]);
  const [liveQueue, setLiveQueue] = useState<QueueRow[]>(seedQueue);
  const [poolCursor, setPoolCursor] = useState(0);
  const [discoveryLog, setDiscoveryLog] = useState<DiscoveryLog[]>([]);
  const [autoQueuedCount, setAutoQueuedCount] = useState(seedQueue.length);
  const [newCount, setNewCount] = useState(0);
  const [docCount, setDocCount] = useState(0);
  const [discoverCount, setDiscoverCount] = useState(0);
  const synthesis = useMemo(() => seedFromScanPayload(bot), [bot]);
  const counters = useSyncExternalStore(
    discoveryStore.subscribe,
    discoveryStore.getSnapshot,
    discoveryStore.getServerSnapshot,
  );
  const cursorRef = useRef(0);
  const discoveryIndexRef = useRef(0);
  const synthIndexRef = useRef(0);
  const streamRef = useRef(stream);
  const discoveryPoolRef = useRef(discoveryPool);
  const channelsRef = useRef(bot.discoveryChannels);
  const admittedKeysRef = useRef<Set<string>>(new Set());
  streamRef.current = stream;
  discoveryPoolRef.current = discoveryPool;
  channelsRef.current = bot.discoveryChannels;

  useEffect(() => {
    setLiveQueue(seedQueue);
    setAutoQueuedCount(seedQueue.length);
    admittedKeysRef.current = new Set(
      seedQueue.flatMap((t) => [t.id, t.fingerprint].filter(Boolean) as string[]),
    );
  }, [seedQueue]);

  useEffect(() => {
    if (!stream.length) return;
    const tickMs = Math.max(400, bot.tickMs || 900);
    const first = stream[0];
    cursorRef.current = 0;
    setLog([{ ...first, renderKey: `${first.id}-boot-${Date.now()}` }]);
    setCursor(0);
    setNewCount(first?.status === "logged-new" || first?.status === "auto-queued" ? 1 : 0);
    setDocCount(first?.status === "documented" ? 1 : 0);
    setDiscoverCount(first?.status === "discovered" ? 1 : 0);
    setClock(new Date().toISOString());
    const id = window.setInterval(() => {
      const rows = streamRef.current;
      if (!rows.length) return;
      const next = (cursorRef.current + 1) % rows.length;
      cursorRef.current = next;
      const row = rows[next];
      setCursor(next);
      setLog((prev) =>
        [{ ...row, renderKey: `${row.id}-${row.seq}-${Date.now()}-${prev.length}` }, ...prev].slice(0, 36),
      );
      if (row.status === "logged-new" || row.status === "auto-queued") {
        setNewCount((n) => n + 1);
      }
      if (row.status === "documented") setDocCount((n) => n + 1);
      if (row.status === "discovered") setDiscoverCount((n) => n + 1);
      setClock(new Date().toISOString());
    }, tickMs);
    return () => window.clearInterval(id);
  }, [stream, bot.tickMs]);

  // Credit the 24/7 backlog earned while the console was closed, then never go back down.
  useEffect(() => {
    discoveryStore.floor(backlogCounters(Date.now(), synthesis?.epochMs));
  }, [synthesis]);

  // 24/7 discovery → auto-queue. Plain interval + refs only (no useEffectEvent — React #440 under concurrent render).
  useEffect(() => {
    if (!bot.autoQueueOnDiscover) return;
    if (!discoveryPool.length && !synthesis) return;
    const tickMs = Math.max(800, bot.discoveryTickMs || 2200);
    discoveryIndexRef.current = 0;
    synthIndexRef.current = discoveryIndexAt(Date.now(), tickMs, synthesis?.epochMs);
    const id = window.setInterval(() => {
      const pool = discoveryPoolRef.current;
      const step = discoveryIndexRef.current;
      discoveryIndexRef.current = step + 1;
      // The baked pool is a seed, not a ceiling: past its end the search keeps
      // synthesizing never-before-seen fixture businesses, forever.
      const synthetic =
        step >= pool.length && synthesis
          ? synthesizeBusiness(synthIndexRef.current++, synthesis)
          : null;
      const candidate = synthetic
        ? syntheticToTarget(synthetic)
        : pool[step % Math.max(1, pool.length)];
      if (!candidate) return;
      setPoolCursor(Math.min(step + 1, pool.length));

      const admitKey = candidate.fingerprint || candidate.id;
      if (admittedKeysRef.current.has(candidate.id) || admittedKeysRef.current.has(admitKey)) {
        return;
      }
      admittedKeysRef.current.add(candidate.id);
      if (candidate.fingerprint) admittedKeysRef.current.add(candidate.fingerprint);

      const admittedAt = new Date().toISOString();
      const channel =
        channelsRef.current?.find((c) => c.id === candidate.channelId)?.label ??
        candidate.channelId ??
        "discovery";
      const violation =
        synthetic && synthesis
          ? synthesizeViolation(synthetic.index, synthetic, synthesis)
          : null;

      discoveryStore.advance({
        discovered: 1,
        autoQueued: 1,
        businesses: 1,
        violations: violation ? 1 : 0,
        p1Violations: violation?.priority === "P1" ? 1 : 0,
        documented: violation ? 1 : 0,
        ticks: 1,
      });

      startTransition(() => {
        setLiveQueue((prev) => {
          if (prev.some((p) => p.id === candidate.id || p.fingerprint === candidate.fingerprint)) {
            return prev;
          }
          const nextRow: QueueRow = {
            ...candidate,
            kind: "new-to-scan",
            ownershipVerification: "pending-scan",
            scanAction: "auto-queue-admit",
            source: "auto-queue-admitter",
            queueStatus: "auto-queued",
            admittedAt,
            autoQueued: true,
            discoveryChannel: channel,
          };
          return sortByPriority([nextRow, ...prev]).slice(0, QUEUE_RENDER_CAP);
        });
        setDiscoveryLog((prev) =>
          [
            {
              renderKey: `${candidate.id}-${admittedAt}`,
              at: admittedAt,
              business: candidate.name,
              priority: candidate.priority,
              channel,
              action: violation
                ? `AUTO-QUEUED + ${violation.categoryLabel}`
                : "AUTO-QUEUED on discover",
            },
            ...prev,
          ].slice(0, 24),
        );
        setLog((prev) =>
          [
            {
              id: `live-autoq-${candidate.id}-${Date.now()}`,
              seq: prev.length + 1,
              loggedAtOffsetMs: 0,
              status: (violation ? "documented" : "auto-queued") as
                | "documented"
                | "auto-queued",
              target: { ...candidate, kind: "new-to-scan" as const },
              message: violation
                ? `NEW VIOLATION · ${violation.title} · discovered via ${channel} → documented`
                : `AUTO-QUEUED · ${candidate.name} discovered via ${channel} → scan queue`,
              priority: violation?.priority ?? candidate.priority,
              crimeCategoryId: violation?.categoryId,
              crimeCategoryLabel: violation?.categoryLabel,
              documentation: violation?.documentation,
              stage: violation ? "crime-scan" : "auto-queue",
              autoQueued: true,
              renderKey: `live-autoq-${candidate.id}-${Date.now()}`,
            },
            ...prev,
          ].slice(0, 36),
        );
      });
    }, tickMs);
    return () => window.clearInterval(id);
  }, [bot.autoQueueOnDiscover, bot.discoveryTickMs, discoveryPool, synthesis]);

  const head = stream[cursor] ?? log[0] ?? null;
  const hardening = bot.hardening;
  const p1Queued = liveQueue.filter((q) => q.priority === "P1").length;
  const remainingPool = Math.max(0, discoveryPool.length - Math.min(poolCursor, discoveryPool.length));

  return (
    <Card className="overflow-hidden border-emerald-500/25">
      <CardHeader className="border-b border-border/40">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 font-display text-lg">
              <span className="hud-beacon" aria-hidden />
              {bot.title}
            </CardTitle>
            <CardDescription className="mt-1 max-w-3xl">{bot.note}</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-emerald-500/20 text-emerald-200">ACTIVE 24/7</Badge>
            <Badge className="bg-amber-500/20 text-amber-100">SOTA · BO SCAN</Badge>
            <Badge className="bg-sky-500/20 text-sky-100">AUTO-QUEUE ON DISCOVER</Badge>
            <Badge className="bg-violet-500/20 text-violet-100">DISCOVERY→QUEUE</Badge>
            <Badge variant="outline">schema v{bot.schemaVersion ?? 3}</Badge>
            <Badge variant="outline">{bot.crimeCategoryCount ?? 52} crime cats</Badge>
            <Badge variant="outline">{bot.crimeCaseCount ?? 60} cases</Badge>
            <Badge variant="secondary">
              harden {hardening?.hardeningScore ?? 0}/{hardening?.gateCount ?? 0}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 pt-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
            <span>Discovery → fingerprint → gate → auto-queue → crime scan</span>
            <span className="font-mono normal-case tracking-normal text-emerald-300/90">{clock}</span>
          </div>

          {head ? (
            <div className="space-y-2 rounded-xl border border-emerald-400/20 bg-emerald-500/5 p-3">
              <div className="flex flex-wrap gap-2">
                <Badge className={priorityTone(head.priority ?? head.target.priority)}>
                  {head.priority ?? head.target.priority}
                </Badge>
                <Badge variant="outline" className={cn("border", statusTone(head.status))}>
                  {head.status}
                </Badge>
                {head.stage ? <Badge variant="secondary">{head.stage}</Badge> : null}
                {head.autoQueued ? <Badge className="bg-sky-500/20 text-sky-100">auto-queued</Badge> : null}
              </div>
              <p className="font-display text-base leading-snug">{head.target.name}</p>
              <p className="text-sm text-muted-foreground">
                {head.target.city} · {head.target.sector} · {head.target.entityType}
                {head.target.fingerprint ? ` · fp ${head.target.fingerprint.slice(0, 8)}` : ""}
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
              <p className="text-sm text-emerald-100/90">{head.documentation ?? head.message}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Scan stream empty — regenerate static data.</p>
          )}

          <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-3 lg:grid-cols-7">
            <div className="rounded-lg border border-border/40 px-2 py-2">
              <p className="font-display text-lg">{liveQueue.length}</p>
              <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">Live queue</p>
            </div>
            <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/5 px-2 py-2">
              <p className="font-display text-lg text-emerald-100">
                {(verified.length + newCount + counters.businesses).toLocaleString()}
              </p>
              <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">Businesses</p>
            </div>
            <div className="rounded-lg border border-border/40 px-2 py-2">
              <p className="font-display text-lg">
                {(autoQueuedCount + counters.autoQueued).toLocaleString()}
              </p>
              <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">Auto-queued</p>
            </div>
            <div className="rounded-lg border border-border/40 px-2 py-2">
              <p className="font-display text-lg">{p1Queued}</p>
              <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">P1 in queue</p>
            </div>
            <div className="rounded-lg border border-border/40 px-2 py-2">
              <p className="font-display text-lg">
                {(discoverCount + counters.discovered).toLocaleString()}
              </p>
              <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">Discovered</p>
            </div>
            <div className="rounded-lg border border-border/40 px-2 py-2">
              <p className="font-display text-lg">
                {(docCount + counters.documented).toLocaleString()}
              </p>
              <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">Documented</p>
            </div>
            <div className="rounded-lg border border-border/40 px-2 py-2">
              <p className="font-display text-lg">
                {(stream.length + counters.ticks).toLocaleString()}
              </p>
              <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">24/7 ticks</p>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div>
              <p className="mb-1 text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
                Verified roster · {verified.length}
              </p>
              <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                {verified.map((t) => (
                  <li key={t.id}>
                    <span className="text-foreground">{t.name}</span> · {t.city}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1 text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
                New businesses to scan · live queue {liveQueue.length}
                {remainingPool ? ` · pool ${discoveryPool.length}` : ""}
                {counters.businesses
                  ? ` · synthesized ${counters.businesses.toLocaleString()}`
                  : ""}
              </p>
              <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                {liveQueue.map((t) => (
                  <li key={`${t.id}-${t.admittedAt}`} className="flex flex-wrap items-center gap-1.5">
                    <span className="text-foreground">{t.name}</span>
                    <Badge className={cn("h-5 px-1.5 text-[10px]", priorityTone(t.priority))}>
                      {t.priority}
                    </Badge>
                    {t.autoQueued ? (
                      <span className="font-mono text-[10px] text-emerald-300/80">auto</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <p className="mb-2 text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
              Auto-queue discovery log
            </p>
            <ScrollStableFeed heightClassName="h-40 max-h-40" className="gap-1.5">
              {discoveryLog.length ? (
                discoveryLog.map((row) => (
                  <div
                    key={row.renderKey}
                    className="rounded-lg border border-emerald-400/25 bg-emerald-500/5 px-2.5 py-2 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-foreground">
                        {row.priority} · {row.business}
                      </span>
                      <span className="font-mono text-[10px] text-emerald-200/90">{row.action}</span>
                    </div>
                    <p className="mt-0.5 text-muted-foreground">{row.channel}</p>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-border/40 px-2.5 py-2 text-xs text-muted-foreground">
                  Waiting for next discovery pulse — new finds auto-admit to the scan queue.
                </div>
              )}
            </ScrollStableFeed>
          </div>

          <div>
            <p className="mb-2 text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
              Live scan / crime documentation log
            </p>
            <ScrollStableFeed heightClassName="h-56 max-h-56" className="gap-1.5">
              {log.map((row) => (
                <div
                  key={row.renderKey}
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
                      ? row.crimeCategoryLabel
                      : `${row.target.city} · ${row.target.scanAction}`}
                  </p>
                </div>
              ))}
            </ScrollStableFeed>
          </div>

          {hardening ? (
            <div className="rounded-xl border border-teal-400/25 bg-teal-500/5 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
                  Pipeline hardening · {hardening.title}
                </p>
                <Badge
                  className={
                    hardening.allOk
                      ? "bg-emerald-500/20 text-emerald-100"
                      : "bg-amber-500/20 text-amber-100"
                  }
                >
                  {hardening.hardeningScore}/100 · {hardening.okCount}/{hardening.gateCount} gates
                </Badge>
              </div>
              <p className="mb-2 text-xs text-muted-foreground">{hardening.note}</p>
              <div className="mb-2 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
                <span>hash {bot.integrityHash?.slice(0, 12)}</span>
                <span>· retries {bot.retryPolicy?.maxAttempts}</span>
                <span>· breaker {bot.circuitBreaker?.failureThreshold}</span>
                <span>· dead-letter {String(bot.deadLetter?.enabled)}</span>
                <span>· idempotent {String(bot.idempotentAdmit)}</span>
              </div>
              <ul className="max-h-36 space-y-1 overflow-y-auto text-[11px]">
                {hardening.results.map((gate) => (
                  <li
                    key={gate.id}
                    className={cn(
                      "flex items-start justify-between gap-2 rounded border px-2 py-1",
                      gate.ok
                        ? "border-emerald-400/20 text-emerald-100/90"
                        : "border-rose-400/30 text-rose-100",
                    )}
                  >
                    <span>
                      <span className="font-mono text-[10px] uppercase opacity-70">{gate.group}</span>{" "}
                      {gate.detail}
                    </span>
                    <span className="font-mono text-[10px] uppercase">{gate.ok ? "ok" : "fail"}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {bot.discoveryChannels?.length ? (
            <div>
              <p className="mb-1 text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
                Discovery channels
              </p>
              <div className="flex flex-wrap gap-1.5">
                {bot.discoveryChannels.map((ch) => (
                  <Badge key={ch.id} variant="outline" className="text-[10px]">
                    {ch.label} · +{ch.priorityBoost}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
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
