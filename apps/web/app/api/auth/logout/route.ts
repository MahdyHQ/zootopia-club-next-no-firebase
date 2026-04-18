import { auth } from "@/auth";
import { apiSuccess, applyNoStore } from "@/lib/server/api";
import { appendAdminLog, clearUploadWorkspaceForOwner } from "@/lib/server/repository";
import { releaseActiveNormalUserSessionLease } from "@/lib/server/active-normal-user-session-governance";

export const runtime = "nodejs";

function readLogoutSessionUser(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const sessionUser = value as {
    id?: unknown;
    uid?: unknown;
    role?: unknown;
  };
  const uid =
    typeof sessionUser.uid === "string"
      ? sessionUser.uid.trim()
      : typeof sessionUser.id === "string"
        ? sessionUser.id.trim()
        : "";

  if (!uid) {
    return null;
  }

  return {
    uid,
    role: sessionUser.role === "admin" ? "admin" : "user",
  } as const;
}

export async function POST() {
  /* Logout cleanup intentionally reads the raw Auth.js session cookie instead of the
     renewal-gated session helper. This route must still release the active-user lease when
     session rehydration is degraded, otherwise a stale slot can remain occupied until
     the active-user lease window expires. */
  const activeSession = await auth();
  const user = readLogoutSessionUser(activeSession?.user);
  const response = applyNoStore(apiSuccess({ loggedOut: true }));

  if (user) {
    await releaseActiveNormalUserSessionLease({
      uid: user.uid,
    }).catch(() => undefined);

    /* Session logout is an immediate workspace boundary. Clear temporary uploaded source files
       now so only generated assessment artifacts remain retained under their own lifecycle. */
    const workspaceCleanup = await clearUploadWorkspaceForOwner(user.uid).catch(() => ({
      clearedDocumentCount: 0,
      clearedPreparedUploadCount: 0,
    }));

    await appendAdminLog({
      actorUid: user.uid,
      actorRole: user.role,
      ownerUid: user.uid,
      ownerRole: user.role,
      action: "session-logged-out",
      resourceType: "session",
      resourceId: user.uid,
      route: "/api/auth/logout",
      metadata: {
        clearedUploadDocuments: workspaceCleanup.clearedDocumentCount,
        clearedPreparedUploads: workspaceCleanup.clearedPreparedUploadCount,
      },
    });
  }

  return response;
}
