import type { AdminIdentifierResolution } from "@zootopia/shared-types";

import { apiError, apiSuccess, applyNoStore } from "@/lib/server/api";
import {
  hasConfiguredAdminLoginPasswordGate,
  hasConfiguredAdminAllowlist,
  resolveAdminIdentifier,
} from "@/lib/server/admin-auth";
import { checkRequestRateLimit } from "@/lib/server/request-rate-limit";
import { hasSupabaseAdminRuntime } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";

const ADMIN_IDENTIFIER_RATE_LIMIT_MAX_REQUESTS = 20;
const ADMIN_IDENTIFIER_RATE_LIMIT_WINDOW_MS = 60 * 1000;

export async function POST(request: Request) {
  if (!hasSupabaseAdminRuntime()) {
    return applyNoStore(apiError(
      "SUPABASE_ADMIN_UNAVAILABLE",
      "Supabase auth runtime is not configured yet.",
      503,
    ));
  }

  if (!hasConfiguredAdminAllowlist()) {
    return applyNoStore(apiError(
      "ADMIN_ALLOWLIST_UNCONFIGURED",
      "Admin access is temporarily unavailable because the allowlist is not configured.",
      503,
    ));
  }

  if (!hasConfiguredAdminLoginPasswordGate()) {
    return applyNoStore(apiError(
      "ADMIN_LOGIN_PASSWORD_UNCONFIGURED",
      "Admin access is temporarily unavailable because the runtime admin password gate is not configured.",
      503,
    ));
  }

  /* Identifier resolution is intentionally server-throttled to reduce account-enumeration
     and scripted probing pressure against admin sign-in discovery surfaces. */
  const rateLimit = checkRequestRateLimit({
    request,
    scope: "admin-auth-resolve-identifier",
    maxRequests: ADMIN_IDENTIFIER_RATE_LIMIT_MAX_REQUESTS,
    windowMs: ADMIN_IDENTIFIER_RATE_LIMIT_WINDOW_MS,
  });
  if (!rateLimit.allowed) {
    const blocked = applyNoStore(apiError(
      "AUTH_RATE_LIMITED",
      "Too many admin identifier requests. Please retry shortly.",
      429,
    ));
    blocked.headers.set("Retry-After", String(rateLimit.retryAfterSeconds));
    blocked.headers.set(
      "X-RateLimit-Reset",
      String(Math.ceil(rateLimit.resetAtMs / 1000)),
    );
    return blocked;
  }

  let body: { identifier?: string };

  try {
    body = (await request.json()) as { identifier?: string };
  } catch {
    return applyNoStore(apiError("INVALID_JSON", "Request body must be valid JSON.", 400));
  }

  const resolution = resolveAdminIdentifier(String(body.identifier || ""));
  if (!resolution.ok) {
    return applyNoStore(apiError(resolution.code, resolution.message, resolution.status));
  }

  const payload: AdminIdentifierResolution = resolution.value;
  return applyNoStore(apiSuccess(payload));
}
