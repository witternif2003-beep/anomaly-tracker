"use client";

import dynamic from "next/dynamic";
import { Suspense, type ComponentProps } from "react";
import { AnomalyTracker } from "@/components/lyra/anomaly-tracker";
import { GlassPanel } from "@/components/lyra/glass-panel";
import { HudFrame } from "@/components/lyra/hud-frame";

const BusinessGlobe = dynamic(() => import("@/components/3d/BusinessGlobe"), {
  ssr: false,
  loading: () => (
    <div className="mx-auto flex h-72 w-full max-w-5xl items-center justify-center text-sm text-muted-foreground">
      Loading orbital 3D…
    </div>
  ),
});

type TrackerInitial = ComponentProps<typeof AnomalyTracker>["initialData"];

export function TrackerClient({ initialData }: { initialData?: TrackerInitial }) {
  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="mx-auto w-full max-w-5xl px-4 pt-3 sm:px-6">
        <GlassPanel tilt className="p-3 sm:p-4" hover={false}>
          <HudFrame>
            <Suspense fallback={null}>
              <BusinessGlobe initialData={initialData} />
            </Suspense>
          </HudFrame>
        </GlassPanel>
      </div>
      <AnomalyTracker initialData={initialData} />
    </div>
  );
}
