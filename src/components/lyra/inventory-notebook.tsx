"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { LoaderCircleIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { fetchJsonWithStaticFallback } from "@/lib/static-data";

interface NotebookView {
  classified: boolean;
  summary: {
    oneShot: string;
    p1Slots: number;
    coreSlots: number;
    tier1Slots: number;
    closestAssets: string;
    legalSources: number;
    legalLive: number;
    envPlaceholders: number;
    envConfigured: number;
    dockerAvailable: boolean;
    lyra2: boolean;
    aipSigma0: boolean;
    postdoc?: boolean;
    liveSuggestionBot?: boolean;
  };
  oneShot: {
    okCount: number;
    stepCount: number;
    steps: Array<{
      id: string;
      group: string;
      requested: string;
      closest: string;
      result?: { ok?: boolean; installed?: string; detail?: string };
    }>;
  };
  inventory: {
    assets: Array<{
      id: string;
      family: string;
      requested: string;
      closest: string;
      install?: { ok?: boolean; detail?: string };
    }>;
  };
  legal: Array<{
    id: string;
    name: string;
    status: string;
    credentials: string;
    install: string;
    notes?: string;
  }>;
  env: {
    variables: Array<{
      name: string;
      configured: boolean;
      requiredFor: string;
      closest: string;
    }>;
  };
  p1: {
    totalSlots: number;
    sampleCore: Array<{
      id: string;
      title: string;
      tier?: string;
      practiceArea: string;
      status: string;
      installedPackage?: string;
      requestedPackage?: string;
      workProduct: string;
    }>;
    sampleTier1: Array<{
      id: string;
      title: string;
      tier?: string;
      practiceArea: string;
      status: string;
      installedPackage?: string;
      requestedPackage?: string;
      workProduct: string;
    }>;
  };
  expansion: Array<{
    id: string;
    title: string;
    status: string;
    note: string;
    live: string;
  }>;
}

