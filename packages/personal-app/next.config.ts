import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@tinypersonal/assistant-core", "@tinypersonal/backend-api"],
};

export default nextConfig;
