"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { P1_LOG_CAP, p1Log, type P1Entry } from "@/lib/p1-registry";

type Props = {
  /** Numbered baked P1 events — the whole catalog, not a page of it. */
  entries: readonly P1Entry[];
  /** Backlog P1 total since the discovery epoch — larger than what this session materialized. */
  totalP1: number;
  onSelect?: (anomalyId: string) => void;
  selectedId?: string | null;
};

function matcher(needle: string) {
  return (entry: P1Entry) =>
    !needle ||
    entry.ref.toLowerCase().includes(needle) ||
    String(entry.number).includes(needle) ||
    entry.title.toLowerCase().includes(needle) ||
    entry.entityName.toLowerCase().includes(needle) ||
    entry.categoryLabel.toLowerCase().includes(needle);
}

function groupByCategory(entries: readonly P1Entry[]) {
  const groups = new Map<string, P1Entry[]>();
  for (const entry of entries) {
    const key = entry.categoryLabel || "Uncategorized";
    const bucket = groups.get(key);
    if (bucket) bucket.push(entry);
    else groups.set(key, [entry]);
  }
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function EntryRow({
  entry,
  selected,
  onSelect,
}: {
  entry: P1Entry;
  selected: boolean;
  onSelect?: (anomalyId: string) => void;
}) {
  // Synthesized rows have no catalog entry to open, so they render inert.
  const Row = onSelect ? "button" : "div";
  return (
    <Row
      {...(onSelect ? { type: "button" as const, onClick: () => onSelect(entry.id) } : {})}
      className={cn(
        "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition",
        selected ? "bg-primary/15" : onSelect ? "hover:bg-muted/50" : "",
      )}
    >
      <span className="mt-px font-mono text-[10px] text-destructive-foreground/90 tabular-nums">
        {entry.ref}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">{entry.title}</span>
        <span className="block truncate text-[10px] text-muted-foreground">
          {entry.entityName}
          {entry.city ? ` · ${entry.city}` : ""}
          {entry.indicator ? ` · ${entry.indicator}` : ""}
          {entry.synthetic ? " · synthesized fixture" : ""}
        </span>
      </span>
    </Row>
  );
}

/**
 * Drop-down submenu over the entire numbered P1 set: baked events grouped by
 * category, plus the newest synthesized P1s from the continuous search.
 */
export function P1CatalogMenu({ entries, totalP1, onSelect, selectedId }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const live = useSyncExternalStore(p1Log.subscribe, p1Log.getSnapshot, p1Log.getServerSnapshot);

  const needle = q.trim().toLowerCase();
  const groups = useMemo(() => groupByCategory(entries.filter(matcher(needle))), [entries, needle]);
  const liveMatches = useMemo(() => live.filter(matcher(needle)), [live, needle]);
  const shown = groups.reduce((sum, [, rows]) => sum + rows.length, 0) + liveMatches.length;

  return (
    <div className="relative">
      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((prev) => !prev)}
      >
        P1 list · {(entries.length + live.length).toLocaleString()} numbered
        <span aria-hidden className="ml-1 text-[10px]">
          {open ? "▲" : "▼"}
        </span>
      </Button>
      {open ? (
        <div
          role="menu"
          className="absolute z-50 mt-2 max-h-[420px] w-[min(92vw,30rem)] overflow-y-auto rounded-xl border border-destructive/30 bg-card/95 p-3 shadow-xl backdrop-blur"
        >
          <div className="mb-2 flex items-center gap-2">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Find by number, entity, category…"
              className="h-8 text-xs"
              aria-label="Filter P1 list"
            />
            <Badge variant="outline" className="shrink-0 text-[10px]">
              {shown.toLocaleString()} shown
            </Badge>
          </div>
          {liveMatches.length ? (
            <details open className="mb-1 rounded-lg border border-destructive/25 bg-destructive/5">
              <summary className="cursor-pointer px-2 py-1.5 text-xs font-medium">
                Continuous search · newest synthesized ({liveMatches.length})
              </summary>
              <div className="px-1 pb-1">
                {liveMatches.map((entry) => (
                  <EntryRow key={entry.ref} entry={entry} selected={false} />
                ))}
              </div>
            </details>
          ) : null}
          {groups.map(([category, rows]) => (
            <details key={category} className="mb-1 rounded-lg border border-border/50">
              <summary className="cursor-pointer px-2 py-1.5 text-xs font-medium">
                {category} <span className="text-muted-foreground">({rows.length})</span>
              </summary>
              <div className="px-1 pb-1">
                {rows.map((entry) => (
                  <EntryRow
                    key={entry.ref}
                    entry={entry}
                    selected={selectedId === entry.id}
                    onSelect={(id) => {
                      onSelect?.(id);
                      setOpen(false);
                    }}
                  />
                ))}
              </div>
            </details>
          ))}
          {!shown ? <p className="px-2 py-3 text-xs text-muted-foreground">No P1 matches.</p> : null}
          <p className="mt-2 px-2 text-[10px] text-muted-foreground">
            Every P1 carries its own number. Catalog events are 1…{entries.length.toLocaleString()};
            synthesized rows continue above that band, newest first (last {P1_LOG_CAP} this session,
            of {totalP1.toLocaleString()} counted since the discovery epoch). Fixture narrative — not
            live surveillance.
          </p>
        </div>
      ) : null}
    </div>
  );
}
