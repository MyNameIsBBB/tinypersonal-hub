import type { NextConfig } from "next";

const buildVersion = process.env.APP_VERSION
  ?? `dev-${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 12)}`;

const nextConfig: NextConfig = {
  transpilePackages: ["@tinypersonal/assistant-core", "@tinypersonal/backend-api"],
  env: { NEXT_PUBLIC_APP_VERSION: buildVersion },
};

export default nextConfig;
