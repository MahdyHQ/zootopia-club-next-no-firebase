import "server-only";

import {
  hasConfiguredAdminAllowlist,
  hasConfiguredAdminLoginPasswordGate,
} from "@/lib/server/admin-auth";
import { hasSupabaseAdminRuntime } from "@/lib/server/supabase-admin";

export function hasGoogleAiRuntime() {
  return Boolean(process.env.GOOGLE_AI_API_KEY);
}

export function hasQwenRuntime() {
  return Boolean(process.env.DASHSCOPE_API_KEY);
}

export function getRuntimeFlags() {
  const supabaseAuthReady = hasSupabaseAdminRuntime() && hasConfiguredAdminAllowlist();
  const adminSupabaseAuthReady = supabaseAuthReady && hasConfiguredAdminLoginPasswordGate();

  return {
    // Canonical auth-runtime flag for all UI status surfaces and auth panels.
    supabaseAuth: supabaseAuthReady,
    // Admin login requires an additional server-only password gate on top of Supabase auth runtime.
    adminSupabaseAuth: adminSupabaseAuthReady,
    googleAi: hasGoogleAiRuntime(),
    qwen: hasQwenRuntime(),
  };
}
