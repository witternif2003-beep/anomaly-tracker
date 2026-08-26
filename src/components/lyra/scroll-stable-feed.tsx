"use client";

/**
 * Scroll-stable wrapper for auto-populating feeds.
 *
 * Verified approach (W3C CSS Scroll Anchoring Module Level 1 + MDN overflow-anchor):
 * https://www.w3.org/TR/css-scroll-anchoring-1/
 * https://developer.mozilla.org/en-US/docs/Web/CSS/overflow-anchor
 *
 * Growing/prepending lists above the viewport fight the document scroller and bounce
 * the page. Fix:
 * 1. Fixed height scrollport so document layout below does not grow as items arrive
 * 2. overflow-anchor: none on the mutating region (exclude thrashing nodes as anchors)
 * 3. Stable sentinel after the feed for the browser to latch when the user scrolls past
 * 4. ResizeObserver document-scroll compensation for Safari (no overflow-anchor support)
 */

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ScrollStableFeed({
  children,
  className,
  heightClassName = "h-[420px] max-h-[420px]",
}: {
  children: ReactNode;
  className?: string;
  /** Tailwind height lock — prefer fixed h-* matching former max-h so layout never grows. */
  heightClassName?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const lastHeightRef = useRef(0);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    lastHeightRef.current = el.getBoundingClientRect().height;

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const next = entry.contentRect.height;
      const prev = lastHeightRef.current;
      lastHeightRef.current = next;
      const delta = next - prev;
      if (!delta || Math.abs(delta) < 0.5) return;

      // Only compensate when the user has already scrolled past this feed.
      const rect = el.getBoundingClientRect();
      if (rect.bottom > 0) return; // still intersecting or above viewport top→bottom

      // Safari / engines without reliable overflow-anchor: keep reading position.
      window.scrollBy(0, delta);
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={rootRef} className="scroll-stable-region">
      <div className={cn("scroll-stable-feed flex flex-col gap-2 overflow-y-auto pr-1", heightClassName, className)}>
        {children}
      </div>
      {/* Stable latch for document scroll anchoring once the user scrolls past. */}
      <div className="scroll-anchor-sentinel" aria-hidden />
    </div>
  );
}
