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

interface Binding {
  kind: string;
  id: string;
  state: string;
  detail: string;
}

interface Category {
  id: string;
  label: string;
  application: string;
  doctrine: string[];
  corporateUse: string;
  bindings: Binding[];
  presentCount: number;
  bindingCount: number;
}

interface Book {
  classified: boolean;
  governmentProgram: boolean;
  note: string;
  audience: string;
  commandOutput: {
    node: string;
    oneShot: string;
    dockerAvailable: boolean;
    cuckooLiveSandbox: boolean;
    cjisLiveQueries: boolean;
    mcpServers: string[];
    lockfileCore: string[];
  };
  summary: {
    categories: number;
    enforcement: number;
    workflow: number;
    wontDo: number;
    bindingsPresent: number;
    bindingsTotal: number;
  };
  categories: Category[];
  enforcement: Array<{
    id: string;
    label: string;
    framework: string;
    corporateResponse: string;
    liveAction: boolean;
    searchQuery: string;
  }>;
  workflow: Array<{
    step: number;
    id: string;
    title: string;
    action: string;
    command: string;
  }>;
  wontDo: Array<{ id: string; title: string; reason: string }>;
}

export function CorporateTaxonomy() {
  const [book, setBook] = useState<Book | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [q, setQ] = useState("");

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const { data } = await fetchJsonWithStaticFallback<Book & { error?: string }>(
        "/api/corporate",
        "/static/corporate.json",
      );
      if (data.error) {
        setBook(null);
        setError(data.error);
        return;
      }
      setBook(data);
    } catch {
      setBook(null);
      setError("Could not reach the corporate taxonomy.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const needle = q.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!book) return null;
    const hit = (value: string) => !needle || value.toLowerCase().includes(needle);
    return {
      categories: book.categories.filter((c) =>
        hit(`${c.label} ${c.application} ${c.doctrine.join(" ")} ${c.corporateUse}`),
      ),
      enforcement: book.enforcement.filter((e) =>
        hit(`${e.label} ${e.framework} ${e.corporateResponse}`),
      ),
      workflow: book.workflow.filter((w) => hit(`${w.title} ${w.action} ${w.command}`)),
      wontDo: book.wontDo.filter((w) => hit(`${w.title} ${w.reason}`)),
    };
  }, [book, needle]);

  return (
    <div className="relative flex flex-1 flex-col">
      <header className="border-b border-border/70 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div>
            <p className="font-heading text-2xl leading-none tracking-tight">Corporate taxonomy</p>
            <p className="mt-1 text-xs tracking-[0.14em] text-muted-foreground uppercase">
              Business law · compliance · LE liaison through counsel
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              Studio
            </Link>
            <Link href="/inventory" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
              Inventory
            </Link>
            <Link href="/tracker" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
              Tracker
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
                Compiling taxonomy
              </CardTitle>
              <CardDescription>Reading lockfile, MCP, placeholders, and inventory status.</CardDescription>
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

        {book && filtered ? (
          <>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{book.note}</p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">classified={String(book.classified)}</Badge>
              <Badge variant="outline">governmentProgram={String(book.governmentProgram)}</Badge>
              <Badge variant="outline">
                {book.summary.bindingsPresent}/{book.summary.bindingsTotal} bindings live
              </Badge>
              <Badge variant="outline">node {book.commandOutput.node}</Badge>
              <Badge variant="outline">
                CJIS live={String(book.commandOutput.cjisLiveQueries)}
              </Badge>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Evidence categories" value={String(book.summary.categories)} />
              <Stat label="Enforcement rows" value={String(book.summary.enforcement)} />
              <Stat label="Workflow steps" value={String(book.summary.workflow)} />
              <Stat label="Won't-do" value={String(book.summary.wontDo)} />
            </div>

            <Input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Filter categories, statutes, workflow, refusals…"
              aria-label="Filter taxonomy"
            />

            <Section
              title="Evidence categories"
              description="Each row is bound to files, lockfile packages, MCP servers, and credential placeholders in this checkout."
            >
              {filtered.categories.length ? (
                <div className="grid gap-3">
                  {filtered.categories.map((cat) => (
                    <Card key={cat.id} size="sm">
                      <CardHeader>
                        <CardTitle className="text-base">{cat.label}</CardTitle>
                        <CardDescription>
                          {cat.doctrine.join(" · ")} · {cat.presentCount}/{cat.bindingCount} bindings
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-2">
                        <p className="text-sm leading-6">{cat.application}</p>
                        <p className="text-xs leading-5 text-muted-foreground">{cat.corporateUse}</p>
                        <ul className="flex flex-col gap-1">
                          {cat.bindings.slice(0, 8).map((b) => (
                            <li key={`${b.kind}-${b.id}`} className="text-xs leading-5">
                              <span className="font-medium">{b.kind}</span>{" "}
                              <span className="text-muted-foreground">
                                {b.id} — {b.state}: {b.detail}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No categories match that filter.</p>
              )}
            </Section>

            <Section
              title="Law-enforcement interface (corporate response)"
              description="Statutes for counsel. liveAction is always false — this studio does not file, freeze, or query NCIC."
            >
              <div className="grid gap-3 md:grid-cols-2">
                {filtered.enforcement.map((row) => (
                  <Card key={row.id} size="sm">
                    <CardHeader>
                      <CardTitle className="text-base">{row.label}</CardTitle>
                      <CardDescription>{row.framework}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm leading-6">{row.corporateResponse}</p>
                      <p className="mt-2 text-xs text-muted-foreground">Search: {row.searchQuery}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </Section>

            <Section title="Investigation workflow" description="Eight steps using commands this repo actually exposes.">
              <ol className="grid gap-3">
                {filtered.workflow.map((step) => (
                  <li key={step.id} className="rounded-lg border border-border/70 bg-card/50 p-3">
                    <p className="text-sm font-medium">
                      {step.step}. {step.title}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{step.action}</p>
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">{step.command}</p>
                  </li>
                ))}
              </ol>
            </Section>

            <Section title="Won't do" description="Collection and live government interfaces stay off.">
              <div className="grid gap-3 md:grid-cols-2">
                {filtered.wontDo.map((row) => (
                  <div key={row.id} className="rounded-lg border border-border/70 p-3">
                    <p className="text-sm font-medium">{row.title}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{row.reason}</p>
                  </div>
                ))}
              </div>
            </Section>
          </>
        ) : null}
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card/50 px-3 py-3">
      <p className="text-xs tracking-[0.14em] text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 font-heading text-2xl">{value}</p>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="font-heading text-xl">{title}</h2>
        <p className="text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}
