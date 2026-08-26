/** Base path + static JSON helpers for GitHub Pages (`output: 'export'`). */

function runtimeBasePath(): string {
  const fromEnv = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (typeof window !== "undefined") {
    // Derive from the project Pages subpath when env was stripped.
    const match = window.location.pathname.match(/^(\/[^/]+)/);
    if (match && match[1] !== "/tracker" && match[1] !== "/corporate" && match[1] !== "/inventory" && match[1] !== "/aip") {
      return match[1];
    }
  }
  return "";
}

export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function withBasePath(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const base = runtimeBasePath();
  if (!base) return normalized;
  if (normalized.startsWith(`${base}/`) || normalized === base) return normalized;
  return `${base}${normalized}`;
}

function looksLikeJson(response: Response): boolean {
  const type = response.headers.get("content-type") ?? "";
  return type.includes("application/json") || type.includes("+json");
}

/**
 * Prefer prebuilt `/static/*.json` on GitHub Pages (no Node server).
 * Live `/api/*` is only used when it actually returns JSON.
 */
export async function fetchJsonWithStaticFallback<T>(
  apiPath: string,
  staticPath: string,
  opts?: { preferStatic?: boolean },
): Promise<{ data: T; source: "api" | "static" }> {
  const preferStatic =
    opts?.preferStatic ??
    (process.env.NEXT_PUBLIC_STATIC_SITE === "1" ||
      (typeof window !== "undefined" && window.location.hostname.endsWith("github.io")));

  const loadStatic = async (): Promise<{ data: T; source: "static" }> => {
    const staticUrl = withBasePath(staticPath);
    const response = await fetch(staticUrl, { cache: "no-store" });
    if (!response.ok || !looksLikeJson(response)) {
      throw new Error(`Failed to load ${staticUrl} (${response.status})`);
    }
    return { data: (await response.json()) as T, source: "static" };
  };

  if (preferStatic) {
    try {
      return await loadStatic();
    } catch {
      // fall through to api for local hybrid setups
    }
  }

  const apiUrl = withBasePath(apiPath);
  try {
    const response = await fetch(apiUrl, { cache: "no-store" });
    if (response.ok && looksLikeJson(response)) {
      return { data: (await response.json()) as T, source: "api" };
    }
  } catch {
    // fall through
  }

  return loadStatic();
}
