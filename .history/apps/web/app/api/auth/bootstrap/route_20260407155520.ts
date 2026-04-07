import { ENV_KEYS } from "@zootopia/shared-config";

import { getAuthenticatedUserRedirectPath } from "@/lib/return-to";
import { apiError, apiSuccess } from "@/lib/server/api";
import {
  getDecodedSignInProvider,
  hasRecentSignIn,
  isAllowlistedAdminEmail,
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
import { getSessionTtlSeconds } from "@/lib/server/session-config";
import { getSessionCookieOptions } from "@/lib/preferences";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!hasFirebaseAdminRuntime()) {
    return apiError(
      "FIREBASE_ADMIN_UNAVAILABLE",
      "Firebase Admin runtime is not configured yet.",
      503,
    );
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

    if (!hasRecentSignIn(decodedToken)) {
      return apiError(
        "RECENT_SIGN_IN_REQUIRED",
        "Please complete a fresh Google sign-in before creating a session.",
        401,
      );
    }

    if (isAllowlistedAdminEmail(decodedToken.email ?? null)) {
      return apiError(
        "ADMIN_LOGIN_REQUIRED",
        "Admin accounts must use the dedicated admin login page.",
        403,
      );
    }

    if (getDecodedSignInProvider(decodedToken) !== "google.com") {
      return apiError(
        "GOOGLE_SIGN_IN_REQUIRED",
        "Use Google Sign-In from the regular user login page.",
        403,
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
        "This account is suspended and cannot start a session.",
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
        phoneNumber: user.phoneNumber,
        phoneVerifiedAt: user.phoneVerifiedAt,
        nationality: user.nationality,
        originCountry: user.originCountry,
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
    return apiError("BOOTSTRAP_FAILED", "Unable to create a secure session.", 401);
  }
}
