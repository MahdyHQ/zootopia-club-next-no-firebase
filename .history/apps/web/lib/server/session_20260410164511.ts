import "server-only";

import { APP_ROUTES } from "@zootopia/shared-config";
import type { SessionSnapshot } from "@zootopia/shared-types";
import { redirect } from "next/navigation";
import { cache } from "react";

import { auth } from "@/auth";
import {
  buildSettingsRedirect,
  getAuthenticatedUserRedirectPath,
  isProfileCompletionRequired,
} from "@/lib/return-to";
import {
  getUserByUid,
  sweepExpiredUploadedSources,
} from "@/lib/server/repository";

const ANONYMOUS_SESSION: SessionSnapshot = {
  authenticated: false,
  user: null,
};

function normalizeRole(value: unknown) {
  return value === "admin" ? "admin" : "user";
}

function normalizeStatus(value: unknown) {
  return value === "suspended" ? "suspended" : "active";
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function readSessionUid(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const userRecord = value as Record<string, unknown>;
  if (typeof userRecord.uid === "string") {
    return userRecord.uid;
  }

  if (typeof userRecord.id === "string") {
    return userRecord.id;
  }

  return null;
}

const getVerifiedSessionContext = cache(async () => {
  /* Expired-upload cleanup runs opportunistically from the server auth boundary so temporary
     source files do not linger after session expiry even when users do not revisit protected
     upload routes. A dedicated scheduler endpoint can force this sweep for tighter guarantees. */
  await sweepExpiredUploadedSources().catch(() => undefined);

  const activeSession = await auth();
  const uid = readSessionUid(activeSession?.user);
  if (!uid) {
    return null;
  }

  const persistedUser = await getUserByUid(uid);
  const sessionUser = activeSession?.user as Record<string, unknown> | undefined;

  const normalizedUser = persistedUser
    ? {
        uid: persistedUser.uid,
        email: persistedUser.email,
        displayName: persistedUser.displayName,
        photoURL: persistedUser.photoURL,
        fullName: persistedUser.fullName,
        universityCode: persistedUser.universityCode,
        phoneNumber: persistedUser.phoneNumber,
        phoneCountryIso2: persistedUser.phoneCountryIso2 ?? null,
        phoneCountryCallingCode: persistedUser.phoneCountryCallingCode ?? null,
        nationality: persistedUser.nationality,
        profileCompleted: persistedUser.profileCompleted,
        profileCompletedAt: persistedUser.profileCompletedAt,
        role: persistedUser.role,
        status: persistedUser.status,
      }
    : {
        uid,
        email: normalizeString(sessionUser?.email),
        displayName: normalizeString(sessionUser?.displayName) ?? normalizeString(sessionUser?.name),
        photoURL: normalizeString(sessionUser?.photoURL) ?? normalizeString(sessionUser?.image),
        fullName: normalizeString(sessionUser?.fullName),
        universityCode: normalizeString(sessionUser?.universityCode),
        phoneNumber: normalizeString(sessionUser?.phoneNumber),
        phoneCountryIso2: normalizeString(sessionUser?.phoneCountryIso2),
        phoneCountryCallingCode: normalizeString(sessionUser?.phoneCountryCallingCode),
        nationality: normalizeString(sessionUser?.nationality),
        profileCompleted: Boolean(sessionUser?.profileCompleted),
        profileCompletedAt: normalizeString(sessionUser?.profileCompletedAt),
        role: normalizeRole(sessionUser?.role),
        status: normalizeStatus(sessionUser?.status),
      };

  if (normalizedUser.status !== "active") {
    return null;
  }

  return {
    isAdmin: normalizedUser.role === "admin",
    sessionExpiresAt:
      typeof activeSession?.expires === "string"
        ? activeSession.expires
        : new Date().toISOString(),
    user: normalizedUser,
  };
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
  const session = await getAuthenticatedSessionContext();
  if (!session) {
    return null;
  }

  return session.user;
}

export async function getAuthenticatedSessionContext() {
  const session = await getVerifiedSessionContext();
  if (!session || session.user.status !== "active") {
    return null;
  }

  return session;
}

export async function getAdminSessionUser() {
  const session = await getAuthenticatedSessionContext();
  if (!session || !session.isAdmin) {
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
