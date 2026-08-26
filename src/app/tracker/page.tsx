import { TrackerClient } from "./tracker-client";

export const metadata = {
  title: "Anomaly tracker — Lyra",
  description:
    "Unclassified 3D business anomaly tracker with 24/7 fixture telemetry and 500 post-doctoral improvements. Fixture data only — no intercepts or live NCIC.",
};

/**
 * Do NOT SSR-inline public/static/anomaly.json.
 * The bake is multi‑MB (scene + May packets + BO auto-queue stream). Embedding it in
 * HTML crashes mobile browsers ("This page couldn't load"). Client fetches static JSON.
 */
export default function TrackerPage() {
  return (
    <div className="relative flex min-h-full flex-1 flex-col">
      <TrackerClient />
      <footer className="border-t border-border/40 px-4 py-4 text-center text-xs text-muted-foreground">
        Fixture rehearsal only. Data loads from /static/anomaly.json at runtime for GitHub Pages.
      </footer>
    </div>
  );
}
