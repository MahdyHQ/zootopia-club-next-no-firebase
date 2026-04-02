import "server-only";

import { APP_ROUTES, ENV_KEYS } from "@zootopia/shared-config";
import type { SessionSnapshot } from "@zootopia/shared-types";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import {
  buildSettingsRedirect,
  getAuthenticatedUserRedirectPath,
  isProfileCompletionRequired,
} from "@/lib/return-to";
import { hasAdminAccessFromClaims } from "@/lib/server/admin-auth";
import { getFirebaseAdminAuth } from "@/lib/server/firebase-admin";
import { getRoleFromAuthClaims, upsertUserFromAuth } from "@/lib/server/repository";

const ANONYMOUS_SESSION: SessionSnapshot = {
  authenticated: false,
  user: null,
};

const getVerifiedSessionContext = cache(async () => {
  const sessionCookie = (await cookies()).get(ENV_KEYS.sessionCookie)?.value;
  if (!sessionCookie) {
    return null;
  }

  try {
    const decodedToken = await getFirebaseAdminAuth().verifySessionCookie(
      sessionCookie,
      true,
    );
    const tokenClaims = decodedToken as Record<string, unknown>;
    const isAdmin = hasAdminAccessFromClaims({
      email: decodedToken.email ?? null,
      admin: tokenClaims.admin,
    });

    const user = await upsertUserFromAuth({
      uid: decodedToken.uid,
      email: decodedToken.email ?? null,
      displayName:
        typeof decodedToken.name === "string" ? decodedToken.name : null,
      photoURL:
        typeof decodedToken.picture === "string"
          ? decodedToken.picture
          : null,
      role: getRoleFromAuthClaims({
        email: decodedToken.email ?? null,
        admin: tokenClaims.admin,
      }),
    });

    return {
      isAdmin,
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
    };
  } catch {
    return null;
  }
});

export async function getSessionSnapshot(): Promise<SessionSnapshot> {
  const session = await getVerifiedSessionContext();
  if (!session) {
    return ANONYMOUS_SESSION;
  }

  return {
    authenticated: true,
    user: session.user,
  };
}

export async function getAuthenticatedSessionUser() {
  const session = await getVerifiedSessionContext();
  if (!session || session.user.status !== "active") {
    return null;
  }

  return session.user;
}

export async function getAdminSessionUser() {
  const session = await getVerifiedSessionContext();
  if (!session || session.user.status !== "active" || !session.isAdmin) {
    return null;
  }

  return session.user;
}

export async function getCompletedSessionUser() {
  const user = await getAuthenticatedSessionUser();
  if (!user || isProfileCompletionRequired(user)) {
    return null;
  }

  return user;
}

export async function requireAuthenticatedUser() {
  const user = await getAuthenticatedSessionUser();
  if (!user) {
    redirect(APP_ROUTES.login);
  }

  return user;
}

export async function requireCompletedUser(returnTo?: string) {
  const user = await requireAuthenticatedUser();
  if (isProfileCompletionRequired(user)) {
    redirect(buildSettingsRedirect(returnTo));
  }

  return user;
}

export async function requireAdminUser() {
  const session = await getVerifiedSessionContext();
  if (!session || session.user.status !== "active") {
    redirect(APP_ROUTES.adminLogin);
  }

  if (!session.isAdmin) {
    redirect(getAuthenticatedUserRedirectPath(session.user));
  }

  return session.user;
}
