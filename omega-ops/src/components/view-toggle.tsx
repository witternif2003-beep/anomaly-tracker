"use client";

import { useState } from "react";
import { DESKTOP_WIDTH, VIEW_COOKIE } from "@/lib/view";

/** Pins the layout to mobile or desktop width; the choice survives refreshes and navigation. */
export function ViewToggle({ initial }: { initial: "mobile" | "desktop" }) {
  const [view, setView] = useState(initial);
  function flip() {
    const next = view === "desktop" ? "mobile" : "desktop";
    document.cookie = `${VIEW_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    document
      .querySelector('meta[name="viewport"]')
      ?.setAttribute("content", next === "desktop" ? `width=${DESKTOP_WIDTH}` : "width=device-width, initial-scale=1");
    setView(next);
  }
  return (
    <button onClick={flip} className="rounded border border-line px-2 py-1 font-mono text-xs text-dim hover:text-fg" title="Switch layout width">
      {view === "desktop" ? "mobile view" : "desktop view"}
    </button>
  );
}
