import "server-only";

import { APP_ROUTES } from "@zootopia/shared-config";
import type {
  SessionSnapshot,
  SessionUser,
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

function getErrorCode(error: unknown) {
  if (typeof error === "object" && error && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code.trim()) {
      return code;
    }
  }

  if (error instanceof Error) {
    return error.name || "Error";
  }

  return "UNKNOWN";
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
    /* CRITICAL: Session boundary is the server-authoritative trust boundary for protected routes.
       
       Session -> User Ownership Binding:
       1. auth() validates the session cookie (HTTP-only, signed by AUTH_SECRET)
      2. readSessionUid() extracts session.user.uid from the session payload
      3. getUserByUid() loads the live user record from server-owned auth/repository state
      4. Live record = authoritative SessionUser (uid + role + status + profile fields)
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
       - Stale Auth.js JWT claims must NEVER outlive live backend truth for role/status/admin scope
       
       Scope:
       - All protected pages, Route Handlers, admin layouts, exports/downloads, and password flows
       - This helper is security-sensitive, not a convenience hydration path

       Future agents:
       - Do NOT derive ownership from request body, URL params, or FormData
       - Do NOT restore signed-cookie fallback for role/status/profile/admin truth here
       - If you ever need a best-effort UI snapshot, build a separate non-authoritative helper
         and keep it OUT of authorization, owner-scope, and admin route decisions.
    */
    await sweepExpiredUploadedSources().catch(() => undefined);

    const activeSession = await auth();
    const uid = readSessionUid(activeSession?.user);
    if (!uid) {
      return null;
    }

    let persistedUser: Awaited<ReturnType<typeof getUserByUid>> = null;
    try {
      persistedUser = await getUserByUid(uid);
    } catch (error) {
      /* Fail closed for security-sensitive server routes when live user truth is unavailable.
         This covers user APIs, admin pages, exports, and account-security flows so stale JWT
         claims cannot preserve access after suspension, admin demotion, or account deletion. */
      console.warn("[session] rejecting session after persisted user lookup failure", {
        uid,
        errorCode: getErrorCode(error),
      });
      return null;
    }

    if (!persistedUser) {
      return null;
    }

    const normalizedUser: SessionUser = {
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
      gender: persistedUser.gender,
      nationality: persistedUser.nationality,
      profileCompleted: persistedUser.profileCompleted,
      profileCompletedAt: persistedUser.profileCompletedAt,
      role: persistedUser.role,
      status: persistedUser.status,
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
