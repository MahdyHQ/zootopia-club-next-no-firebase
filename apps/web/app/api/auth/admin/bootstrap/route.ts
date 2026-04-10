import { ENV_KEYS } from "@zootopia/shared-config";

import { getAuthenticatedUserRedirectPath } from "@/lib/return-to";
import { apiError, apiSuccess } from "@/lib/server/api";
import {
  getDecodedSignInProvider,
  hasRecentSignIn,
  isAllowlistedAdminEmail,
  verifyAdminClaimActivation,
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

const ADMIN_BOOTSTRAP_RATE_LIMIT_MAX_REQUESTS = 10;
const ADMIN_BOOTSTRAP_RATE_LIMIT_WINDOW_MS = 60 * 1000;

/* Auth adapter error codes that indicate a bad or expired token rather
   than an infrastructure failure. These are expected failure modes and should
   return 401 without leaking internal stack traces. */
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
    return apiError(
      "SUPABASE_ADMIN_UNAVAILABLE",
      "Supabase auth runtime is not configured yet.",
      503,
    );
  }

  /* Session bootstrap is the highest-risk admin auth edge, so this server-side throttle
     limits brute-force token replay pressure without altering session authority semantics. */
  const rateLimit = checkRequestRateLimit({
    request,
    scope: "admin-auth-bootstrap",
    maxRequests: ADMIN_BOOTSTRAP_RATE_LIMIT_MAX_REQUESTS,
    windowMs: ADMIN_BOOTSTRAP_RATE_LIMIT_WINDOW_MS,
  });
  if (!rateLimit.allowed) {
    const blocked = apiError(
      "AUTH_RATE_LIMITED",
      "Too many admin session attempts. Please retry shortly.",
      429,
    );
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
    return apiError("INVALID_JSON", "Request body must be valid JSON.", 400);
  }

  const idToken = String(body.idToken ?? "").trim();
  if (!idToken) {
    return apiError("ID_TOKEN_REQUIRED", "A Supabase access token is required.", 400);
  }

  const sessionTtlSeconds = getSessionTtlSeconds();

  let decodedToken: Awaited<ReturnType<ReturnType<typeof getServerAuthAdmin>["verifyIdToken"]>>;

  /* Isolate token verification so auth adapter errors can be distinguished
     from downstream infrastructure failures and returned with the correct
     status code instead of being swallowed into a generic 401. */
  try {
    const auth = getServerAuthAdmin();
    decodedToken = await auth.verifyIdToken(idToken);
  } catch (verifyError) {
    const code = getAuthAdapterErrorCode(verifyError);

    if (code === "auth/id-token-revoked") {
      return apiError(
        "ID_TOKEN_REVOKED",
        "This session token has been revoked. Please sign in again.",
        401,
      );
    }

    if (code === "auth/user-disabled") {
      return apiError(
        "USER_SUSPENDED",
        "This admin account is suspended and cannot start a session.",
        403,
      );
    }

    if (AUTH_TOKEN_ERROR_CODES.has(code)) {
      return apiError(
        "ID_TOKEN_INVALID",
        "The provided ID token is invalid or has expired.",
        401,
      );
    }

    /* Non-token errors (network, quota, SDK misconfiguration) are
       infrastructure problems — surface a 503 so the client knows to retry
       rather than treating the request as an auth failure. */
    return apiError(
      "ADMIN_BOOTSTRAP_FAILED",
      "Unable to verify the admin session token. Please try again.",
      503,
    );
  }

  try {
    const auth = getServerAuthAdmin();
    const tokenClaims = decodedToken as Record<string, unknown>;
    const isAllowlisted = isAllowlistedAdminEmail(decodedToken.email ?? null);
    const signInProvider = getDecodedSignInProvider(decodedToken);

    if (!hasRecentSignIn(decodedToken)) {
      return apiError(
        "RECENT_SIGN_IN_REQUIRED",
        "Please complete a fresh admin sign-in before creating a session.",
        401,
      );
    }

    if (signInProvider !== "password") {
      return apiError(
        "EMAIL_PASSWORD_REQUIRED",
        "Admin access requires email/password authentication.",
        403,
      );
    }

    if (!isAllowlisted) {
      return apiError(
        "ADMIN_ACCOUNT_UNAUTHORIZED",
        "This account is not authorized for admin access.",
        403,
      );
    }

    const claimVerification = await verifyAdminClaimActivation(auth, {
      uid: decodedToken.uid,
      email: decodedToken.email ?? null,
      admin: tokenClaims.admin,
    });

    if (!claimVerification.ok) {
      return apiError(
        claimVerification.code,
        claimVerification.message,
        claimVerification.status,
      );
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
      const denied = apiError(
        "USER_SUSPENDED",
        "This admin account is suspended and cannot start a session.",
        403,
      );
      /* Clear any residual session cookie so a suspended admin is never left
         in a partially-authenticated browser state. */
      denied.cookies.set(ENV_KEYS.sessionCookie, "", getSessionCookieOptions(0));
      return denied;
    }

    const sessionCookie = await auth.createSessionCookie(idToken, {
      expiresIn: sessionTtlSeconds * 1000,
    });

    const redirectTo = getAuthenticatedUserRedirectPath(user);

    const response = apiSuccess({
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
      redirectTo,
    });
    response.cookies.set(
      ENV_KEYS.sessionCookie,
      sessionCookie,
      getSessionCookieOptions(sessionTtlSeconds),
    );

    /* Fire-and-forget audit log — do not await inside the response path so a
       slow log write cannot delay or abort a successful session creation. */
    void appendAdminLog({
      actorUid: user.uid,
      actorRole: user.role,
      ownerUid: user.uid,
      ownerRole: user.role,
      action: "admin-session-created",
      resourceType: "session",
      resourceId: user.uid,
      route: "/api/auth/admin/bootstrap",
      metadata: {
        redirectTo,
        sessionTtlSeconds,
      },
    });

    return response;
  } catch {
    /* Catch-all for unexpected repository or cookie errors after token
       verification succeeded. These are infrastructure failures, not auth
       failures, so 503 is more accurate than 401. */
    return apiError(
      "ADMIN_BOOTSTRAP_FAILED",
      "Unable to create a secure admin session.",
      503,
    );
  }
}