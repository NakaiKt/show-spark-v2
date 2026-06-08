import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  transpilePackages: [
    "@repo/application",
    "@repo/db",
    "@repo/shared",
  ],
};

export default nextConfig;
