/** Base path + static JSON helpers for GitHub Pages (`output: 'export'`). */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function withBasePath(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (!BASE_PATH) return normalized;
  return `${BASE_PATH}${normalized}`;
}

/**
 * Prefer live `/api/...` when available; fall back to prebuilt `/static/...json`
 * so GitHub Pages (no server) still loads tracker/corporate/notebook data.
 */
export async function fetchJsonWithStaticFallback<T>(
  apiPath: string,
  staticPath: string,
): Promise<{ data: T; source: "api" | "static" }> {
  const apiUrl = withBasePath(apiPath);
  try {
    const response = await fetch(apiUrl);
    if (response.ok) {
      return { data: (await response.json()) as T, source: "api" };
    }
  } catch {
    // fall through to static
  }
  const staticUrl = withBasePath(staticPath);
  const response = await fetch(staticUrl);
  if (!response.ok) {
    throw new Error(`Failed to load ${staticUrl} (${response.status})`);
  }
  return { data: (await response.json()) as T, source: "static" };
}
