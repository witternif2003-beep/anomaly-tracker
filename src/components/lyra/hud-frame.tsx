import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Decorative holographic corner brackets for glass HUD panels. */
export function HudFrame({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <div className={cn("hud-frame relative", className)}>
      <span aria-hidden className="hud-corner hud-corner--tl" />
      <span aria-hidden className="hud-corner hud-corner--tr" />
      <span aria-hidden className="hud-corner hud-corner--bl" />
      <span aria-hidden className="hud-corner hud-corner--br" />
      {label ? (
        <span className="hud-frame-label pointer-events-none absolute top-2 left-4 z-10 text-[9px] tracking-[0.28em] text-primary/70 uppercase">
          {label}
        </span>
      ) : null}
      {children}
    </div>
  );
}
