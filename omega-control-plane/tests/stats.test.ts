import { describe, expect, it } from "vitest";
import { dailyPnl, pnlFromAggregates } from "../src/lib/pnl";
import { expectedMaxSr, minTrl, moments, normCdf, normInv, psr, validateTrackRecord } from "../src/lib/stats";

// Reference values computed independently with Python's statistics.NormalDist (stdlib) on the same series.
const series = Array.from({ length: 60 }, (_, i) => (((i * 37) % 23) - 9) / 4 + (i % 5 === 0 ? 0.6 : 0));

describe("normal distribution", () => {
  it("cdf and inverse", () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 7);
    expect(normCdf(1.959963985)).toBeCloseTo(0.975, 6);
    expect(normInv(0.95)).toBeCloseTo(1.644853627, 7);
    expect(normInv(0.01)).toBeCloseTo(-2.326347874, 7);
  });
});

describe("track-record statistics", () => {
  it("moments match the reference", () => {
    const m = moments(series)!;
    expect(series.slice(0, 6)).toEqual([-1.65, 1.25, -1.0, 2.5, 0.25, -1.4]);
    expect(m.mean).toBeCloseTo(0.5908333333, 9);
    expect(m.sd).toBeCloseTo(1.6088339726, 9);
    expect(m.skew).toBeCloseTo(-0.0645550376, 9);
    expect(m.kurtosis).toBeCloseTo(1.8777245734, 9);
  });
  it("PSR, MinTRL and E[max SR] match the reference", () => {
    const m = moments(series)!;
    const sr = m.mean / m.sd;
    expect(sr).toBeCloseTo(0.3672431981, 9);
    expect(psr(sr, 60, m.skew, m.kurtosis)).toBeCloseTo(0.9970070112, 6);
    expect(minTrl(sr, m.skew, m.kurtosis)).toBeCloseTo(22.1300104758, 5);
    expect(expectedMaxSr(0.5, 100)).toBeCloseTo(1.7894064663, 6);
    expect(expectedMaxSr(1, 10)).toBeCloseTo(1.5745983013, 6);
  });
  it("labels short records as noise and nulls PSR/PBO", () => {
    const v = validateTrackRecord([1, 2, -1, 3]);
    expect(v.label).toBe("statistically_indistinguishable_from_noise");
    expect(v.psr).toBeNull();
    expect(v.pbo).toBeNull();
    expect(v.minTrl).toBe(Infinity);
  });
  it("caps PSR at 0.95 and rejects on the data floor", () => {
    const v = validateTrackRecord(series);
    expect(v.psrUncapped).toBeGreaterThan(0.99);
    expect(v.psr).toBe(0.95);
    expect(v.gateStatus).toBe("REJECT_DATA");
    expect(v.label).toBe("not_validated");
  });
});

describe("pnl", () => {
  it("separates funding from revenue and takes the larger cost measure", () => {
    const p = pnlFromAggregates(
      [
        { type: "transfer_in", total_cents: 1200 },
        { type: "topup", total_cents: 500 },
        { type: "inference", total_cents: -300 },
      ],
      { cost_cents: 450 },
    );
    expect(p).toMatchObject({ revenueCents: 1200, fundingCents: 500, costCents: 450, netCents: 750 });
  });
  it("builds a daily series oldest-first", () => {
    const d = dailyPnl(
      [
        { day: "2026-10-02", type: "transfer_in", total_cents: 100 },
        { day: "2026-10-01", type: "x402_payment", total_cents: -40 },
      ],
      [{ day: "2026-10-02", cost_cents: 30 }],
    );
    expect(d).toEqual([
      { day: "2026-10-01", revenueCents: 0, costCents: 40, netCents: -40 },
      { day: "2026-10-02", revenueCents: 100, costCents: 30, netCents: 70 },
    ]);
  });
});
