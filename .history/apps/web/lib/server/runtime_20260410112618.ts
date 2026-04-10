import "server-only";

import { hasConfiguredAdminAllowlist } from "@/lib/server/admin-auth";
import { hasSupabaseAdminRuntime } from "@/lib/server/supabase-admin";

export function hasGoogleAiRuntime() {
  return Boolean(process.env.GOOGLE_AI_API_KEY);
}

export function hasQwenRuntime() {
  return Boolean(process.env.DASHSCOPE_API_KEY);
}

export function getRuntimeFlags() {
  const supabaseAuthReady = hasSupabaseAdminRuntime() && hasConfiguredAdminAllowlist();

  return {
    // Canonical auth-runtime flag for all UI status surfaces and auth panels.
    supabaseAuth: supabaseAuthReady,
    googleAi: hasGoogleAiRuntime(),
    qwen: hasQwenRuntime(),
  };
}
