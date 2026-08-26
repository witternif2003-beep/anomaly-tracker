import { AipConsole } from "@/components/lyra/aip-console";

export const metadata = {
  title: "AIP-Σ0 — Lyra",
  description:
    "Live AIP-Σ0 deep dive: real anti-hallucination fixtures, tool receipts, and optimizer self-scan. Not simulated.",
};

export default function AipPage() {
  return (
    <div className="relative flex min-h-full flex-1 flex-col">
      <AipConsole />
      <footer className="border-t border-border/40 px-4 py-4 text-center text-xs text-muted-foreground">
        AIP-Σ0 is local anti-hallucination hardening — not a live Cloudflare deploy.
      </footer>
    </div>
  );
}
