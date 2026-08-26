import { AipConsole } from "@/components/lyra/aip-console";

export const metadata = {
  title: "AIP-Σ0 — Lyra",
  description:
    "Live AIP-Σ0 deep dive: real anti-hallucination fixtures, tool receipts, and optimizer self-scan. Not simulated.",
};

export default function AipPage() {
  return (
    <div className="starfield relative flex min-h-full flex-1 flex-col">
      <AipConsole />
      <footer className="border-t border-border/60 px-4 py-4 text-center text-xs text-muted-foreground">
        AIP-Σ0 is local anti-hallucination hardening. It is not a live Cloudflare deploy and it
        does not call a hosted model.
      </footer>
    </div>
  );
}
