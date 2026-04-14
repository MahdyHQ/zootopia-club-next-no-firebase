import { APP_ROUTES } from "@zootopia/shared-config";

import { normalizeAuthFailure } from "@/lib/auth-failure";
import { apiError, apiSuccess, applyNoStore } from "@/lib/server/api";
import { isAllowlistedAdminEmail } from "@/lib/server/admin-auth";
import { checkRequestRateLimit } from "@/lib/server/request-rate-limit";
import { getServerRuntimeOrigin } from "@/lib/server/runtime-base-url";
import {
  getSupabaseAdminClient,
  hasSupabaseAdminRuntime,
} from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const PASSWORD_FORGOT_ACCOUNT_MAX_REQUESTS = 5;
const PASSWORD_FORGOT_IP_MAX_REQUESTS = 20;
const PASSWORD_FORGOT_WINDOW_MS = 15 * 60 * 1000;

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function withRateLimitHeaders<T extends Response>(response: T, resetAtMs: number) {
  response.headers.set("X-RateLimit-Reset", String(Math.ceil(resetAtMs / 1000)));
  return response;
}

function buildPasswordResetRedirectUrl() {
  // Keep callback origin server-authoritative so request host headers never control reset redirects.
  return new URL(APP_ROUTES.resetPassword, getServerRuntimeOrigin()).toString();
}

export async function POST(request: Request) {
  if (!hasSupabaseAdminRuntime()) {
    return applyNoStore(
      apiError(
        "PASSWORD_RESET_UNAVAILABLE",
        "Password reset is not available in this environment right now.",
        503,
      ),
    );
  }

  let body: { email?: unknown };

  try {
    body = (await request.json()) as { email?: unknown };
  } catch {
    return applyNoStore(
      apiError("INVALID_JSON", "Request body must be valid JSON.", 400),
    );
  }

  const email = normalizeEmail(body.email);
  if (!email) {
    return applyNoStore(
      apiError(
        "PASSWORD_RESET_EMAIL_REQUIRED",
        "Account email is required.",
        400,
      ),
    );
  }

  if (!isValidEmail(email)) {
    return applyNoStore(
      apiError(
        "PASSWORD_RESET_EMAIL_INVALID",
        "A valid account email is required.",
        400,
      ),
    );
  }

  const accountRateLimit = checkRequestRateLimit({
    request,
    scope: "auth-password-forgot-account",
    subject: email,
    maxRequests: PASSWORD_FORGOT_ACCOUNT_MAX_REQUESTS,
    windowMs: PASSWORD_FORGOT_WINDOW_MS,
  });

  if (!accountRateLimit.allowed) {
    const blocked = applyNoStore(
      apiError(
        "PASSWORD_RESET_RATE_LIMITED_ACCOUNT",
        "Too many password reset requests. Please retry shortly.",
        429,
      ),
    );
    blocked.headers.set("Retry-After", String(accountRateLimit.retryAfterSeconds));
    return withRateLimitHeaders(blocked, accountRateLimit.resetAtMs);
  }

  const ipRateLimit = checkRequestRateLimit({
    request,
    scope: "auth-password-forgot-ip",
    maxRequests: PASSWORD_FORGOT_IP_MAX_REQUESTS,
    windowMs: PASSWORD_FORGOT_WINDOW_MS,
  });

  if (!ipRateLimit.allowed) {
    const blocked = applyNoStore(
      apiError(
        "PASSWORD_RESET_RATE_LIMITED_IP",
        "Too many password reset requests. Please retry shortly.",
        429,
      ),
    );
    blocked.headers.set("Retry-After", String(ipRateLimit.retryAfterSeconds));
    return withRateLimitHeaders(blocked, ipRateLimit.resetAtMs);
  }

  // Admin identities remain on their own auth lane; this user route intentionally no-ops for admin emails.
  if (isAllowlistedAdminEmail(email)) {
    return applyNoStore(apiSuccess({ accepted: true }));
  }

  const redirectTo = buildPasswordResetRedirectUrl();
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });

  if (error) {
    const failure = normalizeAuthFailure({
      error,
      flow: "user",
      stage: "AUTH_STAGE_C_PROVIDER_RESPONSE",
      routePath: APP_ROUTES.forgotPassword,
      sessionCreationAttempted: false,
    });

    if (failure.normalizedCode === "AUTH_RATE_LIMITED") {
      return applyNoStore(
        apiError(
          "PASSWORD_RESET_RATE_LIMITED",
          "Too many password reset requests. Please retry shortly.",
          429,
        ),
      );
    }

    if (failure.normalizedCode === "AUTH_NETWORK_FAILURE") {
      return applyNoStore(
        apiError(
          "PASSWORD_RESET_PROVIDER_NETWORK_FAILURE",
          "Password reset email could not be requested due to an upstream network issue.",
          502,
        ),
      );
    }

    if (
      failure.normalizedCode === "AUTH_ENV_MISCONFIGURED"
      || failure.normalizedCode === "AUTH_PROVIDER_MISCONFIGURED"
    ) {
      return applyNoStore(
        apiError(
          "PASSWORD_RESET_UNAVAILABLE",
          "Password reset is not available in this environment right now.",
          503,
        ),
      );
    }

    return applyNoStore(
      apiError(
        "PASSWORD_RESET_PROVIDER_REJECTED",
        "Password reset email could not be requested right now.",
        502,
      ),
    );
  }

  // Return the same accepted response regardless of account existence to avoid email-enumeration leakage.
  return applyNoStore(apiSuccess({ accepted: true }));
}
