"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LoaderCircleIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { fetchJsonWithStaticFallback } from "@/lib/static-data";
import { LiveTelemetryFeed, type TelemetryPayload } from "@/components/lyra/live-telemetry-feed";

interface SceneNode {
  id: string;
  label: string;
  entityType: string;
  priority: string;
  position: { x: number; y: number; z: number };
  city: string;
  anomalyCount: number;
}

interface Anomaly {
  id: string;
  priority: string;
  title: string;
  entityName: string;
  categoryId?: string;
  categoryLabel: string;
  action: string;
  indicator: string;
  doctrine: string[];
  source: string;
  fbiCategory?: string;
  artifact?: string;
  collectionStatus?: string;
  narrativeTimestamp?: string;
  wontDo?: string | null;
}

interface Improvement {
  id: string;
  priority: string;
  title: string;
  categoryLabel: string;
  entityTypeLabel: string;
  recommendation: string;
  seedId?: number;
  requestedAsset?: string;
  closestAsset?: string;
  installStatus?: string;
  wontDo?: string | null;
}

interface ImprovementSeed {
  id: number;
  title: string;
  requested: string;
  closest: string;
  assetId: string | null;
  categoryId: string;
  impact: string;
  status: string;
  install: boolean;
  wontDo?: string;
}

interface TrackerBook {
  classified: boolean;
  governmentProgram: boolean;
  simulated: boolean;
  liveSurveillance: boolean;
  note: string;
  title: string;
  summary: {
    entityTypes: number;
    entities: number;
    anomalies: number;
    p1Events: number;
    improvements: number;
    improvementSeeds?: number;
    evidenceElements?: number;
    telemetryTicks?: number;
    telemetryP1Ticks?: number;
    telemetryActive?: boolean;
    fbiCategoryMaps?: number;
    postdocImprovements?: number;
    postdocAxes?: number;
    taxonomyCategories: number;
    p1InventorySlots: number;
    mcpServers: number;
    intercepts: boolean;
    cjisLiveQueries: boolean;
  };
  telemetry?: TelemetryPayload;
  evidenceMap?: {
    title: string;
    note: string;
    fbiToCorporate: Array<{
      fbiCategory: string;
      corporateCategoryId: string;
      corporateLabel: string;
      businessLawHook: string;
    }>;
    elements: Array<{
      id: string;
      fbiCategory: string;
      corporateCategoryId: string;
      priority: string;
      title: string;
      artifact: string;
      detail: string;
      timestamp: string;
      collectionStatus: string;
      wontDo?: string;
    }>;
    elementCount: number;
    fixtureCount: number;
    constrainedCount: number;
  };
  byFbiCategory?: Record<string, number>;
  improvementAnnex?: {
    title: string;
    note: string;
    seedCount: number;
    generatedTotal: number;
    installableClosest: number;
    wontDoCount: number;
    seeds: ImprovementSeed[];
  };
  researchAgenda?: {
    title: string;
    note: string;
    questionCount: number;
    constrainedCount: number;
    questions: Array<{
      id: string;
      title: string;
      question: string;
      lyraBinding: string;
      status: string;
      wontDo: string | null;
    }>;
  };
  postdocCatalog?: {
    title: string;
    note: string;
    total: number;
    axisCount: number;
    openCount: number;
    constrainedCount: number;
    axes: Array<{ id: string; label: string; prompt: string }>;
    data: Array<{
      id: string;
      index: number;
      axisId: string;
      axisLabel: string;
      title: string;
      question: string;
      method: string;
      falsifier: string;
      deliverable: string;
      lyraBinding: string;
      categoryLabel: string;
      entityTypeLabel: string;
      fbiCategory: string | null;
      artifact: string | null;
      rqAnchor: string;
      status: string;
      wontDo: string | null;
      priority: string;
    }>;
  };
  pipelineHealth?: {
    title: string;
    note: string;
    checks: Array<{ id: string; ok: boolean; detail: string }>;
  };
  priorityCounts: { P1: number; P2: number; P3: number };
  architecture: {
    title?: string;
    note?: string;
    layers: Array<{ id: string; title: string; detail: string }>;
    systemOverview?: Array<{
      id: string;
      layer: string;
      proposed: string;
      function: string;
      status: string;
      shipped: string;
      note: string;
    }>;
    dataFlow?: Array<{
      step: number;
      id: string;
      title: string;
      proposed: string;
      status: string;
      shipped: string;
      live: boolean;
    }>;
  };
  scene: { nodes: SceneNode[]; realtime?: string; telemetryActive?: boolean };
  entities: Array<{
    id: string;
    name: string;
    entityType: string;
    city: { label: string };
  }>;
  anomalies: Anomaly[];
  p1Queue: Anomaly[];
  improvements: { total: number; generated: number; data: Improvement[] };
  inventoryLedger?: {
    title: string;
    note: string;
    additionalSlots: number;
    coreRuntime: Array<{ name: string; version: string; purpose: string; status: string }>;
    sections: Array<{
      id: string;
      title: string;
      items: Array<{
        requested: string;
        closest?: string;
        category?: string;
        installOk?: boolean;
        installDetail?: string | null;
        status?: string;
      }>;
    }>;
    wontInstall: Array<{ id: string; title: string; reason: string }>;
    liveInventory: { assets: number; ok: number; cuckooLiveSandbox: boolean };
  };
  wontDo: Array<{ id: string; title: string; reason: string }>;
  automation: {
    commands: string[];
    title?: string;
    note?: string;
    liveSurveillance?: boolean;
    slackWebhooks?: boolean;
    scripts?: Array<{ id: string; path: string; status: string; detail: string }>;
    rejectedResearchSteps?: Array<{ id: string; title: string; reason: string }>;
  };
  dependencyStrategy: {
    lockfile: string;
    install: string;
    note: string;
    p1Slots: number;
    requirements?: string;
    verify?: string;
    productName?: string;
    rejectedLockfileName?: string;
    npmCore?: Array<{ requested: string; version: string; status: string }>;
    unpublishedScopes?: Array<{ requested: string; closest: string[]; assetId: string }>;
    python?: {
      requirementsFile: string;
      rows: Array<{ requested: string; closest: string; wontInstall?: boolean }>;
    };
    commands?: string[];
    verifyStatus?: Record<string, { ok: boolean; detail?: string }> | null;
  };
  mcp?: {
    config: string;
    note: string;
    installCommand?: string;
    npmScript?: string;
    servers: string[];
    wiredCount?: number;
    audit?: {
      title: string;
      rows: Array<{
        requested: string;
        wiredId: string | null;
        closestPackage: string;
        status: string;
      }>;
      wontAddToMcpJson: string[];
      commands: string[];
    };
  };
  credentials?: {
    title?: string;
    note: string;
    placeholderCount?: number;
    configuredCount?: number;
    secretsSkippedByOperator?: boolean;
    vault?: { status: string; shipped: string; note: string; exampleFile?: string };
    groups?: Array<{
      id: string;
      title: string;
      liveQueries?: boolean;
      variables: Array<{ name: string; purpose: string; status?: string }>;
    }>;
    cjis?: { liveQueries: boolean; certifiedInterface: boolean };
    wontDo?: Array<{ id: string; title: string; reason: string }>;
    commands?: string[];
    variables: Array<{ name: string; configured: boolean }>;
  };
}

