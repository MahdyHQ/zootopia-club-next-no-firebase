import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const nextAppRoot = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(nextAppRoot, "../..");

type AppHostingFirebaseWebConfig = {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
};

function readAppHostingFirebaseWebConfig() {
  const rawConfig = process.env.FIREBASE_WEBAPP_CONFIG;
  if (!rawConfig) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawConfig) as AppHostingFirebaseWebConfig;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function backfillPublicFirebaseEnvFromAppHosting() {
  const appHostingConfig = readAppHostingFirebaseWebConfig();
  if (!appHostingConfig) {
    return;
  }

  // Firebase App Hosting exposes FIREBASE_WEBAPP_CONFIG at build time.
  // Mirror it into the existing NEXT_PUBLIC_* contract so client auth
  // keeps working without duplicating public config in apphosting.yaml.
  const mappings = [
    ["NEXT_PUBLIC_FIREBASE_API_KEY", appHostingConfig.apiKey],
    ["NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", appHostingConfig.authDomain],
    ["NEXT_PUBLIC_FIREBASE_PROJECT_ID", appHostingConfig.projectId],
    ["NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", appHostingConfig.storageBucket],
    [
      "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
      appHostingConfig.messagingSenderId,
    ],
    ["NEXT_PUBLIC_FIREBASE_APP_ID", appHostingConfig.appId],
  ] as const;

  for (const [envKey, value] of mappings) {
    if (process.env[envKey]) {
      continue;
    }

    const trimmed = typeof value === "string" ? value.trim() : "";
    if (trimmed) {
      process.env[envKey] = trimmed;
    }
  }
}

// Keep the monorepo root .env.local as the canonical env source for both
// Firebase scripts and the live Next.js app under apps/web.
loadEnvConfig(workspaceRoot, process.env.NODE_ENV !== "production", console, true);
backfillPublicFirebaseEnvFromAppHosting();

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
