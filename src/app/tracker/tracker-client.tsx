"use client";

import dynamic from "next/dynamic";
import { Suspense, type ComponentProps } from "react";
import { AnomalyTracker } from "@/components/lyra/anomaly-tracker";

const BusinessGlobe = dynamic(() => import("@/components/3d/BusinessGlobe"), {
  ssr: false,
  loading: () => (
    <div className="mx-auto flex h-72 w-full max-w-5xl items-center justify-center rounded-xl border border-border/60 text-sm text-muted-foreground">
      Loading 3D…
    </div>
  ),
});

type TrackerInitial = ComponentProps<typeof AnomalyTracker>["initialData"];

export function TrackerClient({ initialData }: { initialData?: TrackerInitial }) {
  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="mx-auto w-full max-w-5xl px-4 pt-2 sm:px-6">
        <div className="glass-panel overflow-hidden p-2">
          <Suspense fallback={null}>
            <BusinessGlobe initialData={initialData} />
          </Suspense>
        </div>
      </div>
      <AnomalyTracker initialData={initialData} />
    </div>
  );
}
