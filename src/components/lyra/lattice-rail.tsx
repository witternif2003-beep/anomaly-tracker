import { cn } from "@/lib/utils";
import type { Lyra2Lattice } from "@/lib/optimize/types";

const FAMILY: Record<Lyra2Lattice["axes"][number]["family"], string> = {
  "4d": "4-D",
  ghost: "GHOST",
  hand: "HAND",
};

export function LatticeRail({
  lattice,
  engaged,
}: {
  lattice?: Lyra2Lattice;
  engaged: boolean;
}) {
  if (!engaged) {
    return (
      <p className="text-xs text-muted-foreground">
        Basic mode — Lyra-2 lattice is idle. Switch to GHOST-HAND to engage 13 axes.
      </p>
    );
  }
  const axes = lattice?.axes ?? [];
  const tensions = lattice?.tensions ?? [];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs tracking-[0.16em] text-muted-foreground uppercase">
          Lyra-2 lattice
          {lattice ? ` · ${lattice.lockedCount}/${lattice.axisCount} locked` : ""}
        </p>
        {tensions.length ? (
          <p className="text-xs text-muted-foreground">
            {tensions.length} tension{tensions.length === 1 ? "" : "s"}
          </p>
        ) : null}
      </div>
      <ol className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {axes.map((axis) => (
          <li
            key={axis.id}
            className={cn(
              "rounded-lg border px-2 py-1.5",
              axis.status === "locked"
                ? "border-primary/40 bg-primary/8"
                : axis.status === "open"
                  ? "border-destructive/35 bg-destructive/8"
                  : axis.status === "defaulted"
                    ? "border-border bg-card/70"
                    : "border-border/70 bg-card/40",
            )}
            title={axis.note}
          >
            <p className="font-mono text-[9px] tracking-[0.14em] text-muted-foreground">
              {FAMILY[axis.family]}
            </p>
            <p className="text-xs font-medium leading-4">{axis.name}</p>
            <p className="text-[10px] text-muted-foreground">
              {axis.status} · {axis.score}/2
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
