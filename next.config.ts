import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  // GitHub Pages project subpath
  basePath: "/anomaly-tracker",
  assetPrefix: "/anomaly-tracker/",
  trailingSlash: true,
  images: { unoptimized: true }, // no Node server on Pages
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  env: {
    NEXT_PUBLIC_BASE_PATH: "/anomaly-tracker",
    NEXT_PUBLIC_STATIC_SITE: "1",
  },
  experimental: {
    // TypeScript 7.0.2 has no compiler API; Next typechecks via `tsc`.
    useTypeScriptCli: true,
  },
};

export default nextConfig;
