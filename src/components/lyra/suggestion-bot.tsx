"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { suggestLive, type LiveSuggestion } from "@/lib/optimize/suggest";
import type { Mode } from "@/lib/optimize/types";
import { cn } from "@/lib/utils";

export function SuggestionBot({
  input,
  mode,
  dismissed,
  onApply,
  onDismiss,
}: {
  input: string;
  mode: Mode;
  dismissed: Set<string>;
  onApply: (insert: string) => void;
  onDismiss: (id: string) => void;
}) {
  const report = useMemo(() => suggestLive(input, mode), [input, mode]);
  const visible = report.suggestions.filter((s) => !dismissed.has(s.id));
  const postdoc = mode === "postdoc";

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border/80 bg-card/50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs tracking-[0.16em] text-muted-foreground uppercase">
            Live suggestion bot
          </p>
          <p className="mt-0.5 text-sm font-medium">
            {postdoc ? "Post-doctoral rules" : "Hard-coded brief rules"}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline">Hard-coded</Badge>
          <Badge variant="secondary">{report.fired} fired</Badge>
        </div>
      </div>

      {report.idle ? (
        <p className="text-xs leading-5 text-muted-foreground">
          {postdoc
            ? "Type a research ask. The bot scores question, identification, corpus, and evidence as you type. It does not call a model."
            : "Type a draft. The bot flags vague quality words, missing audience, and unsourced percents. Switch to Post-doc for methods rules."}
        </p>
      ) : null}

      {report.clear ? (
        <p className="text-xs leading-5 text-muted-foreground">
          No hard-coded gaps fired on this draft. Optimize when ready.
        </p>
      ) : null}

      {visible.length ? (
        <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto pr-1">
          {visible.map((item) => (
            <SuggestionRow
              key={item.id}
              item={item}
              onApply={() => onApply(item.insert)}
              onDismiss={() => onDismiss(item.id)}
            />
          ))}
        </ul>
      ) : null}

      {!report.idle && !report.clear && visible.length === 0 ? (
        <p className="text-xs leading-5 text-muted-foreground">
          Remaining suggestions are hidden. Clear the draft to reset.
        </p>
      ) : null}
    </div>
  );
}

function SuggestionRow({
  item,
  onApply,
  onDismiss,
}: {
  item: LiveSuggestion;
  onApply: () => void;
  onDismiss: () => void;
}) {
  return (
    <li
      className={cn(
        "rounded-lg border px-2.5 py-2",
        item.severity === "block"
          ? "border-destructive/40 bg-destructive/8"
          : item.severity === "warn"
            ? "border-primary/35 bg-primary/6"
            : "border-border/70 bg-background/40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-5">{item.title}</p>
        <Badge variant="outline" className="shrink-0 capitalize">
          {item.severity}
        </Badge>
      </div>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.why}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Button type="button" size="xs" onClick={onApply}>
          Insert
        </Button>
        <Button type="button" size="xs" variant="ghost" onClick={onDismiss}>
          Hide
        </Button>
      </div>
    </li>
  );
}
