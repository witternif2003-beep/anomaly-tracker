import { describe, expect, it } from "vitest";
import { earningsFromLedger } from "../src/lib/earnings";

const asOf = new Date("2026-10-25T12:00:00Z");
const byDay = [
  { day: "2026-10-25", type: "transfer_in", total_cents: 1000 },
  { day: "2026-10-25", type: "inference", total_cents: -200 },
  { day: "2026-10-20", type: "transfer_in", total_cents: 500 },
  { day: "2026-09-01", type: "transfer_in", total_cents: 800_000 },
  { day: "2026-10-24", type: "topup", total_cents: 500 },
];
const inf = [{ day: "2026-10-25", cost_cents: 300 }];
const tx = [
  { type: "transfer_in", amount_cents: 600, description: "bounty A", created_at: "2026-10-25T10:00:00Z" },
  { type: "transfer_in", amount_cents: 400, description: "bounty A", created_at: "2026-10-25T11:00:00Z" },
  { type: "transfer_out", amount_cents: -50, description: "x", created_at: "2026-10-25T09:00:00Z" },
];

describe("earningsFromLedger", () => {
  const e = earningsFromLedger(tx, byDay, inf, asOf);
  it("windows only count days inside the window; cost is max(ledger, inference) per day", () => {
    const [today, d7, d30, all] = e.windows;
    expect(today).toMatchObject({ revenueCents: 1000, costCents: 300, netCents: 700, observedDays: 1 });
    expect(d7.revenueCents).toBe(1500);
    expect(d30.revenueCents).toBe(1500);
    expect(all.revenueCents).toBe(801_500);
    expect(today.retention).toBeCloseTo(0.7);
  });
  it("topups are funding, not revenue", () => {
    expect(e.daily.find((d) => d.day === "2026-10-24")).toMatchObject({ revenueCents: 0, netCents: 0 });
  });
  it("target gap and met-target use the operator target, and short records are labelled noise", () => {
    expect(e.daysMetTarget).toBe(1);
    expect(e.daily.find((d) => d.day === "2026-10-25")!.targetGapCents).toBe(700 - 700_000);
    expect(e.sampleLabel).toBe("statistically_indistinguishable_from_noise");
  });
  it("income lists transfer_in only, newest first, grouped by description", () => {
    expect(e.income.map((i) => i.amountCents)).toEqual([400, 600]);
    expect(e.incomeBySource).toEqual([{ source: "bounty A", n: 2, cents: 1000 }]);
  });
  it("empty ledger yields zeros and no retention", () => {
    const z = earningsFromLedger([], [], [], asOf);
    expect(z.windows[0]).toMatchObject({ revenueCents: 0, netCents: 0, retention: null });
    expect(z.observedDays).toBe(0);
  });
});
