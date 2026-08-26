"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ScrollStableFeed } from "@/components/lyra/scroll-stable-feed";
import {
  SCOUT_TICK_MS,
  inspectTrackerBook,
  runScoutHeal,
  snapshotFromBook,
  type ScoutFinding,
  type ScoutSnapshot,
} from "@/lib/scout-healer";

export type ScoutBotPayload = {
  object?: string;
  title?: string;
  mode?: string;
  tickMs?: number;
  active?: boolean;
  selfHealing?: boolean;
  additiveOnly?: boolean;
  extremeScan?: boolean;
  postdocExtreme?: boolean;
  hiddenCodeScan?: boolean;
  repairRescan?: boolean;
  repairRescanPasses?: number;
  gateTarget?: number;
  note?: string;
  healActions?: string[];
  baselines?: Record<string, number>;
  pipelineIds?: string[];
  liveSurveillance?: boolean;
};

export const SCOUT_HEAL_EVENT = "lyra:scout-heal";

type ScoutLog = {
  id: string;
  at: string;
  finding: ScoutFinding;
};

export function ScoutBotPanel({
  book,
  selectedAnomalyId,
  selectedEntityId,
  onHealedBook,
  onHealSelection,
}: {
  book: any;
  selectedAnomalyId?: string | null;
  selectedEntityId?: string | null;
  onHealedBook?: (next: any) => void;
  onHealSelection?: (next: {
    selectedAnomalyId?: string | null;
    selectedEntityId?: string | null;
  }) => void;
}) {
  const [clock, setClock] = useState("");
  const [cycle, setCycle] = useState(0);
  const [findings, setFindings] = useState<ScoutFinding[]>([]);
  const [log, setLog] = useState<ScoutLog[]>([]);
  const [healedTotal, setHealedTotal] = useState(0);
  const [lastSnapshot, setLastSnapshot] = useState<ScoutSnapshot | null>(null);
  const [status, setStatus] = useState<"scanning" | "healthy" | "healing" | "degraded">("scanning");

  const bookRef = useRef(book);
  const selectedAnomalyRef = useRef(selectedAnomalyId);
  const selectedEntityRef = useRef(selectedEntityId);
  const onHealedBookRef = useRef(onHealedBook);
  const onHealSelectionRef = useRef(onHealSelection);
  const lastAllClearRef = useRef(0);
  const inFlightRef = useRef(false);

  bookRef.current = book;
  selectedAnomalyRef.current = selectedAnomalyId;
  selectedEntityRef.current = selectedEntityId;
  onHealedBookRef.current = onHealedBook;
  onHealSelectionRef.current = onHealSelection;

  const baselines = useMemo(
    () =>
      book?.scoutBot?.baselines ?? {
        nodes: 15,
        events: 51,
        crimeCategories: 52,
        crimeCases: 60,
        mayPackets: 15,
        postdoc: 905500,
      },
    [book?.scoutBot?.baselines],
  );

  const scoutOnce = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
    const currentBook = bookRef.current;
    const selA = selectedAnomalyRef.current ?? null;
    const selE = selectedEntityRef.current ?? null;

    setClock(new Date().toISOString());
    setCycle((c) => c + 1);
    setLastSnapshot(snapshotFromBook(currentBook));

    // Empty book: force reload-static heal path (boot / failed hydrate).
    const open = currentBook
      ? inspectTrackerBook(currentBook, {
          selectedAnomalyId: selA,
          selectedEntityId: selE,
        })
      : [
          {
            id: "book-missing",
            severity: "P1" as const,
            title: "Tracker book missing",
            detail: "Client lost anomaly payload — refill from static bake.",
            healable: true,
            healAction: "reload-static",
          },
        ];
    if (!open.length) {
      setFindings([]);
      setStatus("healthy");
      const now = Date.now();
      if (now - lastAllClearRef.current > 12_000) {
        lastAllClearRef.current = now;
        setLog((prev) =>
          [
            {
              id: `ok-${now}`,
              at: new Date().toISOString(),
              finding: {
                id: "all-clear",
                severity: "P3" as const,
                title: "Scout all-clear",
                detail: "Payload integrity OK — no heal required",
                healable: false,
              },
            },
            ...prev,
          ].slice(0, 30),
        );
      }
      return;
    }

    setStatus("healing");
    setFindings(open);
    let workingBook = currentBook;
    let totalHealed = 0;
    let lastResult = await runScoutHeal(workingBook, {
      selectedAnomalyId: selA,
      selectedEntityId: selE,
    });
    totalHealed += lastResult.healedCount;
    if (lastResult.bookPatch) workingBook = lastResult.bookPatch;

    // Repair → rescan loop (additive): after each heal, re-inspect and heal again up to ×3.
    const maxPasses =
      currentBook?.scoutBot?.repairRescan === false
        ? 0
        : Math.max(1, currentBook?.scoutBot?.repairRescanPasses ?? 9);
    for (let pass = 1; pass < maxPasses; pass += 1) {
      const stillOpen = inspectTrackerBook(workingBook, {
        selectedAnomalyId: lastResult.selectedAnomalyId ?? selA,
        selectedEntityId: lastResult.selectedEntityId ?? selE,
        extreme: true,
      }).filter((f) => f.healable);
      if (!stillOpen.length) break;
      const next = await runScoutHeal(workingBook, {
        selectedAnomalyId: lastResult.selectedAnomalyId ?? selA,
        selectedEntityId: lastResult.selectedEntityId ?? selE,
      });
      totalHealed += next.healedCount;
      if (next.bookPatch) workingBook = next.bookPatch;
      lastResult = {
        ...next,
        healedCount: totalHealed,
        findings: [
          ...lastResult.findings,
          ...next.findings.filter((f) => !lastResult.findings.some((x) => x.id === f.id)),
        ],
        bookPatch: workingBook !== currentBook ? workingBook : undefined,
      };
    }

    setFindings(lastResult.findings);
    setHealedTotal((n) => n + totalHealed);
    setLog((prev) =>
      [
        ...lastResult.findings.map((f) => ({
          id: `${f.id}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
          at: new Date().toISOString(),
          finding: f,
        })),
        ...prev,
      ].slice(0, 48),
    );

    if (lastResult.bookPatch && onHealedBookRef.current) {
      onHealedBookRef.current(lastResult.bookPatch);
    }
    if (onHealSelectionRef.current) {
      onHealSelectionRef.current({
        selectedAnomalyId: lastResult.selectedAnomalyId,
        selectedEntityId: lastResult.selectedEntityId,
      });
    }

    if (typeof window !== "undefined" && lastResult.bookPatch) {
      window.dispatchEvent(
        new CustomEvent(SCOUT_HEAL_EVENT, {
          detail: {
            book: lastResult.bookPatch,
            selectedAnomalyId: lastResult.selectedAnomalyId,
            selectedEntityId: lastResult.selectedEntityId,
            healedCount: totalHealed,
          },
        }),
      );
    }

    const remaining = lastResult.findings.filter((f) => f.healable && !f.healed);
    setStatus(remaining.length ? (totalHealed ? "healing" : "degraded") : "healthy");
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tickMs = book?.scoutBot?.tickMs ?? SCOUT_TICK_MS;

    void (async () => {
      if (!cancelled) await scoutOnce();
    })();

    const id = window.setInterval(() => {
      if (!cancelled) void scoutOnce();
    }, tickMs);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [scoutOnce, book?.scoutBot?.tickMs]);

  const openCount = findings.filter((f) => !f.healed && f.id !== "all-clear").length;
  const healedNow = findings.filter((f) => f.healed).length;
  const meta = book?.scoutBot;

  return (
    <Card className="overflow-hidden border-sky-500/25">
      <CardHeader className="border-b border-border/40">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 font-display text-lg">
              <span className="hud-beacon" aria-hidden />
              {meta?.title ?? "Error scout bot"} · self-healing
            </CardTitle>
            <CardDescription className="mt-1 max-w-3xl">
              {meta?.note ??
                "24/7 fixture scout watches tracker integrity and auto-corrects healable faults without removing features."}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-sky-500/20 text-sky-100">ACTIVE 24/7</Badge>
            <Badge className="bg-amber-500/20 text-amber-100">SOTA · SELF-HEAL</Badge>
            <Badge className="bg-emerald-500/20 text-emerald-100">DETECT→VERIFY</Badge>
            {meta?.extremeScan ||
            meta?.mode === "postdoc-extreme-24x7" ||
            meta?.mode === "postdoc-x3-extreme-24x7" ||
            meta?.mode === "postdoc-x9-extreme-24x7" ? (
              <Badge className="bg-violet-500/20 text-violet-100">POSTDOC ×9 EXTREME</Badge>
            ) : null}
            {meta?.hiddenCodeScan ? (
              <Badge className="bg-amber-500/20 text-amber-100">HIDDEN-CODE DEEP</Badge>
            ) : null}
            {meta?.repairRescan ? (
              <Badge className="bg-emerald-500/20 text-emerald-100">
                REPAIR→RESCAN ×{meta?.repairRescanPasses ?? 9}
              </Badge>
            ) : null}
            <Badge variant="outline">{status}</Badge>
            <Badge variant="outline">cycle {cycle}</Badge>
            <Badge variant="secondary">healed={healedTotal}</Badge>
            <Badge variant="outline">gates≥{meta?.gateTarget ?? lastSnapshot?.gateCount ?? 1215}</Badge>
            <Badge variant="outline">{meta?.tickMs ?? 22}ms</Badge>
            {meta?.additiveOnly ? <Badge variant="outline">additive only</Badge> : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 pt-4 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
            <span>Scout clock</span>
            <span className="font-mono normal-case tracking-normal text-sky-200/90">{clock}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg border border-border/40 px-2 py-2 text-center">
              <p className="font-display text-lg">{openCount}</p>
              <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">Open</p>
            </div>
            <div className="rounded-lg border border-border/40 px-2 py-2 text-center">
              <p className="font-display text-lg">{healedNow}</p>
              <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">Healed now</p>
            </div>
            <div className="rounded-lg border border-border/40 px-2 py-2 text-center">
              <p className="font-display text-lg">{lastSnapshot?.sceneNodeCount ?? 0}</p>
              <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">Nodes</p>
            </div>
            <div className="rounded-lg border border-border/40 px-2 py-2 text-center">
              <p className="font-display text-lg">
                {lastSnapshot?.crimeCategoryCount ?? 0}/{lastSnapshot?.crimeCaseCount ?? 0}
              </p>
              <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">Crime DB</p>
            </div>
          </div>
          <div className="rounded-lg border border-border/40 px-3 py-2 text-xs text-muted-foreground">
            Baselines · nodes≥{baselines.minNodes ?? baselines.nodes ?? 15} · events≥
            {baselines.minEvents ?? baselines.events ?? 51} · crime{" "}
            {baselines.crimeCategories}/{baselines.crimeCases} · may packets{" "}
            {baselines.mayPackets} · postdoc {baselines.postdoc}
            {baselines.envPlaceholders ? ` · env ${baselines.envPlaceholders}` : ""}
            {baselines.pipelineScripts ? ` · pipelines ${baselines.pipelineScripts}` : ""}
            {" · tick "}
            {meta?.tickMs ?? 22}ms (×9 harder) · gates≥{meta?.gateTarget ?? 1215}
            {meta?.hiddenCodeScan ? " · hidden-code deep dive" : ""}
            {meta?.repairRescan
              ? ` · repair→rescan ×${meta?.repairRescanPasses ?? 9}`
              : ""}
            {meta?.additiveOnly ? " · additive only" : ""} · all 12 pipelines
          </div>
          {findings.length ? (
            <ul className="space-y-1.5">
              {findings.map((f, i) => (
                <li
                  key={`${f.id}-${i}-${f.healed ? "h" : "o"}`}
                  className={cn(
                    "rounded-lg border px-2.5 py-2 text-xs",
                    f.healed
                      ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-100"
                      : f.severity === "P1"
                        ? "border-rose-400/40 bg-rose-500/10 text-rose-100"
                        : "border-amber-400/35 bg-amber-500/10 text-amber-50",
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">
                      {f.severity} · {f.title}
                    </span>
                    <span className="font-mono text-[10px] uppercase">
                      {f.healed ? "healed" : f.healable ? "healable" : "watch"}
                    </span>
                  </div>
                  <p className="mt-0.5 opacity-90">{f.detail}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-emerald-200/90">No open errors — scout continuing 24/7.</p>
          )}
        </div>
        <div>
          <p className="mb-2 text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
            Scout heal log
          </p>
          <ScrollStableFeed heightClassName="h-72 max-h-72" className="gap-1.5 space-y-0">
            {log.map((row) => (
              <div
                key={row.id}
                className="rounded-lg border border-border/40 bg-background/40 px-2.5 py-2 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-foreground">
                    {row.finding.severity} · {row.finding.title}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {row.finding.healed ? "healed" : "noted"}
                  </span>
                </div>
                <p className="mt-0.5 text-muted-foreground">{row.finding.detail}</p>
              </div>
            ))}
          </ScrollStableFeed>
        </div>
      </CardContent>
    </Card>
  );
}
