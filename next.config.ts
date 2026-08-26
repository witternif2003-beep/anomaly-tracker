import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  experimental: {
    // TypeScript 7.0.2 has no compiler API; Next typechecks via `tsc`.
    useTypeScriptCli: true,
  },
};

export default nextConfig;
