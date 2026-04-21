import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";
import { cpus } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const nextAppRoot = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(nextAppRoot, "../..");
/* Next build page-data workers can spike native memory on local and Vercel-like
   constrained builders. Keep worker parallelism capped by default, while allowing
   deliberate overrides through ZOOTOPIA_NEXT_BUILD_CPUS when a larger builder proves safe. */
const detectedBuildCpuCount = Math.max(1, cpus().length);
const defaultBuildCpuCount = Math.min(4, detectedBuildCpuCount);

function readBuildCpuCount() {
  const rawValue = process.env.ZOOTOPIA_NEXT_BUILD_CPUS?.trim();
  if (!rawValue) {
    return defaultBuildCpuCount;
  }

  const parsedValue = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsedValue) || parsedValue < 1) {
    return defaultBuildCpuCount;
  }

  return Math.max(1, Math.min(detectedBuildCpuCount, parsedValue));
}

const buildCpuCount = readBuildCpuCount();

function parseServerActionOriginHost(rawValue: string | undefined) {
  const normalizedValue = rawValue?.trim();
  if (!normalizedValue) {
    return null;
  }

  const candidate = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(normalizedValue)
    ? normalizedValue
    : `https://${normalizedValue}`;

  try {
    return new URL(candidate).host.toLowerCase();
  } catch {
    return null;
  }
}

function collectServerActionAllowedOrigins() {
  const allowedHosts = new Set<string>([
    "localhost",
    "127.0.0.1",
    "localhost:3000",
    "127.0.0.1:3000",
    "localhost:3020",
    "127.0.0.1:3020",
    "localhost:3025",
    "127.0.0.1:3025",
  ]);

  const envCandidates = [
    process.env.NEXT_PUBLIC_BASE_URL,
    process.env.NEXTAUTH_URL,
    process.env.VERCEL_URL,
  ];

  for (const envCandidate of envCandidates) {
    const parsedHost = parseServerActionOriginHost(envCandidate);
    if (parsedHost) {
      allowedHosts.add(parsedHost);
    }
  }

  return [...allowedHosts];
}

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
      /* npm workspaces hoist Chromium into the monorepo root in this repo, while
         outputFileTracingIncludes paths stay relative to `apps/web`. Keep both
         candidate paths traced so the deployed Vercel lambda always receives the
         packaged browser payload instead of depending on a non-existent nested install. */
      "../../node_modules/@sparticuz/chromium/bin/**/*",
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
    /* Contact-page attachments are capped at 50 MB of actual file bytes, but multipart
       framing adds overhead above the raw file total. Keep proxy buffering above the
       product limit so a valid 50 MB contact email payload is not truncated before the
       route handler can enforce the real server-side attachment contract. */
    proxyClientMaxBodySize: "60mb",
    workerThreads: true,
    /* Server Actions reject POSTs when Origin and Host do not match. This app can be
       reached through canonical env domains and localhost/127.0.0.1 variants during
       local QA and proxy paths, so keep this allowlist explicit and server-derived. */
    serverActions: {
      allowedOrigins: collectServerActionAllowedOrigins(),
    },
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
