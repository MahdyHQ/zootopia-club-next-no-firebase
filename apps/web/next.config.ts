import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const nextAppRoot = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(nextAppRoot, "../..");

// Keep the monorepo root .env.local as the canonical env source for both
// Firebase scripts and the live Next.js app under apps/web.
loadEnvConfig(workspaceRoot, process.env.NODE_ENV !== "production", console, true);

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: workspaceRoot,
  experimental: {
    externalDir: true,
  },
  turbopack: {
    root: workspaceRoot,
  },
  transpilePackages: [
    "@zootopia/shared-config",
    "@zootopia/shared-types",
    "@zootopia/shared-utils",
  ],
};

export default nextConfig;
