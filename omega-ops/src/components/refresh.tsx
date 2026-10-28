"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Re-fetches the server-rendered page on an interval so figures stay current. */
export function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  const [on, setOn] = useState(true);
  const [tick, setTick] = useState(seconds);

  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => {
      setTick((v) => {
        if (v <= 1) {
          router.refresh();
          return seconds;
        }
        return v - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [on, router, seconds]);

  return (
    <button onClick={() => setOn((v) => !v)} className="rounded border border-line px-2 py-0.5 font-mono text-[11px] text-dim hover:text-fg" title="Toggle live refresh">
      {on ? `live · ${tick}s` : "paused"}
    </button>
  );
}
