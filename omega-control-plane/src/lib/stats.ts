// Track-record statistics for a realised daily net P&L series.
// PSR / MinTRL: Bailey & López de Prado, "The Sharpe Ratio Efficient Frontier", Journal of Risk (2012).
// E[max SR] for DSR: Bailey & López de Prado, "The Deflated Sharpe Ratio" (2014), eq. 1.
// Gate thresholds: operator policy (dsr-pbo-validation-suite rule) and Bailey et al., "The Probability of Backtest Overfitting".

const EULER_GAMMA = 0.5772156649015329;

export function normCdf(x: number): number {
  // Abramowitz & Stegun 7.1.26 via erf, |error| < 1.5e-7
  const t = 1 / (1 + 0.3275911 * (Math.abs(x) / Math.SQRT2));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/** Inverse standard normal CDF (Acklam's rational approximation, relative error < 1.2e-9). */
export function normInv(p: number): number {
  if (!(p > 0 && p < 1)) return p === 0 ? -Infinity : p === 1 ? Infinity : NaN;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - lo) return -normInv(1 - p);
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

export interface Moments {
  n: number;
  mean: number;
  sd: number;
  skew: number;
  kurtosis: number;
}

/** Sample mean, sd (n−1), skewness and (non-excess) kurtosis, as used in the PSR paper. */
export function moments(x: number[]): Moments | null {
  const n = x.length;
  if (n < 2) return null;
  const mean = x.reduce((s, v) => s + v, 0) / n;
  const d = x.map((v) => v - mean);
  const m2 = d.reduce((s, v) => s + v * v, 0) / n;
  const m3 = d.reduce((s, v) => s + v ** 3, 0) / n;
  const m4 = d.reduce((s, v) => s + v ** 4, 0) / n;
  const sd = Math.sqrt(d.reduce((s, v) => s + v * v, 0) / (n - 1));
  if (m2 === 0) return { n, mean, sd: 0, skew: 0, kurtosis: 3 };
  return { n, mean, sd, skew: m3 / m2 ** 1.5, kurtosis: m4 / m2 ** 2 };
}

const srVarianceTerm = (sr: number, skew: number, kurt: number) => 1 - skew * sr + ((kurt - 1) / 4) * sr * sr;

export function psr(sr: number, n: number, skew: number, kurt: number, srStar = 0): number {
  return normCdf(((sr - srStar) * Math.sqrt(n - 1)) / Math.sqrt(srVarianceTerm(sr, skew, kurt)));
}

export function minTrl(sr: number, skew: number, kurt: number, srStar = 0, alpha = 0.05): number {
  if (!(sr > srStar)) return Infinity;
  return 1 + srVarianceTerm(sr, skew, kurt) * (normInv(1 - alpha) / (sr - srStar)) ** 2;
}

/** Expected maximum Sharpe ratio across nTrials independent unskilled trials with Sharpe variance varSr. */
export function expectedMaxSr(varSr: number, nTrials: number): number {
  return Math.sqrt(varSr) * ((1 - EULER_GAMMA) * normInv(1 - 1 / nTrials) + EULER_GAMMA * normInv(1 - 1 / (nTrials * Math.E)));
}

export type GateStatus = "PASS" | "REJECT" | "NOT_COMPUTABLE";
export interface Gate {
  gate: string;
  threshold: string;
  value: string;
  status: GateStatus;
  reason?: string;
}

export const PSR_CAP = 0.95;
export const DATA_FLOOR = 1000;
export const CLT_MIN = 30;

export interface TrialRegistry {
  /** honest count of registered strategy variants (≥1: the live configuration itself) */
  nTrials: number;
  /** variance of the per-trial Sharpe ratios, needed for DSR when nTrials > 1 */
  srVariance?: number | null;
}

export function validateTrackRecord(dailyNet: number[], registry: TrialRegistry = { nTrials: 1 }) {
  const m = moments(dailyNet);
  const n = dailyNet.length;
  const fmt = (v: number | null | undefined, d = 3) => (v == null || !Number.isFinite(v) ? (v === Infinity ? "+∞" : "NULL") : v.toFixed(d));
  const sr = m && m.sd > 0 ? m.mean / m.sd : null;
  const small = n < CLT_MIN;
  const psrRaw = !small && sr != null && m ? psr(sr, n, m.skew, m.kurtosis) : null;
  const psrValue = psrRaw == null ? null : Math.min(psrRaw, PSR_CAP);
  const mintrl = !small && sr != null && m ? minTrl(sr, m.skew, m.kurtosis) : Infinity;
  let dsr: number | null = null;
  if (!small && sr != null && m && registry.nTrials > 1 && registry.srVariance != null && registry.srVariance > 0) {
    dsr = psr(sr, n, m.skew, m.kurtosis, expectedMaxSr(registry.srVariance, registry.nTrials));
  }
  const gates: Gate[] = [
    { gate: "Trial registry", threshold: "every variant logged", value: `${registry.nTrials} trial(s)`, status: registry.nTrials >= 1 ? "PASS" : "REJECT" },
    { gate: "Data floor", threshold: `N ≥ ${DATA_FLOOR} daily obs`, value: `N = ${n}`, status: n >= DATA_FLOOR ? "PASS" : "REJECT", reason: n >= DATA_FLOOR ? undefined : "insufficient_data" },
    {
      gate: "PSR (SR* = 0)",
      threshold: `≥ ${PSR_CAP} (capped)`,
      value: fmt(psrValue),
      status: psrValue == null ? "NOT_COMPUTABLE" : psrValue >= PSR_CAP ? "PASS" : "REJECT",
      reason: small ? `N < ${CLT_MIN}` : sr == null ? "zero variance / no data" : undefined,
    },
    {
      gate: "DSR",
      threshold: "≥ 0.95",
      value: fmt(dsr),
      status: dsr == null ? "NOT_COMPUTABLE" : dsr >= 0.95 ? "PASS" : "REJECT",
      reason: dsr == null ? (small ? `N < ${CLT_MIN}` : "needs > 1 registered trial with Sharpe variance") : undefined,
    },
    { gate: "PBO (CSCV)", threshold: "≤ 0.05", value: "NULL", status: "NOT_COMPUTABLE", reason: small ? `N < ${CLT_MIN}` : "needs a T × N matrix of variant returns; a single live record has none" },
    {
      gate: "MinTRL (95%)",
      threshold: "N ≥ MinTRL",
      value: fmt(mintrl, 1),
      status: small ? "NOT_COMPUTABLE" : n >= mintrl ? "PASS" : "REJECT",
      reason: small ? `N < ${CLT_MIN}` : n >= mintrl ? undefined : "track_record_too_short",
    },
    {
      gate: "Harvey-Liu haircut",
      threshold: "haircut SR > 0",
      value: "NULL",
      status: "NOT_COMPUTABLE",
      reason: registry.nTrials > 1 ? "needs per-trial p-values" : "1 registered trial: no multiple-testing adjustment applies",
    },
  ];
  const firstReject = gates.find((g) => g.status === "REJECT");
  return {
    n,
    moments: m,
    sharpeDaily: sr,
    psr: psrValue,
    psrUncapped: psrRaw,
    dsr,
    pbo: null as number | null,
    minTrl: mintrl,
    haircutSharpe: null as number | null,
    gates,
    gateStatus: firstReject ? `REJECT_${firstReject.gate.split(" ")[0].toUpperCase()}` : gates.every((g) => g.status === "PASS") ? "PASS" : "INCOMPLETE",
    label: small ? "statistically_indistinguishable_from_noise" : gates.every((g) => g.status === "PASS") ? "verified_structural_soundness" : "not_validated",
  };
}
