import { hasDb } from "./db";

/** Runs a server-side read; turns failures into a displayable message instead of a crashed page. */
export async function safe<T>(fn: () => Promise<T>): Promise<{ data: T | null; error: string | null }> {
  if (!hasDb()) return { data: null, error: "Database is not configured for this deployment." };
  try {
    return { data: await fn(), error: null };
  } catch (e) {
    console.error("[page] read failed:", e instanceof Error ? e.message : e);
    return { data: null, error: e instanceof Error ? e.message : "read failed" };
  }
}

export const fmtTs = (v: string | Date | null | undefined) => (v ? new Date(v).toISOString().replace("T", " ").slice(0, 19) + "Z" : "—");
export const num = (v: unknown, digits = 0) => (v === null || v === undefined || v === "" ? "—" : Number(v).toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits }));
