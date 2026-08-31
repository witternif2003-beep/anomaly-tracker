/** Base path + static JSON helpers. `NEXT_PUBLIC_BASE_PATH` is only set for subpath hosts. */

export const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");

export function withBasePath(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const base = BASE_PATH;
  if (!base) return normalized;
  if (normalized.startsWith(`${base}/`) || normalized === base) return normalized;
  return `${base}${normalized}`;
}

function looksLikeJson(response: Response): boolean {
  const type = (response.headers.get("content-type") ?? "").trim();
  // GitHub Pages often omits Content-Type for static JSON — treat empty as OK.
  if (!type) return true;
  return type.includes("application/json") || type.includes("+json") || type.includes("json");
}

/**
 * Uses live `/api/*` when it returns JSON and prebuilt `/static/*.json` otherwise
 * (static hosts have no Node server). `NEXT_PUBLIC_STATIC_SITE=1` inverts the order.
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
    const staticUrl = `${withBasePath(staticPath)}${staticPath.includes("?") ? "&" : "?"}v=${Date.now()}`;
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
