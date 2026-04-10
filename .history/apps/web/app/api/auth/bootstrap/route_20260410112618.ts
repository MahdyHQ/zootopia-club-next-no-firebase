import { ENV_KEYS } from "@zootopia/shared-config";

import { getAuthenticatedUserRedirectPath } from "@/lib/return-to";
import { apiError, apiSuccess, applyNoStore } from "@/lib/server/api";
import {
  getDecodedSignInProvider,
  hasRecentSignIn,
  hasConfiguredAdminAllowlist,
  isAllowlistedAdminEmail,
} from "@/lib/server/admin-auth";
import { getServerAuthAdmin } from "@/lib/server/server-auth";
import {
  appendAdminLog,
  getRoleFromAuthClaims,
  upsertUserFromAuth,
} from "@/lib/server/repository";
import { checkRequestRateLimit } from "@/lib/server/request-rate-limit";
import { getSessionTtlSeconds } from "@/lib/server/session-config";
import { hasSupabaseAdminRuntime } from "@/lib/server/supabase-admin";
import { getSessionCookieOptions } from "@/lib/preferences";

export const runtime = "nodejs";

const USER_BOOTSTRAP_RATE_LIMIT_MAX_REQUESTS = 20;
const USER_BOOTSTRAP_RATE_LIMIT_WINDOW_MS = 60 * 1000;

const AUTH_TOKEN_ERROR_CODES = new Set([
  "auth/id-token-expired",
  "auth/id-token-revoked",
  "auth/invalid-id-token",
  "auth/argument-error",
  "auth/invalid-argument",
  "auth/user-disabled",
  "auth/user-not-found",
]);

function getAuthAdapterErrorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    return String((error as { code: unknown }).code ?? "");
  }
  return "";
}

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
      "Secure sign-in is temporarily unavailable. Please try again shortly.",
      503,
    ));
  }

  /* This guard applies only to the regular user login session bootstrap surface
     (/api/auth/bootstrap). It reduces token replay/brute-force pressure at session-creation
     time while preserving the existing server-authoritative session model and admin split. */
  const rateLimit = checkRequestRateLimit({
    request,
    scope: "user-auth-bootstrap",
    maxRequests: USER_BOOTSTRAP_RATE_LIMIT_MAX_REQUESTS,
    windowMs: USER_BOOTSTRAP_RATE_LIMIT_WINDOW_MS,
  });
  if (!rateLimit.allowed) {
    const blocked = applyNoStore(apiError(
      "AUTH_RATE_LIMITED",
      "Too many user session attempts. Please retry shortly.",
      429,
    ));
    blocked.headers.set("Retry-After", String(rateLimit.retryAfterSeconds));
    blocked.headers.set(
      "X-RateLimit-Reset",
      String(Math.ceil(rateLimit.resetAtMs / 1000)),
    );
    return blocked;
  }

  let body: { idToken?: string };

  try {
    body = (await request.json()) as { idToken?: string };
  } catch {
    return applyNoStore(apiError("INVALID_JSON", "Request body must be valid JSON.", 400));
  }

  const idToken = String(body.idToken || "").trim();
  if (!idToken) {
    return applyNoStore(apiError("ID_TOKEN_REQUIRED", "A Supabase access token is required.", 400));
  }

  const sessionTtlSeconds = getSessionTtlSeconds();

  let decodedToken: Awaited<ReturnType<ReturnType<typeof getServerAuthAdmin>["verifyIdToken"]>>;

  try {
    const auth = getServerAuthAdmin();
    decodedToken = await auth.verifyIdToken(idToken);
  } catch (verifyError) {
    const code = getAuthAdapterErrorCode(verifyError);

    if (code === "auth/id-token-revoked") {
      return applyNoStore(apiError(
        "ID_TOKEN_REVOKED",
        "This session token has been revoked. Please sign in again.",
        401,
      ));
    }

    if (code === "auth/user-disabled") {
      return applyNoStore(apiError(
        "USER_SUSPENDED",
        "This account is suspended and cannot start a session.",
        403,
      ));
    }

    if (AUTH_TOKEN_ERROR_CODES.has(code)) {
      return applyNoStore(apiError(
        "ID_TOKEN_INVALID",
        "The provided ID token is invalid or has expired.",
        401,
      ));
    }

    return applyNoStore(apiError(
      "BOOTSTRAP_FAILED",
      "Unable to verify the session token. Please try again.",
      503,
    ));
  }

  try {
    const auth = getServerAuthAdmin();
    const tokenClaims = decodedToken as Record<string, unknown>;

    if (!hasRecentSignIn(decodedToken)) {
      return applyNoStore(apiError(
        "RECENT_SIGN_IN_REQUIRED",
        "Please complete a fresh sign-in before creating a session.",
        401,
      ));
    }

    if (isAllowlistedAdminEmail(decodedToken.email ?? null)) {
      return applyNoStore(apiError(
        "ADMIN_LOGIN_REQUIRED",
        "Admin accounts must use the dedicated admin login page.",
        403,
      ));
    }

    const signInProvider = getDecodedSignInProvider(decodedToken);
    if (signInProvider !== "password") {
      return applyNoStore(apiError(
        "EMAIL_PASSWORD_REQUIRED",
        "Use an email/password sign-in flow from the regular user login page.",
        403,
      ));
    }

    const user = await upsertUserFromAuth({
      uid: decodedToken.uid,
      email: decodedToken.email ?? null,
      displayName: typeof decodedToken.name === "string" ? decodedToken.name : null,
      photoURL:
        typeof decodedToken.picture === "string" ? decodedToken.picture : null,
      role: getRoleFromAuthClaims({
        email: decodedToken.email ?? null,
        admin: tokenClaims.admin,
      }),
    });

    if (user.status !== "active") {
      const denied = applyNoStore(apiError(
        "USER_SUSPENDED",
        "This account is suspended and cannot start a session.",
        403,
      ));
      denied.cookies.set(ENV_KEYS.sessionCookie, "", getSessionCookieOptions(0));
      return denied;
    }

    const sessionCookie = await auth.createSessionCookie(idToken, {
      expiresIn: sessionTtlSeconds * 1000,
    });

    const response = applyNoStore(apiSuccess({
      user: {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        fullName: user.fullName,
        universityCode: user.universityCode,
        phoneNumber: user.phoneNumber,
        phoneCountryIso2: user.phoneCountryIso2 ?? null,
        phoneCountryCallingCode: user.phoneCountryCallingCode ?? null,
        nationality: user.nationality,
        profileCompleted: user.profileCompleted,
        profileCompletedAt: user.profileCompletedAt,
        role: user.role,
        status: user.status,
      },
      redirectTo: getAuthenticatedUserRedirectPath(user),
    }));
    response.cookies.set(
      ENV_KEYS.sessionCookie,
      sessionCookie,
      getSessionCookieOptions(sessionTtlSeconds),
    );
    await appendAdminLog({
      actorUid: user.uid,
      actorRole: user.role,
      ownerUid: user.uid,
      ownerRole: user.role,
      action: "user-session-created",
      resourceType: "session",
      resourceId: user.uid,
      route: "/api/auth/bootstrap",
      metadata: {
        redirectTo: getAuthenticatedUserRedirectPath(user),
        sessionTtlSeconds,
      },
    });
    return response;
  } catch {
    return applyNoStore(apiError("BOOTSTRAP_FAILED", "Unable to create a secure session.", 503));
  }
}
