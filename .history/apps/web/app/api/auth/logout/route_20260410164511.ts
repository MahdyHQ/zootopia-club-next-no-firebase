import { apiSuccess, applyNoStore } from "@/lib/server/api";
import { appendAdminLog, clearUploadWorkspaceForOwner } from "@/lib/server/repository";
import { getAuthenticatedSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";

export async function POST() {
  const user = await getAuthenticatedSessionUser();
  const response = applyNoStore(apiSuccess({ loggedOut: true }));

  if (user) {
    /* Session logout is an immediate workspace boundary. Clear temporary uploaded source files
       now so only generated assessment artifacts remain retained under their own lifecycle. */
    const workspaceCleanup = await clearUploadWorkspaceForOwner(user.uid).catch(() => ({
      clearedDocumentCount: 0,
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
      },
    });
  }

  return response;
}
