import { AnomalyTracker } from "@/components/lyra/anomaly-tracker";

export const metadata = {
  title: "Anomaly tracker — Lyra",
  description:
    "Unclassified 3D business anomaly tracker bound to the corporate forensic taxonomy. Fixture data only — no intercepts or live NCIC.",
};

export default function TrackerPage() {
  return (
    <div className="starfield relative flex min-h-full flex-1 flex-col">
      <AnomalyTracker />
      <footer className="border-t border-border/60 px-4 py-4 text-center text-xs text-muted-foreground">
        Fixture rehearsal only. Intercepts, SIGINT, and mass surveillance of U.S. businesses are out of scope.
      </footer>
    </div>
  );
}
