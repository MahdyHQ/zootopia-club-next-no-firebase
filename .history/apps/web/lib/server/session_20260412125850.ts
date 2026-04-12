import "server-only";

import { APP_ROUTES } from "@zootopia/shared-config";
import type {
  SessionSnapshot,
  SessionUser,
  UserRole,
  UserStatus,
} from "@zootopia/shared-types";
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

type VerifiedSessionContext = {
  isAdmin: boolean;
  sessionExpiresAt: string;
  user: SessionUser;
};

function normalizeRole(value: unknown): UserRole {
  return value === "admin" ? "admin" : "user";
}

function normalizeStatus(value: unknown): UserStatus {
  return value === "suspended" ? "suspended" : "active";
}

function normalizeString(value: unknown): string | null {
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

const getVerifiedSessionContext = cache(
  async (): Promise<VerifiedSessionContext | null> => {
    /* CRITICAL: Session boundary is the permanent trust boundary for user identity resolution.
       
       Session -> User Ownership Binding:
       1. auth() validates the session cookie (HTTP-only, signed by AUTH_SECRET)
       2. readSessionUid() extracts session.user.uid from the session payload
      3. getUserByUid() loads persisted user profile from the server-owned repository (Supabase-backed in active runtime)
       4. Merged context = authoritative SessionUser (uid + role + status + profile fields)
       5. Every subsequent storage access MUST use session.user.uid as the owner
       
       Storage Ownership Model:
       - Path: namespace/{ownerUid}/... ← derived from session.user.uid ONLY
       - Owner validation: if (storagePath.startsWith(`{namespace}/{session.uid}/`)) → access granted
       - Authorization: assertOwnerScopedStoragePath() ALWAYS checks before read/write/delete
       
       Why this matters:
       - Client request body fields like userId/ownerId are IGNORED
       - Client request params like documentId are used only to LOOK UP metadata
       - Metadata ownership (record.ownerUid) must match session.uid
       - Even if metadata is corrupted, path assertion blocks access
       
       Future agents: Do NOT derive ownership from request body, URL params, or FormData.
       The session context (from auth()) is the ONLY authoritative identity source.
    */
    await sweepExpiredUploadedSources().catch(() => undefined);

    const activeSession = await auth();
    const uid = readSessionUid(activeSession?.user);
    if (!uid) {
      return null;
    }

    const persistedUser = await getUserByUid(uid);
    const sessionUser = activeSession?.user as Record<string, unknown> | undefined;

    const normalizedUser: SessionUser = persistedUser
      ? {
          uid: persistedUser.uid,
          email: persistedUser.email,
          displayName: persistedUser.displayName,
          photoURL: persistedUser.photoURL,
          deviceLabel: persistedUser.deviceLabel,
          deviceLabelSource: persistedUser.deviceLabelSource,
          deviceLabelConfidence: persistedUser.deviceLabelConfidence,
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
          displayName:
            normalizeString(sessionUser?.displayName) ??
            normalizeString(sessionUser?.name),
          photoURL:
            normalizeString(sessionUser?.photoURL) ??
            normalizeString(sessionUser?.image),
          deviceLabel: normalizeString(sessionUser?.deviceLabel),
          deviceLabelSource: normalizeString(sessionUser?.deviceLabelSource),
          deviceLabelConfidence:
            typeof sessionUser?.deviceLabelConfidence === "number"
              ? sessionUser.deviceLabelConfidence
              : null,
          fullName: normalizeString(sessionUser?.fullName),
          universityCode: normalizeString(sessionUser?.universityCode),
          phoneNumber: normalizeString(sessionUser?.phoneNumber),
          phoneCountryIso2: normalizeString(sessionUser?.phoneCountryIso2),
          phoneCountryCallingCode: normalizeString(
            sessionUser?.phoneCountryCallingCode,
          ),
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
  },
);

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
