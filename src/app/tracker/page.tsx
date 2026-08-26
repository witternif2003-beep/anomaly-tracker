import { readFileSync } from "node:fs";
import path from "node:path";
import type { ComponentProps } from "react";
import { TrackerClient } from "./tracker-client";

export const metadata = {
  title: "Anomaly tracker — Lyra",
  description:
    "Unclassified 3D business anomaly tracker bound to the corporate forensic taxonomy. Fixture data only — no intercepts or live NCIC.",
};

export default function TrackerPage() {
  const initialData = JSON.parse(
    readFileSync(path.join(process.cwd(), "public/static/anomaly.json"), "utf8"),
  ) as ComponentProps<typeof TrackerClient>["initialData"];

  return (
    <div className="starfield relative flex min-h-full flex-1 flex-col">
      <TrackerClient initialData={initialData} />
      <footer className="border-t border-border/60 px-4 py-4 text-center text-xs text-muted-foreground">
        Fixture rehearsal only. Intercepts, SIGINT, and mass surveillance of U.S. businesses are out of
        scope. Data is baked at build time for GitHub Pages.
      </footer>
    </div>
  );
}
