import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";
import { cpus } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const nextAppRoot = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(nextAppRoot, "../..");
const buildCpuCount = Math.max(1, cpus().length);

// Keep the monorepo root .env.local as the canonical env source for both
// workspace scripts and the live Next.js app under apps/web.
loadEnvConfig(workspaceRoot, process.env.NODE_ENV !== "production", console, true);

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: workspaceRoot,
  outputFileTracingIncludes: {
    // Only the explicit Pro PDF lane needs the packaged Chromium payload at runtime.
    // Keep the trace pinned to that route boundary so the Fast browser-print lane remains a
    // lightweight HTML surface while the premium lane keeps its bundled PDF browser binary.
    "/api/assessment/export/pdf/pro/\\[id\\]": [
      "./node_modules/@sparticuz/chromium/bin/**/*",
    ],
  },
  // Local development sometimes reaches the dev server through 127.0.0.1 even when
  // Next booted on localhost. Keep this explicit allowlist narrow so HMR works there
  // without broadly relaxing the dev-only origin protection.
  allowedDevOrigins: ["127.0.0.1"],
  experimental: {
    externalDir: true,
    // Keep build parallelism explicit on high-core servers.
    cpus: buildCpuCount,
    workerThreads: true,
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
