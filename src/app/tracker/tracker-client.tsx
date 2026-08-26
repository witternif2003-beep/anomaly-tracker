"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Suspense } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const BusinessGlobe = dynamic(() => import("@/components/3d/BusinessGlobe"), {
  ssr: false,
  loading: () => (
    <div className="flex h-96 items-center justify-center rounded-lg border border-border/60 text-sm text-muted-foreground">
      Loading 3D…
    </div>
  ),
});

export function TrackerClient() {
  return (
    <main className="starfield relative mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.14em] text-muted-foreground uppercase">
            3D fixture map · taxonomy-bound · unclassified
          </p>
          <h1 className="font-heading text-3xl tracking-tight">Anomaly tracker</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Lazy-loaded WebGL globe over hard-coded fixtures. Not live device tracking, intercepts, or
            NCIC.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            Studio
          </Link>
          <Link href="/corporate/" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
            Corporate
          </Link>
          <Link href="/inventory/" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
            Inventory
          </Link>
        </div>
      </header>
      <Suspense fallback={null}>
        <BusinessGlobe />
      </Suspense>
    </main>
  );
}