export function InventoryNotebook({ initialData }: { initialData?: NotebookView }) {
  const [book, setBook] = useState<NotebookView | null>(initialData ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(!initialData);
  const [q, setQ] = useState("");

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const { data } = await fetchJsonWithStaticFallback<NotebookView & { error?: string }>(
        "/api/notebook",
        "/static/notebook.json",
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
    } catch {
      if (!initialData) {
        setBook(null);
        setError("Could not reach the inventory notebook.");
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

  const needle = q.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!book) return null;
    const hit = (value: string) => !needle || value.toLowerCase().includes(needle);
    return {
      steps: book.oneShot.steps.filter((s) => hit(`${s.id} ${s.requested} ${s.closest}`)),
      assets: book.inventory.assets.filter((a) => hit(`${a.id} ${a.requested} ${a.closest}`)),
      legal: book.legal.filter((s) => hit(`${s.id} ${s.name} ${s.status}`)),
      env: book.env.variables.filter((v) => hit(`${v.name} ${v.requiredFor}`)),
      expansion: book.expansion.filter((e) => hit(`${e.id} ${e.title} ${e.note}`)),
      p1: [...book.p1.sampleCore, ...book.p1.sampleTier1].filter((s) =>
        hit(`${s.id} ${s.title} ${s.requestedPackage ?? ""} ${s.installedPackage ?? ""}`),
      ),
    };
  }, [book, needle]);

  return (
    <div className="relative flex flex-1 flex-col">
      <header className="border-b border-border/40 bg-transparent">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-6">
          <div>
            <p className="text-[10px] tracking-[0.22em] text-primary/80 uppercase">
              Live notebook · not a classified document
            </p>
            <p className="font-display text-3xl leading-none tracking-tight">Install inventory</p>
          </div>
          <Button size="sm" variant="ghost" className="glass-rail" onClick={() => void load()} disabled={busy}>
            Refresh
          </Button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 lg:px-6 lg:py-8">
        <div className="glass-panel max-w-3xl p-5">
          <h1 className="font-display text-3xl leading-tight text-balance sm:text-4xl">
            What is installed, what is closest, and what this studio will not do.
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Compiled from live one-shot status, the P1 catalog (1,280 core + 10,000 Tier-1), legal
            research sources, and policy refusals. No NSA program name. No classification banner.
          </p>
        </div>

        {busy && !book ? (
          <Card>
            <CardContent className="flex items-center gap-3 py-8 text-sm text-muted-foreground">
              <LoaderCircleIcon className="size-4 animate-spin" />
              Loading live inventory…
            </CardContent>
          </Card>
        ) : null}

        {error ? (
          <Card>
            <CardHeader>
              <CardTitle>Notebook unavailable</CardTitle>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button type="button" onClick={() => void load()}>
                Retry
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {book && filtered ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="One-shot" value={book.summary.oneShot} />
              <Stat label="P1 slots" value={String(book.summary.p1Slots)} hint={`${book.summary.coreSlots} core + ${book.summary.tier1Slots} Tier-1`} />
              <Stat label="Closest assets" value={book.summary.closestAssets} />
              <Stat label="Legal live" value={`${book.summary.legalLive}/${book.summary.legalSources}`} />
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant={book.classified ? "destructive" : "secondary"}>
                classified={String(book.classified)}
              </Badge>
              <Badge variant="outline">Cuckoo sandbox off</Badge>
              <Badge variant={book.summary.lyra2 ? "secondary" : "outline"}>Lyra-2</Badge>
              <Badge variant={book.summary.aipSigma0 ? "secondary" : "outline"}>AIP-Σ0</Badge>
              <Badge variant={book.summary.postdoc ? "secondary" : "outline"}>Post-doc</Badge>
              <Badge variant={book.summary.liveSuggestionBot ? "secondary" : "outline"}>
                Live bot
              </Badge>
              <Badge variant="outline">
                Docker {book.summary.dockerAvailable ? "available" : "unavailable"}
              </Badge>
            </div>

            <Input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Filter steps, assets, legal sources, env names…"
              aria-label="Filter inventory"
            />

            <Section title="Expansion plan" description="Honest next steps. Refusals stay refusals.">
              <div className="grid gap-3 md:grid-cols-2">
                {filtered.expansion.map((item) => (
                  <Card key={item.id} size="sm">
                    <CardHeader>
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-sm">{item.title}</CardTitle>
                        <Badge variant={item.status === "wont-do" ? "outline" : "secondary"}>
                          {item.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="text-sm leading-6">
                      <p>{item.note}</p>
                      <p className="mt-2 text-xs text-muted-foreground">{item.live}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
              {needle && !filtered.expansion.length ? (
                <p className="text-sm text-muted-foreground">No expansion rows match.</p>
              ) : null}
            </Section>

            <Section
              title="One-shot install"
              description={`${book.oneShot.okCount}/${book.oneShot.stepCount} recorded. Requested name first; unpublished names use the closest public match.`}
            >
              <RowTable
                empty="No steps match."
                rows={filtered.steps.map((s) => ({
                  id: s.id,
                  title: s.requested,
                  meta: `${s.group} → ${s.closest}`,
                  ok: Boolean(s.result?.ok),
                  detail: s.result?.installed || s.result?.detail || "",
                }))}
              />
            </Section>

            <Section
              title="Closest-match assets"
              description="Tier-1 requested packages vs what was actually installable."
            >
              <RowTable
                empty="No assets match."
                rows={filtered.assets.map((a) => ({
                  id: a.id,
                  title: a.requested,
                  meta: `${a.family} → ${a.closest}`,
                  ok: Boolean(a.install?.ok),
                  detail: a.install?.detail || "",
                }))}
              />
            </Section>

            <Section
              title="Legal research sources"
              description="Black's Law Dictionary is not shipped. CJIS/NCIC is placeholders only."
            >
              <RowTable
                empty="No sources match."
                rows={filtered.legal.map((s) => ({
                  id: s.id,
                  title: s.name,
                  meta: `${s.status} · ${s.credentials}`,
                  ok: s.status === "live" || s.status === "offline-fallback" || s.status === "optional",
                  detail: s.notes || s.install,
                }))}
              />
            </Section>

            <Section
              title={`P1 catalog · ${book.p1.totalSlots} slots`}
              description="Sample of core and Tier-1 rows. Full list: GET /v1/p1."
            >
              <RowTable
                empty="No catalog rows match."
                rows={filtered.p1.map((s) => ({
                  id: s.id,
                  title: s.title,
                  meta: `${s.tier} · ${s.practiceArea}`,
                  ok: s.status === "available",
                  detail: s.installedPackage || s.workProduct,
                }))}
              />
            </Section>

            <Section
              title="Environment placeholders"
              description={`${book.summary.envConfigured}/${book.summary.envPlaceholders} currently set. Values are never printed.`}
            >
              <RowTable
                empty="No variables match."
                rows={filtered.env.map((v) => ({
                  id: v.name,
                  title: v.name,
                  meta: v.requiredFor,
                  ok: v.configured,
                  detail: v.closest,
                }))}
              />
            </Section>
          </>
        ) : null}
      </main>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle>{value}</CardTitle>
      </CardHeader>
      {hint ? <CardContent className="text-xs text-muted-foreground">{hint}</CardContent> : null}
    </Card>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="font-heading text-xl">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

function RowTable({
  rows,
  empty,
}: {
  empty: string;
  rows: Array<{ id: string; title: string; meta: string; ok: boolean; detail: string }>;
}) {
  if (!rows.length) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border/70">
      <table className="w-full min-w-[40rem] text-left text-sm">
        <thead className="text-xs tracking-wide text-muted-foreground uppercase">
          <tr>
            <th className="px-3 py-2 font-medium">Item</th>
            <th className="px-3 py-2 font-medium">Map</th>
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-border/60">
              <td className="px-3 py-2">
                <div className="font-medium">{row.title}</div>
                <div className="font-mono text-xs text-muted-foreground">{row.id}</div>
              </td>
              <td className="px-3 py-2 text-muted-foreground">{row.meta}</td>
              <td className="px-3 py-2">
                <Badge variant={row.ok ? "secondary" : "outline"}>{row.ok ? "ok" : "pending"}</Badge>
                {row.detail ? (
                  <div className="mt-1 text-xs text-muted-foreground">{row.detail}</div>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
