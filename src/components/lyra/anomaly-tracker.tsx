"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LoaderCircleIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

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
  categoryLabel: string;
  action: string;
  indicator: string;
  doctrine: string[];
  source: string;
}

interface Improvement {
  id: string;
  priority: string;
  title: string;
  categoryLabel: string;
  entityTypeLabel: string;
  recommendation: string;
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
    taxonomyCategories: number;
    p1InventorySlots: number;
    mcpServers: number;
    intercepts: boolean;
    cjisLiveQueries: boolean;
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
  scene: { nodes: SceneNode[] };
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

export function AnomalyTracker() {
  const [book, setBook] = useState<TrackerBook | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [q, setQ] = useState("");
  const [priority, setPriority] = useState<string>("");
  const [selected, setSelected] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (priority) params.set("priority", priority);
      params.set("improvementLimit", "36");
      const response = await fetch(`/api/anomaly?${params.toString()}`);
      const data = (await response.json()) as TrackerBook & { error?: string };
      if (!response.ok) {
        setBook(null);
        setError(data.error ?? "Tracker failed to load.");
        return;
      }
      setBook(data);
      if (!selected && data.p1Queue[0]) setSelected(data.p1Queue[0].id);
    } catch {
      setBook(null);
      setError("Could not reach the anomaly tracker.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 2400);
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

  const selectedAnomaly = useMemo(() => {
    if (!book || !selected) return null;
    return book.anomalies.find((a) => a.id === selected) ?? null;
  }, [book, selected]);

  return (
    <div className="relative flex flex-1 flex-col">
      <header className="border-b border-border/70 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div>
            <p className="font-heading text-2xl leading-none tracking-tight">Anomaly tracker</p>
            <p className="mt-1 text-xs tracking-[0.14em] text-muted-foreground uppercase">
              3D fixture map · taxonomy-bound · unclassified
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              Studio
            </Link>
            <Link href="/corporate" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
              Corporate
            </Link>
            <Link href="/inventory" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
              Inventory
            </Link>
            <Button type="button" size="sm" variant="ghost" onClick={() => void load()} disabled={busy}>
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
              <Badge variant="outline">
                {book.summary.p1Events} P1 · {book.summary.anomalies} events
              </Badge>
              <Badge variant="outline">{book.summary.improvements.toLocaleString()} improvements</Badge>
              <Badge variant="outline">{book.summary.entityTypes} entity types</Badge>
              <Badge variant="outline">tick {tick}</Badge>
            </div>

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
                      </div>
                      <p className="font-medium">{selectedAnomaly.title}</p>
                      <p className="text-muted-foreground">{selectedAnomaly.entityName}</p>
                      <p>
                        <span className="text-muted-foreground">Indicator: </span>
                        {selectedAnomaly.indicator}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Action: </span>
                        {selectedAnomaly.action}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Source: </span>
                        {selectedAnomaly.source}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Doctrine: {selectedAnomaly.doctrine.join(" · ")}
                      </p>
                    </>
                  ) : (
                    <p className="text-muted-foreground">Select an event from the queue.</p>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Improvements ({book.improvements.generated.toLocaleString()} generated)
                </CardTitle>
                <CardDescription>
                  Mapped to the Corporate Forensic Evidence Taxonomy · showing {book.improvements.data.length} of{" "}
                  {book.improvements.total.toLocaleString()} matched
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2 md:grid-cols-2">
                {book.improvements.data.map((imp) => (
                  <div key={imp.id} className="rounded-lg border border-border/50 px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        {imp.id}
                      </Badge>
                      <Badge className={cn("text-[10px]", priorityTone(imp.priority))}>{imp.priority}</Badge>
                      <span className="text-xs text-muted-foreground">{imp.categoryLabel}</span>
                    </div>
                    <p className="mt-1 text-sm font-medium">{imp.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{imp.recommendation}</p>
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
                  {book.automation.commands.map((cmd) => (
                    <li key={cmd}>{cmd}</li>
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
                  {(book.dependencyStrategy.commands ?? book.automation.commands).map((cmd) => (
                    <li key={cmd}>{cmd}</li>
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
