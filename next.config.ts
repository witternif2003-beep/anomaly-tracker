import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  trailingSlash: true,
  images: { unoptimized: true },
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  env: {
    NEXT_PUBLIC_STATIC_SITE: "1",
  },
  experimental: {
    // TypeScript 7.0.2 has no compiler API; Next typechecks via `tsc`.
    useTypeScriptCli: true,
  },
};

export default nextConfig;
