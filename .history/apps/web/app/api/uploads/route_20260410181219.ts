import { isProfileCompletionRequired } from "@/lib/return-to";
import { apiError, apiSuccess } from "@/lib/server/api";
import type { RemoveDocumentResponse } from "@zootopia/shared-types";

import {
  createDocumentRecord,
  deleteDocumentBinaryFromStorage,
} from "@/lib/server/document-runtime";
import {
  deleteDocumentForOwner,
  listDocumentsForUser,
  saveDocument,
  appendAdminLog,
} from "@/lib/server/repository";
import {
  getAuthenticatedSessionContext,
  getAuthenticatedSessionUser,
} from "@/lib/server/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getAuthenticatedSessionContext();
  if (!session) {
    return apiError("UNAUTHENTICATED", "Sign in is required for uploads.", 401);
  }
  const user = session.user;

  if (isProfileCompletionRequired(user)) {
    return apiError(
      "PROFILE_INCOMPLETE",
      "Complete your profile in Settings before uploading files.",
      403,
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return apiError("FILE_REQUIRED", "A file upload is required.", 400);
  }

  try {
    const { document, warnings } = await createDocumentRecord({
      ownerUid: user.uid,
      ownerRole: user.role,
      /* TEMPORARY UPLOAD STORAGE MODEL:
         
         Session Binding:
         - ownerUid = user.uid (from authenticated session, NOT request body)
         - workspaceExpiresAt = session.sessionExpiresAt (uploads expire when session expires)
         - Path: documents/{userId}/* ← fully scoped to authenticated owner
         
         Temporary Lifecycle:
         - Uploaded source files are session-workspace assets with 3-day baseline retention
         - Additional decay: files also expire when session ends (earlier of session-expiry or 3-day mark)
         - Cleanup runs opportunistically on auth boundary via sweepExpiredUploadedSources()
         - Optional maintenance endpoint: POST /api/internal/maintenance/expired-uploads
         
         Ownership Isolation:
         - Only session.uid can access/modify their own uploads (enforced by assertOwnerScopedStoragePath)
         - User A cannot download, modify, or delete User B upload's files
         - Admin has no special privilege in user-facing upload routes (admin observation separately gated)
         
         Future agents:
         - Do NOT accept userId, ownerId, or uploaderId from request body/params
         - Always derive ownerUid from session.user.uid
         - Preserve the path structure: documents/{ownerUid}/{documentId}/{fileName}
      */
      workspaceExpiresAt: session.sessionExpiresAt,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      buffer: Buffer.from(await file.arrayBuffer()),
    });

    const savedDocument = await saveDocument(document);
    await appendAdminLog({
      actorUid: user.uid,
      actorRole: user.role,
      ownerUid: user.uid,
      ownerRole: user.role,
      action: "document-uploaded",
      resourceType: "document",
      resourceId: savedDocument.id,
      route: "/api/uploads",
      metadata: {
        fileName: savedDocument.fileName,
      },
    });

    return apiSuccess(
      {
        document: savedDocument,
        warnings,
      },
      201,
    );
  } catch (error) {
    return apiError(
      "UPLOAD_FAILED",
      error instanceof Error ? error.message : "Upload failed.",
      400,
    );
  }
}

export async function DELETE(request: Request) {
  const user = await getAuthenticatedSessionUser();
  if (!user) {
    return apiError("UNAUTHENTICATED", "Sign in is required for uploads.", 401);
  }
  if (isProfileCompletionRequired(user)) {
    return apiError(
      "PROFILE_INCOMPLETE",
      "Complete your profile in Settings before changing uploaded files.",
      403,
    );
  }

  const documentId = new URL(request.url).searchParams.get("documentId");
  if (!documentId) {
    return apiError("DOCUMENT_ID_REQUIRED", "A document id is required.", 400);
  }

  try {
    const removedDocument = await deleteDocumentForOwner(documentId, user.uid);
    if (!removedDocument) {
      return apiError("DOCUMENT_NOT_FOUND", "The requested document was not found.", 404);
    }

    // Binary cleanup stays best-effort so removing the active workspace file never fails because storage cleanup lagged.
    await deleteDocumentBinaryFromStorage(removedDocument);
    await appendAdminLog({
      actorUid: user.uid,
      actorRole: user.role,
      ownerUid: user.uid,
      ownerRole: user.role,
      action: "document-deleted",
      resourceType: "document",
      resourceId: removedDocument.id,
      route: "/api/uploads",
      metadata: {
        fileName: removedDocument.fileName,
      },
    });

    return apiSuccess<RemoveDocumentResponse>({
      removedDocumentId: documentId,
      documents: await listDocumentsForUser(user.uid),
    });
  } catch (error) {
    return apiError(
      "DOCUMENT_DELETE_FAILED",
      error instanceof Error ? error.message : "Document removal failed.",
      400,
    );
  }
}
