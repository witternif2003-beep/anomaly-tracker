import type { ReactElement } from "react";

import corporateTaxonomy from "../../../data/legal/corporate-taxonomy.json";
import fixtures from "../../../data/anomaly/fixtures.json";
import evidenceCorpus from "../../../data/anomaly/evidence-corpus.json";
import improvementSeeds from "../../../data/anomaly/improvement-seeds.json";
import inventoryLedger from "../../../data/anomaly/inventory-ledger.json";

export const metadata = {
  title: "Corporate taxonomy — Lyra",
  description:
    "Business-law forensic evidence map compiled at build time from this repo's taxonomy fixtures.",
};

interface TaxonomySource {
  name: string;
  status: "loaded" | "missing";
  size: number;
  summary?: string;
  entries?: unknown;
}

function describe(entries: Record<string, unknown>): string {
  if (Array.isArray(entries.categories)) {
    return `${entries.categories.length} taxonomy categories`;
  }
  if (Array.isArray(entries.fbiToCorporate)) {
    return `${entries.fbiToCorporate.length} FBI→corporate maps · ${(entries.elements as unknown[] | undefined)?.length ?? 0} evidence elements`;
  }
  if (Array.isArray(entries.entityTypes)) {
    return `${entries.entityTypes.length} entity types · ${(entries.entities as unknown[] | undefined)?.length ?? 0} fixtures`;
  }
  if (Array.isArray(entries.seeds)) {
    return `${entries.seeds.length} improvement seeds`;
  }
  return `${Object.keys(entries).length} top-level keys`;
}

function compileSource(name: string, entries: Record<string, unknown>): TaxonomySource {
  return {
    name,
    status: "loaded",
    size: Buffer.byteLength(JSON.stringify(entries)),
    summary: describe(entries),
    entries,
  };
}

// Fixtures are imported, so they are bundled at build time and baked into static HTML.
export default function CorporatePage(): ReactElement {
  const compiled = [
    compileSource("data/legal/corporate-taxonomy.json", corporateTaxonomy),
    compileSource("data/anomaly/fixtures.json", fixtures),
    compileSource("data/anomaly/evidence-corpus.json", evidenceCorpus),
    compileSource("data/anomaly/improvement-seeds.json", improvementSeeds),
    compileSource("data/anomaly/inventory-ledger.json", inventoryLedger),
  ];
  const taxonomy = compiled.find((s) => s.name.includes("corporate-taxonomy.json"));
  const evidence = compiled.find((s) => s.name.includes("evidence-corpus.json"));
  const categories =
    taxonomy?.status === "loaded" &&
    taxonomy.entries &&
    typeof taxonomy.entries === "object" &&
    Array.isArray((taxonomy.entries as { categories?: unknown }).categories)
      ? (
          (taxonomy.entries as { categories: Array<{ id: string; label: string; corporateUse?: string; doctrine?: string[] }> })
            .categories
        )
      : [];

  const fbiMap =
    evidence?.status === "loaded" &&
    evidence.entries &&
    Array.isArray((evidence.entries as { fbiToCorporate?: unknown }).fbiToCorporate)
      ? (
          (evidence.entries as {
            fbiToCorporate: Array<{
              fbiCategory: string;
              corporateLabel: string;
              businessLawHook: string;
            }>;
            elements?: unknown[];
            note?: string;
          })
        )
      : null;

  return (
    <main className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6">
      <header className="glass-panel flex flex-wrap items-end justify-between gap-3 p-5">
        <div>
          <p className="text-[10px] tracking-[0.22em] text-primary/80 uppercase">Build-time compile</p>
          <h1 className="font-display text-3xl tracking-tight">Corporate taxonomy</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Sources are read during <code className="text-xs">next build</code> and baked into this
            static page — no client fetch, no loading spinner.
          </p>
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-2">
        {compiled.map((src) => (
          <article key={src.name} className="glass-panel p-4">
            <p className="font-mono text-xs text-muted-foreground">{src.name}</p>
            <p
              className={
                src.status === "loaded" ? "mt-2 text-sm text-emerald-400" : "mt-2 text-sm text-destructive"
              }
            >
              {src.status === "loaded"
                ? `Loaded · ${(src.size / 1024).toFixed(1)} KB · ${src.summary}`
                : "Missing"}
            </p>
          </article>
        ))}
      </section>

      <section className="glass-panel space-y-3 p-5">
        <h2 className="font-display text-lg">Categories ({categories.length})</h2>
        <div className="grid gap-2">
          {categories.map((cat) => (
            <div key={cat.id} className="rounded-lg border border-border/40 bg-background/20 px-3 py-2">
              <p className="text-sm font-medium">{cat.label}</p>
              {cat.corporateUse ? (
                <p className="mt-1 text-xs text-muted-foreground">{cat.corporateUse}</p>
              ) : null}
              {cat.doctrine?.length ? (
                <p className="mt-1 text-[11px] text-muted-foreground">{cat.doctrine.join(" · ")}</p>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      {fbiMap ? (
        <section className="glass-panel space-y-3 p-5">
          <h2 className="font-display text-lg">
            FBI typology → corporate business law ({fbiMap.fbiToCorporate.length})
          </h2>
          <p className="text-sm text-muted-foreground">{fbiMap.note}</p>
          <div className="grid gap-2 md:grid-cols-2">
            {fbiMap.fbiToCorporate.map((row) => (
              <div key={row.fbiCategory} className="rounded-lg border border-border/40 bg-background/20 px-3 py-2">
                <p className="text-[10px] tracking-[0.16em] text-primary/80 uppercase">{row.fbiCategory}</p>
                <p className="mt-1 text-sm font-medium">{row.corporateLabel}</p>
                <p className="mt-1 text-xs text-muted-foreground">{row.businessLawHook}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {(fbiMap.elements?.length ?? 0)} narrative evidence elements baked from{" "}
            <code className="text-[11px]">data/anomaly/evidence-corpus.json</code>
          </p>
        </section>
      ) : null}
    </main>
  );
}
