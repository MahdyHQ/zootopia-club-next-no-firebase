import { ENV_KEYS } from "@zootopia/shared-config";

import { getAuthenticatedUserRedirectPath } from "@/lib/return-to";
import { apiError, apiSuccess } from "@/lib/server/api";
import {
  getDecodedSignInProvider,
  hasRecentSignIn,
  isAllowlistedAdminEmail,
  verifyAdminClaimActivation,
} from "@/lib/server/admin-auth";
import {
  getFirebaseAdminAuth,
  hasFirebaseAdminRuntime,
} from "@/lib/server/firebase-admin";
import {
  appendAdminLog,
  getRoleFromAuthClaims,
  upsertUserFromAuth,
} from "@/lib/server/repository";
import { checkRequestRateLimit } from "@/lib/server/request-rate-limit";
import { getSessionTtlSeconds } from "@/lib/server/session-config";
import { getSessionCookieOptions } from "@/lib/preferences";

export const runtime = "nodejs";

const ADMIN_BOOTSTRAP_RATE_LIMIT_MAX_REQUESTS = 10;
const ADMIN_BOOTSTRAP_RATE_LIMIT_WINDOW_MS = 60 * 1000;

export async function POST(request: Request) {
  if (!hasFirebaseAdminRuntime()) {
    return apiError(
      "FIREBASE_ADMIN_UNAVAILABLE",
      "Firebase Admin runtime is not configured yet.",
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

  const idToken = String(body.idToken || "").trim();
  if (!idToken) {
    return apiError("ID_TOKEN_REQUIRED", "A Firebase ID token is required.", 400);
  }

  const sessionTtlSeconds = getSessionTtlSeconds();

  try {
    const auth = getFirebaseAdminAuth();
    const decodedToken = await auth.verifyIdToken(idToken);
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
        "Admin access requires Firebase Email/Password authentication.",
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
      denied.cookies.set(ENV_KEYS.sessionCookie, "", getSessionCookieOptions(0));
      return denied;
    }

    const sessionCookie = await auth.createSessionCookie(idToken, {
      expiresIn: sessionTtlSeconds * 1000,
    });

    const response = apiSuccess({
      user: {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        fullName: user.fullName,
        universityCode: user.universityCode,
        profileCompleted: user.profileCompleted,
        profileCompletedAt: user.profileCompletedAt,
        role: user.role,
        status: user.status,
      },
      redirectTo: getAuthenticatedUserRedirectPath(user),
    });
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
      action: "admin-session-created",
      resourceType: "session",
      resourceId: user.uid,
      route: "/api/auth/admin/bootstrap",
      metadata: {
        redirectTo: getAuthenticatedUserRedirectPath(user),
        sessionTtlSeconds,
      },
    });
    return response;
  } catch {
    return apiError(
      "ADMIN_BOOTSTRAP_FAILED",
      "Unable to create a secure admin session.",
      401,
    );
  }
}
