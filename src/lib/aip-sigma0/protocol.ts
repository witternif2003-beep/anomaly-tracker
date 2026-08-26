import { createHash } from "node:crypto";

export const AIP_SIGMA0_ID = "AIP-Σ0" as const;
export const AIP_SPECTRUM = [
  { id: "S0-contract", surface: "optimizer prompt", role: "HAND + AIP-Σ0 no-invent contract in every Detail prompt" },
  { id: "S1-receipts", surface: "legal search", role: "SHA-256 tool receipts on every hit" },
  { id: "S2-scan", surface: "claim scanner", role: "Deterministic citation / statistic / weasel / URL / case-name scan" },
  { id: "S3-chat", surface: "local-v1 completions", role: "Scan answers against the user brief and retrieved hits; append verdict" },
  { id: "S4-legal", surface: "POST /v1/legal/search", role: "Ground hits to retrieved text; never mint a holding" },
  { id: "S5-optimize", surface: "POST /api/optimize", role: "Scan the source brief and self-scan the rewritten prompt" },
  { id: "S6-api", surface: "GET /v1/aip + POST /v1/aip/scan + GET /v1/aip/dive", role: "Live protocol status, on-demand scan, and deep dive" },
  { id: "S7-policy", surface: "GET /v1/policy", role: "AIP-Σ0 full spectrum marked deployed" },
  { id: "S8-playground", surface: "local playground", role: "Chat path uses the same scanner as /v1/chat/completions" },
  { id: "S9-studio", surface: "Lyra studio", role: "Badge + brief-scan and prompt self-scan on 4-D results" },
  { id: "S10-dive", surface: "GET /v1/aip/dive + /aip", role: "Live fixture suite and optimizer self-scan (not a canned boolean)" },
] as const;

export function aipReceipt(parts: Array<string | undefined>): {
  protocol: typeof AIP_SIGMA0_ID;
  kind: "tool-receipt";
  sha256: string;
} {
  const body = parts.map((p) => p ?? "").join("|");
  return {
    protocol: AIP_SIGMA0_ID,
    kind: "tool-receipt",
    sha256: createHash("sha256").update(body).digest("hex"),
  };
}

export function aipSigma0Status() {
  return {
    object: "aip.sigma0" as const,
    protocol: AIP_SIGMA0_ID,
    name: "Anchor Inventory Protocol Σ0",
    deployed: true,
    simulated: false,
    spectrum: "full",
    hardening: "active",
    cloudflareLiveDeploy: false,
    note: "Local full-spectrum anti-hallucination. Not a live Cloudflare deploy. Claims that are not in the brief or a tool receipt are flagged.",
    deepDive: {
      localApi: "/v1/aip/dive",
      studio: "/aip",
      nextApi: "/api/aip/dive",
    },
    bands: AIP_SPECTRUM.map((band) => ({ ...band, status: "deployed" as const, live: true as const })),
  };
}
