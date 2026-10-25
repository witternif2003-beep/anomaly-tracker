// Mirrors Conway-Research/automaton v0.2.1 src/types.ts SURVIVAL_THRESHOLDS
// and src/conway/credits.ts getSurvivalTier().
export const SURVIVAL_TIERS = ["high", "normal", "low_compute", "critical", "dead"] as const;
export type SurvivalTier = (typeof SURVIVAL_TIERS)[number];

export const SURVIVAL_THRESHOLDS_CENTS = { high: 500, normal: 50, low_compute: 10 } as const;

export function survivalTier(creditsCents: number): SurvivalTier {
  if (creditsCents > SURVIVAL_THRESHOLDS_CENTS.high) return "high";
  if (creditsCents > SURVIVAL_THRESHOLDS_CENTS.normal) return "normal";
  if (creditsCents > SURVIVAL_THRESHOLDS_CENTS.low_compute) return "low_compute";
  if (creditsCents >= 0) return "critical";
  return "dead";
}

// automaton v0.2.1 src/conway/topup.ts TOPUP_TIERS (USD)
export const TOPUP_TIERS_USD = [5, 25, 100, 500, 1000, 2500] as const;