function priorityTone(priority: string) {
  if (priority === "P1") return "bg-destructive/80 text-destructive-foreground";
  if (priority === "P2") return "bg-primary/80 text-primary-foreground";
  if (priority === "P3") return "bg-secondary text-secondary-foreground";
  return "bg-muted text-muted-foreground";
}

export function AnomalyTracker({ initialData }: { initialData?: TrackerBook }) {
  const [book, setBook] = useState<TrackerBook | null>(initialData ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(!initialData);
  const [q, setQ] = useState("");
  const [priority, setPriority] = useState<string>("");
  const [selected, setSelected] = useState<string | null>(initialData?.p1Queue?.[0]?.id ?? null);
  const [tick, setTick] = useState(0);
  const [postdocQ, setPostdocQ] = useState("");
  const [postdocAxis, setPostdocAxis] = useState("");
  const [postdocShow, setPostdocShow] = useState(50);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (priority) params.set("priority", priority);
      params.set("improvementLimit", "36");
      const { data } = await fetchJsonWithStaticFallback<TrackerBook & { error?: string }>(
        `/api/anomaly?${params.toString()}`,
        "/static/anomaly.json",
        { preferStatic: true },
      );
      if (data.error) {
        if (!initialData) {
          setBook(null);
          setError(data.error);
        }
        return;
      }
      setBook(data);
      if (!selected && data.p1Queue[0]) setSelected(data.p1Queue[0].id);
    } catch {
      if (!initialData) {
        setBook(null);
        setError("Could not reach the anomaly tracker.");
      }
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (initialData) {
      setBusy(false);
      return;
    }
    void load();
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1200);
    return () => window.clearInterval(id);
  }, []);

  const filteredAnomalies = useMemo(() => {
    if (!book) return [];
    const needle = q.trim().toLowerCase();
    return book.anomalies.filter((a) => {
      if (priority && a.priority !== priority) return false;
      if (!needle) return true;
      return `${a.title} ${a.entityName} ${a.categoryLabel} ${a.indicator}`
        .toLowerCase()
        .includes(needle);
    });
  }, [book, q, priority]);

  const filteredImprovements = useMemo(() => {
    if (!book) return [];
    const needle = q.trim().toLowerCase();
    return book.improvements.data.filter((imp) => {
      if (priority && imp.priority !== priority) return false;
      if (!needle) return true;
      return `${imp.title} ${imp.recommendation} ${imp.categoryLabel} ${imp.entityTypeLabel}`
        .toLowerCase()
        .includes(needle);
    });
  }, [book, q, priority]);

  const selectedAnomaly = useMemo(() => {
    if (!book || !selected) return null;
    return book.anomalies.find((a) => a.id === selected) ?? null;
  }, [book, selected]);

  const filteredPostdoc = useMemo(() => {
    if (!book?.postdocCatalog) return [];
    const needle = postdocQ.trim().toLowerCase();
    return book.postdocCatalog.data.filter((item) => {
      if (postdocAxis && item.axisId !== postdocAxis) return false;
      if (!needle) return true;
      return `${item.title} ${item.question} ${item.method} ${item.artifact ?? ""} ${item.fbiCategory ?? ""} ${item.axisLabel}`
        .toLowerCase()
        .includes(needle);
    });
  }, [book, postdocQ, postdocAxis]);

  return (
    <div className="relative flex flex-1 flex-col">
      <header className="border-b border-border/40 bg-transparent">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-6">
          <div>
            <p className="flex items-center gap-2 text-[10px] tracking-[0.22em] text-primary/80 uppercase">
              <span className="hud-beacon" aria-hidden />
              24/7 fixture-clock telemetry · taxonomy-bound · unclassified
            </p>
            <p className="font-display text-3xl leading-none tracking-tight">Anomaly tracker</p>
            <p className="mt-2 max-w-2xl text-xs text-muted-foreground">
              Active P1 incident stream over every fixture business. Corporate LE narrative — not live
              device tracking, intercepts, or NCIC.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="ghost" className="glass-rail" onClick={() => void load()} disabled={busy}>
              Reload
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
        {busy && !book ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <LoaderCircleIcon className="size-4 animate-spin" />
                Compiling tracker
              </CardTitle>
              <CardDescription>Loading fixtures, taxonomy map, and 10k+ improvements.</CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        {error ? (
          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle>Could not compile</CardTitle>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button type="button" onClick={() => void load()}>
                Try again
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {book ? (
          <>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{book.note}</p>

            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">classified={String(book.classified)}</Badge>
              <Badge variant="outline">simulated={String(book.simulated)}</Badge>
              <Badge variant="outline">liveSurveillance={String(book.liveSurveillance)}</Badge>
              <Badge className="bg-emerald-500/20 text-emerald-200">
                telemetry={book.summary.telemetryActive ? "ACTIVE 24/7" : "off"}
              </Badge>
              <Badge variant="outline">
                {book.summary.p1Events} P1 · {book.summary.anomalies} events
              </Badge>
              <Badge variant="outline">
                {(book.summary.telemetryTicks ?? 0).toLocaleString()} telemetry ticks
              </Badge>
              <Badge variant="outline">
                {book.summary.evidenceElements ?? 0} evidence elements
              </Badge>
              <Badge variant="outline">{book.summary.improvements.toLocaleString()} improvements</Badge>
              <Badge variant="outline">
                {book.summary.postdocImprovements ?? book.postdocCatalog?.total ?? 0} post-doc
              </Badge>
              <Badge variant="outline">{book.summary.entityTypes} entity types</Badge>
              <Badge variant="outline">tick {tick}</Badge>
            </div>

            {book.telemetry ? (
              <LiveTelemetryFeed
                telemetry={book.telemetry}
                entities={book.entities}
                anomalies={book.anomalies}
                onSelectAnomaly={(id) => setSelected(id)}
                preferP1
              />
            ) : null}

            {book.evidenceMap ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">FBI typology → corporate business-law map</CardTitle>
                  <CardDescription>{book.evidenceMap.note}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-2 md:grid-cols-2">
                    {book.evidenceMap.fbiToCorporate.map((row) => (
                      <div key={row.fbiCategory} className="hud-stat !items-start gap-1">
                        <p className="text-[10px] tracking-[0.16em] text-primary/80 uppercase">
                          {row.fbiCategory}
                        </p>
                        <p className="font-display text-sm leading-snug">{row.corporateLabel}</p>
                        <p className="text-xs leading-5 text-muted-foreground">{row.businessLawHook}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>{book.evidenceMap.elementCount} narrative elements</span>
                    <span>·</span>
                    <span>{book.evidenceMap.fixtureCount} fixture-collectable</span>
                    <span>·</span>
                    <span>{book.evidenceMap.constrainedCount} constrained / wont-do</span>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className="mb-1 block text-xs text-muted-foreground" htmlFor="tracker-q">
                  Filter
                </label>
                <Input
                  id="tracker-q"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="OFAC, legal hold, Slack…"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {["", "P1", "P2", "P3"].map((p) => (
                  <Button
                    key={p || "all"}
                    type="button"
                    size="sm"
                    variant={priority === p ? "default" : "outline"}
                    onClick={() => setPriority(p)}
                  >
                    {p || "All"}
                  </Button>
                ))}
                <Button type="button" size="sm" onClick={() => void load()} disabled={busy}>
                  Apply
                </Button>
              </div>
            </div>

            <section className="tracker-stage relative overflow-hidden rounded-xl border border-border/60">
              <div className="tracker-grid absolute inset-0" aria-hidden />
              <div className="tracker-scene relative mx-auto h-[min(62vh,520px)] w-full max-w-5xl">
                {book.scene.nodes.map((node, i) => {
                  const left = 50 + node.position.x * 0.72;
                  const top = 52 - node.position.z * 0.55 - node.position.y * 0.35;
                  const scale = 0.85 + node.position.y / 80;
                  const isHot = node.priority === "P1";
                  return (
                    <button
                      key={node.id}
                      type="button"
                      className={cn(
                        "tracker-node absolute -translate-x-1/2 -translate-y-1/2 rounded-full border px-2 py-1 text-left transition",
                        isHot ? "tracker-pulse border-destructive/70 bg-destructive/20" : "border-border/70 bg-card/80",
                      )}
                      style={{
                        left: `${left}%`,
                        top: `${top}%`,
                        transform: `translate(-50%, -50%) scale(${scale}) rotateX(12deg)`,
                        animationDelay: `${(i % 6) * 0.18}s`,
                        zIndex: Math.round(40 + node.position.y),
                      }}
                      onClick={() => {
                        const hit = book.anomalies.find((a) => a.entityName === node.label);
                        if (hit) setSelected(hit.id);
                      }}
                      title={`${node.label} · ${node.city}`}
                    >
                      <span className={cn("mr-1 inline-block size-1.5 rounded-full", priorityTone(node.priority))} />
                      <span className="text-[10px] font-medium tracking-wide sm:text-xs">{node.label}</span>
                      {node.anomalyCount > 0 ? (
                        <span className="ml-1 text-[10px] text-muted-foreground">{node.anomalyCount}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/90 to-transparent px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  CSS perspective scene · fixture cities · P1 nodes elevate. Not live device tracking.
                </p>
              </div>
            </section>

            <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Event queue</CardTitle>
                  <CardDescription>
                    P1 {book.priorityCounts.P1} · P2 {book.priorityCounts.P2} · P3 {book.priorityCounts.P3}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex max-h-[420px] flex-col gap-2 overflow-y-auto">
                  {filteredAnomalies.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setSelected(a.id)}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-left transition",
                        selected === a.id ? "border-primary/60 bg-primary/10" : "border-border/60 hover:bg-muted/40",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Badge className={priorityTone(a.priority)}>{a.priority}</Badge>
                        <span className="text-sm font-medium">{a.title}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {a.entityName} · {a.categoryLabel}
                      </p>
                    </button>
                  ))}
                  {!filteredAnomalies.length ? (
                    <p className="text-sm text-muted-foreground">No events match this filter.</p>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Selected response</CardTitle>
                  <CardDescription>Operational action from hard-coded fixtures</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {selectedAnomaly ? (
                    <>
                      <div className="flex flex-wrap gap-2">
                        <Badge className={priorityTone(selectedAnomaly.priority)}>
                          {selectedAnomaly.priority}
                        </Badge>
                        <Badge variant="outline">{selectedAnomaly.categoryLabel}</Badge>
                        {selectedAnomaly.fbiCategory ? (
                          <Badge variant="secondary">{selectedAnomaly.fbiCategory}</Badge>
                        ) : null}
                        {selectedAnomaly.collectionStatus ? (
                          <Badge variant="outline">{selectedAnomaly.collectionStatus}</Badge>
                        ) : null}
                      </div>
                      <p className="font-medium">{selectedAnomaly.title}</p>
                      <p className="text-muted-foreground">
                        {selectedAnomaly.entityName} · {selectedAnomaly.indicator}
                      </p>
                      {selectedAnomaly.artifact ? (
                        <p className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 font-mono text-xs text-primary">
                          {selectedAnomaly.artifact}
                        </p>
                      ) : null}
                      {selectedAnomaly.narrativeTimestamp ? (
                        <p className="text-xs text-muted-foreground">
                          Narrative clock · {selectedAnomaly.narrativeTimestamp}
                        </p>
                      ) : null}
                      <p>{selectedAnomaly.action}</p>
                      {selectedAnomaly.wontDo ? (
                        <p className="text-xs text-amber-200/90">wont-do: {selectedAnomaly.wontDo}</p>
                      ) : null}
                      <p className="text-xs text-muted-foreground">
                        Doctrine: {selectedAnomaly.doctrine.join(" · ")}
                      </p>
                      <p className="text-xs text-muted-foreground">Source: {selectedAnomaly.source}</p>
                    </>
                  ) : (
                    <p className="text-muted-foreground">Select an event from the queue or telemetry feed.</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {book.pipelineHealth ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{book.pipelineHealth.title}</CardTitle>
                  <CardDescription>{book.pipelineHealth.note}</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2 sm:grid-cols-2">
                  {book.pipelineHealth.checks.map((check) => (
                    <div
                      key={check.id}
                      className="rounded-lg border border-border/50 px-3 py-2 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <Badge
                          className={
                            check.ok
                              ? "bg-emerald-500/20 text-emerald-200"
                              : "bg-destructive/20 text-destructive"
                          }
                        >
                          {check.ok ? "OK" : "FAIL"}
                        </Badge>
                        <span className="font-mono text-[11px] text-muted-foreground">{check.id}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{check.detail}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">8. Post-doctoral research agenda</CardTitle>
                <CardDescription>
                  {book.researchAgenda
                    ? `${book.researchAgenda.questionCount} research questions · ${book.researchAgenda.constrainedCount} constrained by wont-do · extended by ${book.postdocCatalog?.total ?? 500} improvements below`
                    : "Unclassified product research notes"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {book.researchAgenda ? (
                  <>
                    <p className="text-sm text-muted-foreground">{book.researchAgenda.note}</p>
                    {book.researchAgenda.questions.map((q) => (
                      <div key={q.id} className="rounded-lg border border-border/50 px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">
                            {q.id}
                          </Badge>
                          <Badge
                            className={cn(
                              "text-[10px]",
                              q.status === "constrained"
                                ? "bg-muted text-muted-foreground"
                                : "bg-secondary text-secondary-foreground",
                            )}
                          >
                            {q.status}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm font-medium">{q.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{q.question}</p>
                        <p className="mt-1 text-xs">{q.lyraBinding}</p>
                        {q.wontDo ? (
                          <p className="mt-1 text-[11px] text-muted-foreground">Wont-do: {q.wontDo}</p>
                        ) : null}
                      </div>
                    ))}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Research agenda unavailable.</p>
                )}
              </CardContent>
            </Card>

            {book.postdocCatalog ? (
              <Card>
                <CardHeader>
                  <CardTitle className="font-display text-base">
                    8.1 Post-doctoral improvement catalog ({book.postdocCatalog.total})
                  </CardTitle>
                  <CardDescription>
                    {book.postdocCatalog.axisCount} axes · {book.postdocCatalog.openCount} open ·{" "}
                    {book.postdocCatalog.constrainedCount} constrained · showing{" "}
                    {Math.min(postdocShow, filteredPostdoc.length)} of {filteredPostdoc.length} matched
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">{book.postdocCatalog.note}</p>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="flex-1">
                      <label className="mb-1 block text-xs text-muted-foreground" htmlFor="postdoc-q">
                        Filter post-doc catalog
                      </label>
                      <Input
                        id="postdoc-q"
                        value={postdocQ}
                        onChange={(e) => {
                          setPostdocQ(e.target.value);
                          setPostdocShow(50);
                        }}
                        placeholder="Daubert, BMS, OFAC, falsifier…"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={postdocAxis === "" ? "default" : "outline"}
                        onClick={() => {
                          setPostdocAxis("");
                          setPostdocShow(50);
                        }}
                      >
                        All axes
                      </Button>
                      {book.postdocCatalog.axes.slice(0, 6).map((axis) => (
                        <Button
                          key={axis.id}
                          type="button"
                          size="sm"
                          variant={postdocAxis === axis.id ? "default" : "outline"}
                          onClick={() => {
                            setPostdocAxis(axis.id);
                            setPostdocShow(50);
                          }}
                        >
                          {axis.label.split(" ")[0]}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {filteredPostdoc.slice(0, postdocShow).map((item) => (
                      <div key={item.id} className="rounded-lg border border-border/50 px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">
                            {item.id}
                          </Badge>
                          <Badge className={cn("text-[10px]", priorityTone(item.priority))}>
                            {item.priority}
                          </Badge>
                          <Badge
                            className={cn(
                              "text-[10px]",
                              item.status === "constrained"
                                ? "bg-muted text-muted-foreground"
                                : "bg-secondary text-secondary-foreground",
                            )}
                          >
                            {item.status}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">{item.rqAnchor}</span>
                        </div>
                        <p className="mt-1 text-sm font-medium">{item.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{item.question}</p>
                        <p className="mt-1 text-[11px]">
                          Method: {item.method} · Deliverable: {item.deliverable}
                        </p>
                        <p className="mt-1 text-[11px] text-amber-200/80">Falsifier: {item.falsifier}</p>
                        {item.artifact ? (
                          <p className="mt-1 truncate font-mono text-[10px] text-primary/85">{item.artifact}</p>
                        ) : null}
                        <p className="mt-1 text-[11px] text-muted-foreground">{item.lyraBinding}</p>
                        {item.wontDo ? (
                          <p className="mt-1 text-[11px] text-muted-foreground">Wont-do: {item.wontDo}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  {filteredPostdoc.length > postdocShow ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setPostdocShow((n) => Math.min(n + 50, filteredPostdoc.length))}
                      >
                        Show 50 more
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setPostdocShow(filteredPostdoc.length)}
                      >
                        Show all {filteredPostdoc.length}
                      </Button>
                    </div>
                  ) : null}
                  {!filteredPostdoc.length ? (
                    <p className="text-sm text-muted-foreground">No post-doc items match this filter.</p>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">7. Improvement annex</CardTitle>
                <CardDescription>
                  {book.improvementAnnex
                    ? `${book.improvementAnnex.seedCount} hard-coded seeds · ${book.improvementAnnex.generatedTotal.toLocaleString()} generated · ${book.improvementAnnex.installableClosest} installable closest · ${book.improvementAnnex.wontDoCount} wont-do`
                    : "Taxonomy-mapped recommendations"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {book.improvementAnnex ? (
                  <>
                    <p className="text-sm text-muted-foreground">{book.improvementAnnex.note}</p>
                    <div className="grid gap-2 md:grid-cols-2">
                      {book.improvementAnnex.seeds.map((seed) => (
                        <div key={seed.id} className="rounded-lg border border-border/50 px-3 py-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="text-[10px]">
                              #{seed.id}
                            </Badge>
                            <Badge
                              className={cn(
                                "text-[10px]",
                                seed.status === "wont-do"
                                  ? "bg-muted text-muted-foreground"
                                  : seed.install
                                    ? "bg-primary/80 text-primary-foreground"
                                    : "bg-secondary text-secondary-foreground",
                              )}
                            >
                              {seed.status}
                              {seed.install ? " · install" : ""}
                            </Badge>
                            <span className="text-xs text-muted-foreground">{seed.categoryId}</span>
                          </div>
                          <p className="mt-1 text-sm font-medium">{seed.title}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Requested <span className="text-foreground">{seed.requested}</span>
                            {" → "}
                            {seed.closest}
                          </p>
                          <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{seed.impact}</p>
                          {seed.wontDo ? (
                            <p className="mt-1 text-[11px] text-muted-foreground">Wont-do: {seed.wontDo}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Improvement annex unavailable.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Improvements ({book.improvements.generated.toLocaleString()} generated)
                </CardTitle>
                <CardDescription>
                  Mapped to the Corporate Forensic Evidence Taxonomy · showing {filteredImprovements.length} of{" "}
                  {book.improvements.total.toLocaleString()} matched
                  {book.summary.improvementSeeds
                    ? ` · first ${book.summary.improvementSeeds} seeded from annex`
                    : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2 md:grid-cols-2">
                {filteredImprovements.map((imp) => (
                  <div key={imp.id} className="rounded-lg border border-border/50 px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        {imp.id}
                      </Badge>
                      <Badge className={cn("text-[10px]", priorityTone(imp.priority))}>{imp.priority}</Badge>
                      {imp.installStatus ? (
                        <Badge variant="outline" className="text-[10px]">
                          {imp.installStatus}
                        </Badge>
                      ) : null}
                      <span className="text-xs text-muted-foreground">{imp.categoryLabel}</span>
                    </div>
                    <p className="mt-1 text-sm font-medium">{imp.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{imp.recommendation}</p>
                    {imp.closestAsset ? (
                      <p className="mt-1 text-[11px] text-muted-foreground">Closest: {imp.closestAsset}</p>
                    ) : null}
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">2. Inventory ledger</CardTitle>
                <CardDescription>
                  {book.inventoryLedger
                    ? `${book.inventoryLedger.additionalSlots.toLocaleString()} Tier-1 slots · ${book.inventoryLedger.liveInventory.ok}/${book.inventoryLedger.liveInventory.assets} closest assets · cuckooLive=${String(book.inventoryLedger.liveInventory.cuckooLiveSandbox)}`
                    : "P1 closest installs"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {book.inventoryLedger ? (
                  <>
                    <p className="text-sm text-muted-foreground">{book.inventoryLedger.note}</p>
                    <div className="flex flex-wrap gap-2">
                      {book.inventoryLedger.coreRuntime.map((pkg) => (
                        <Badge key={pkg.name} variant="outline">
                          {pkg.name} {pkg.version}
                        </Badge>
                      ))}
                    </div>
                    {book.inventoryLedger.sections.map((section) => (
                      <div key={section.id}>
                        <p className="text-sm font-medium">{section.title}</p>
                        <ul className="mt-2 space-y-1">
                          {section.items.map((item) => (
                            <li key={item.requested} className="text-xs text-muted-foreground">
                              <span className="text-foreground">{item.requested}</span>
                              {" → "}
                              {item.closest ?? item.status ?? "mapped"}
                              {item.installOk ? " · ok" : " · pending"}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Won&apos;t install</p>
                      {book.inventoryLedger.wontInstall.map((w) => (
                        <p key={w.id} className="text-xs text-muted-foreground">
                          <span className="text-foreground">{w.title}: </span>
                          {w.reason}
                        </p>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Inventory ledger unavailable.</p>
                )}
              </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">1.1 System overview</CardTitle>
                  <CardDescription>
                    {book.architecture.note ?? "Blueprint layers bound to this checkout"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(book.architecture.systemOverview ?? []).map((row) => (
                    <div key={row.id} className="rounded-lg border border-border/50 px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">{row.layer}</p>
                        <Badge variant="outline" className="text-[10px]">
                          {row.status}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Proposed: {row.proposed}
                      </p>
                      <p className="mt-1 text-xs">{row.shipped}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">{row.note}</p>
                    </div>
                  ))}
                  {!book.architecture.systemOverview?.length
                    ? book.architecture.layers.map((layer) => (
                        <div key={layer.id}>
                          <p className="text-sm font-medium">{layer.title}</p>
                          <p className="text-xs text-muted-foreground">{layer.detail}</p>
                        </div>
                      ))
                    : null}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">1.2 Data flow</CardTitle>
                  <CardDescription>Six-step pipeline · live flags stay false</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(book.architecture.dataFlow ?? []).map((step) => (
                    <div key={step.id} className="rounded-lg border border-border/50 px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="text-[10px]">
                          {step.step}
                        </Badge>
                        <p className="text-sm font-medium">{step.title}</p>
                        <Badge variant="outline" className="text-[10px]">
                          {step.status}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          live={String(step.live)}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{step.proposed}</p>
                      <p className="mt-1 text-xs">{step.shipped}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Runtime layers</CardTitle>
                  <CardDescription>What the tracker executes locally</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {book.architecture.layers.map((layer) => (
                    <div key={layer.id}>
                      <p className="text-sm font-medium">{layer.title}</p>
                      <p className="text-xs text-muted-foreground">{layer.detail}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Won&apos;t do</CardTitle>
                  <CardDescription>Explicit refusals</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {book.wontDo.map((w) => (
                    <div key={w.id}>
                      <p className="text-sm font-medium">{w.title}</p>
                      <p className="text-xs text-muted-foreground">{w.reason}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">6. Automation scripts</CardTitle>
                <CardDescription>
                  install-all + scan-pipeline · liveSurveillance=
                  {String(book.automation.liveSurveillance ?? false)} · slackWebhooks=
                  {String(book.automation.slackWebhooks ?? false)}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {book.automation.note ? (
                  <p className="text-sm text-muted-foreground">{book.automation.note}</p>
                ) : null}
                {book.automation.scripts?.map((s) => (
                  <div key={s.id}>
                    <p className="text-sm font-medium">
                      {s.path}{" "}
                      <Badge variant="outline" className="text-[10px]">
                        {s.status}
                      </Badge>
                    </p>
                    <p className="text-xs text-muted-foreground">{s.detail}</p>
                  </div>
                ))}
                {book.automation.rejectedResearchSteps?.map((r) => (
                  <p key={r.id} className="text-xs text-muted-foreground">
                    <span className="text-foreground">{r.title}: </span>
                    {r.reason}
                  </p>
                ))}
                <ul className="space-y-1 font-mono text-[11px] text-muted-foreground">
                  {book.automation.commands.map((cmd, i) => (
                    <li key={`auto-cmd-${i}-${cmd}`}>{cmd}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">5. Credentials & security</CardTitle>
                <CardDescription>
                  {book.credentials
                    ? `${book.credentials.configuredCount ?? 0}/${book.credentials.placeholderCount ?? book.credentials.variables.length} configured · vault=${book.credentials.vault?.status ?? "wont-deploy"} · cjisLive=${String(book.credentials.cjis?.liveQueries ?? false)}`
                    : "Placeholders only"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {book.credentials ? (
                  <>
                    <p className="text-sm text-muted-foreground">{book.credentials.note}</p>
                    {book.credentials.secretsSkippedByOperator ? (
                      <Badge variant="outline">operator skipped optional secrets</Badge>
                    ) : null}
                    {book.credentials.vault ? (
                      <p className="text-xs text-muted-foreground">
                        Vault: {book.credentials.vault.shipped} ({book.credentials.vault.exampleFile})
                      </p>
                    ) : null}
                    {book.credentials.groups?.map((group) => (
                      <div key={group.id}>
                        <p className="text-sm font-medium">{group.title}</p>
                        <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                          {group.variables.map((v) => (
                            <li key={v.name}>
                              <span className="font-mono text-foreground">{v.name}</span> — {v.purpose}
                              {v.status ? ` · ${v.status}` : ""}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                    <div className="flex flex-wrap gap-2">
                      {book.credentials.variables.map((v) => (
                        <Badge key={v.name} variant={v.configured ? "secondary" : "outline"}>
                          {v.name}
                          {v.configured ? "=set" : "=empty"}
                        </Badge>
                      ))}
                    </div>
                    {book.credentials.wontDo?.map((w) => (
                      <p key={w.id} className="text-xs text-muted-foreground">
                        <span className="text-foreground">{w.title}: </span>
                        {w.reason}
                      </p>
                    ))}
                    <ul className="space-y-1 font-mono text-[11px] text-muted-foreground">
                      {(book.credentials.commands ?? []).map((cmd) => (
                        <li key={cmd}>{cmd}</li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Credentials framework unavailable.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">4. MCP configuration audit</CardTitle>
                <CardDescription>
                  {book.mcp
                    ? `${book.mcp.wiredCount ?? book.mcp.servers.length} wired · ${book.mcp.config} · ${book.mcp.npmScript ?? "mcp:install"}`
                    : ".cursor/mcp.json"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {book.mcp ? (
                  <>
                    <p className="text-sm text-muted-foreground">{book.mcp.note}</p>
                    <div className="flex flex-wrap gap-2">
                      {book.mcp.servers.map((name) => (
                        <Badge key={name} variant="outline">
                          {name}
                        </Badge>
                      ))}
                    </div>
                    {book.mcp.audit ? (
                      <ul className="max-h-64 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                        {book.mcp.audit.rows.map((row) => (
                          <li key={row.requested}>
                            <span className="text-foreground">{row.requested}</span>
                            {" → "}
                            {row.wiredId ?? row.closestPackage}
                            {" · "}
                            {row.status}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      Wont add: {(book.mcp.audit?.wontAddToMcpJson ?? []).join(", ")}
                    </p>
                    <ul className="space-y-1 font-mono text-[11px] text-muted-foreground">
                      {(book.mcp.audit?.commands ?? [book.mcp.installCommand ?? "npm run mcp:install"]).map(
                        (cmd) => (
                          <li key={cmd}>{cmd}</li>
                        ),
                      )}
                    </ul>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">MCP audit unavailable.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">3. Lockfile & dependencies</CardTitle>
                <CardDescription>
                  {book.dependencyStrategy.lockfile} · product={book.dependencyStrategy.productName ?? "lyra"} ·{" "}
                  {book.dependencyStrategy.p1Slots.toLocaleString()} P1 slots
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{book.dependencyStrategy.note}</p>
                <p className="text-xs text-muted-foreground">
                  Rejected lockfile name: {book.dependencyStrategy.rejectedLockfileName ?? "n/a"} · requirements:{" "}
                  {book.dependencyStrategy.requirements ?? "requirements.txt"}
                </p>
                {book.dependencyStrategy.npmCore ? (
                  <div className="flex flex-wrap gap-2">
                    {book.dependencyStrategy.npmCore.map((pkg) => (
                      <Badge key={pkg.requested} variant="outline">
                        {pkg.requested}@{pkg.version}
                      </Badge>
                    ))}
                  </div>
                ) : null}
                {book.dependencyStrategy.unpublishedScopes ? (
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {book.dependencyStrategy.unpublishedScopes.map((row) => (
                      <li key={row.requested}>
                        <span className="text-foreground">{row.requested}</span> → {row.closest.join(", ")}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {book.dependencyStrategy.python ? (
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {book.dependencyStrategy.python.rows.map((row) => (
                      <li key={row.requested}>
                        <span className="text-foreground">{row.requested}</span> → {row.closest}
                        {row.wontInstall ? " (wont-install)" : ""}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <p className="text-xs text-muted-foreground">{book.dependencyStrategy.install}</p>
                <p className="text-xs text-muted-foreground">{book.dependencyStrategy.verify}</p>
                <ul className="space-y-1 font-mono text-[11px] text-muted-foreground">
                  {(book.dependencyStrategy.commands ?? book.automation.commands).map((cmd, i) => (
                    <li key={`dep-cmd-${i}-${cmd}`}>{cmd}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </>
        ) : null}
      </main>
    </div>
  );
}
