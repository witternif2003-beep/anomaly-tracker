"use client";
import { useCallback, useEffect, useState } from "react";

export async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) }, cache: "no-store" });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}

export function useApi<T>(url: string | null) {
  const [state, setState] = useState<{ url: string | null; data: T | null; error: string | null }>({ url: null, data: null, error: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!url) return;
    let live = true;
    api<T>(url)
      .then((data) => live && setState({ url, data, error: null }))
      .catch((e: Error) => live && setState((s) => ({ url, data: s.url === url ? s.data : null, error: e.message })));
    return () => {
      live = false;
    };
  }, [url, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const fresh = state.url === url;
  return { data: fresh ? state.data : null, error: fresh ? state.error : null, loading: !!url && !fresh, reload };
}

export const usd = (cents: number | string | null | undefined) =>
  cents == null || cents === "" ? "—" : `$${(Number(cents) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const short = (a?: string | null) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");

export const when = (t?: string | Date | null) => {
  if (!t) return "—";
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return String(t);
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  const rel = s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : s < 86400 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86400)}d`;
  return `${d.toISOString().replace("T", " ").slice(0, 19)}Z (${rel} ago)`;
};
