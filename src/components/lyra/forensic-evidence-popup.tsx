"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ScrollArea } from "@/components/ui/scroll-area";

export type ForensicElement = {
  id: string;
  artifact: string;
  title: string;
  detail: string;
  timestamp: string;
  doctrine: string[];
  collectionStatus: string;
  wontDo?: string | null;
  lat?: number;
  lon?: number;
};

export type ForensicCategory = {
  fbiCategory: string;
  corporateCategoryId: string;
  corporateLabel: string;
  businessLawHook: string;
  priority: string;
  collectionStatus: string;
  wontDo?: string | null;
  elements: ForensicElement[];
};

export type MayForensicPacket = {
  period: string;
  entityId: string;
  entityName: string;
  title: string;
  note: string;
  categoryCount: number;
  elementCount: number;
  categories: ForensicCategory[];
};

export function ForensicEvidencePopup({
  open,
  onOpenChange,
  packet,
  highlightFbiCategory,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  packet: MayForensicPacket | null;
  highlightFbiCategory?: string | null;
}) {
  const defaultValue = useMemo(() => {
    if (!packet?.categories.length) return [];
    const hit = packet.categories.find((c) => c.fbiCategory === highlightFbiCategory);
    return [(hit ?? packet.categories[0]).fbiCategory];
  }, [packet, highlightFbiCategory]);

  if (!packet) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            May forensic menu · {packet.entityName}
          </DialogTitle>
          <DialogDescription>
            FBI evidence typology mapped to business-law / corporate LE categories. Fixture rehearsal
            only — no live intercepts, SIGINT, or SWIFT sessions.
          </DialogDescription>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge variant="secondary">{packet.period}</Badge>
            <Badge variant="outline">{packet.categoryCount} categories</Badge>
            <Badge variant="outline">{packet.elementCount} elements</Badge>
          </div>
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1 px-5">
          <Accordion defaultValue={defaultValue} className="pb-4">
            {packet.categories.map((cat) => (
              <AccordionItem key={cat.fbiCategory} value={cat.fbiCategory}>
                <AccordionTrigger className="items-center gap-3 py-3 hover:no-underline">
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
                    <span className="truncate font-medium">{cat.fbiCategory}</span>
                    <span className="truncate text-xs font-normal text-muted-foreground">
                      → {cat.corporateLabel}
                    </span>
                  </span>
                  <Badge
                    variant={cat.collectionStatus === "constrained" ? "destructive" : "secondary"}
                    className="mr-2 shrink-0"
                  >
                    {cat.priority} · {cat.collectionStatus}
                  </Badge>
                </AccordionTrigger>
                <AccordionContent className="pb-3">
                  <p className="mb-3 text-xs text-muted-foreground">{cat.businessLawHook}</p>
                  {cat.wontDo ? (
                    <p className="mb-3 text-xs text-amber-300/90">
                      Constrained / wont-do: {cat.wontDo}
                    </p>
                  ) : null}
                  <ul className="space-y-2.5">
                    {cat.elements.map((el) => (
                      <li
                        key={el.id}
                        className="rounded-lg border border-border/50 bg-background/40 px-3 py-2.5"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="text-sm font-medium text-foreground">{el.title}</p>
                          <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                            {el.timestamp}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-primary/90">{el.artifact}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{el.detail}</p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {el.doctrine.map((d) => (
                            <Badge key={d} variant="outline" className="text-[10px]">
                              {d}
                            </Badge>
                          ))}
                          {el.wontDo ? (
                            <Badge variant="destructive" className="text-[10px]">
                              {el.wontDo}
                            </Badge>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </ScrollArea>

        <DialogFooter>
          <p className="mr-auto max-w-md text-[11px] text-muted-foreground">{packet.note}</p>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Compact trigger row for tracker list / globe chrome. */
export function ForensicMenuTrigger({
  label = "Open May forensic menu",
  onClick,
  disabled,
}: {
  label?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="tracking-[0.08em] uppercase"
      onClick={onClick}
      disabled={disabled}
    >
      {label}
    </Button>
  );
}

export function useForensicPopup() {
  const [open, setOpen] = useState(false);
  const [packet, setPacket] = useState<MayForensicPacket | null>(null);
  const [highlightFbiCategory, setHighlightFbiCategory] = useState<string | null>(null);

  function openPacket(next: MayForensicPacket | null, fbiCategory?: string | null) {
    if (!next) return;
    setPacket(next);
    setHighlightFbiCategory(fbiCategory ?? null);
    setOpen(true);
  }

  return {
    open,
    setOpen,
    packet,
    highlightFbiCategory,
    openPacket,
  };
}
