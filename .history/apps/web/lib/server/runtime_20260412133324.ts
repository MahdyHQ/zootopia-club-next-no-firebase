import "server-only";

import { hasConfiguredAdminAllowlist } from "@/lib/server/admin-auth";
import { getZootopiaPersistenceRuntimeState } from "@/lib/server/zootopia-postgres-adapter";

function hasAuthSecretRuntime() {
  return Boolean(process.env.AUTH_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim());
}

export function hasGoogleAiRuntime() {
  return Boolean(process.env.GOOGLE_AI_API_KEY);
}

function hasQwenBaseUrlRuntime() {
  return Boolean(
    process.env.DASHSCOPE_BASE_URL?.trim() ||
      process.env.DASHSCOPE_COMPATIBLE_BASE_URL?.trim() ||
      process.env.ALIBABA_MODEL_STUDIO_BASE_URL?.trim(),
  );
}

export function hasQwenRuntime() {
  return Boolean(process.env.DASHSCOPE_API_KEY?.trim()) && hasQwenBaseUrlRuntime();
}

export function getRuntimeFlags() {
  const persistenceRuntime = getZootopiaPersistenceRuntimeState();
  // Production auth surfaces should fail closed when durable persistence is required but unavailable.
  const authPersistenceReady =
    persistenceRuntime.usingPostgres || !persistenceRuntime.requiresDurablePersistence;

  const supabaseAuthReady =
    hasAuthSecretRuntime() &&
    persistenceRuntime.hasSupabaseAdminRuntime &&
    hasConfiguredAdminAllowlist() &&
    authPersistenceReady;

  return {
    // Canonical auth-runtime flag for all UI status surfaces and auth panels.
    supabaseAuth: supabaseAuthReady,
    // Admin login uses the same readiness gates as regular Supabase auth.
    // Additional security checks (allowlist, claims, request recency) are enforced server-side.
    adminSupabaseAuth: supabaseAuthReady,
    googleAi: hasGoogleAiRuntime(),
    qwen: hasQwenRuntime(),
  };
}
