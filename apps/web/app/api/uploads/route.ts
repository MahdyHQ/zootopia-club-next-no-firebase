import type {
  RemoveDocumentResponse,
  UploadResponse,
} from "@zootopia/shared-types";
import { validateUploadDescriptor } from "@zootopia/shared-utils";
import { randomUUID } from "node:crypto";

import { isProfileCompletionRequired } from "@/lib/return-to";
import { apiError, apiSuccess } from "@/lib/server/api";
import {
  createDocumentRecord,
  deleteDocumentBinaryFromStorage,
  resolveUploadWorkspaceExpiryTimestamp,
} from "@/lib/server/document-runtime";
import { buildDocumentStoragePath } from "@/lib/server/owner-scope";
import {
  appendAdminLog,
  deleteUploadPreparationForOwner,
  deleteDocumentForOwner,
  getUploadPreparationByIdForOwner,
  listDocumentsForUser,
  saveUploadPreparation,
  saveDocument,
} from "@/lib/server/repository";
import {
  getAuthenticatedSessionContext,
  getAuthenticatedSessionUser,
} from "@/lib/server/session";
import {
  createSignedUploadUrlForZootopiaPrivateObject,
  deleteZootopiaPrivateObject,
  downloadZootopiaPrivateObject,
  getZootopiaPrivateBucketName,
  hasRemoteBlobStorage,
} from "@/lib/server/supabase-blob-storage";
import { hasSupabasePublicRuntime } from "@/lib/supabase/public-config";

export const runtime = "nodejs";

type UploadPrepareRequestBody = {
  mode?: "prepare";
  fileName?: unknown;
  mimeType?: unknown;
  sizeBytes?: unknown;
};

type UploadCompleteRequestBody = {
  mode?: "complete";
  documentId?: unknown;
  fileName?: unknown;
  mimeType?: unknown;
  sizeBytes?: unknown;
};

type UploadPrepareResponse = {
  documentId: string;
  bucket: string;
  objectPath: string;
  uploadToken: string;
};

function readUploadString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readUploadSize(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }

  return Number.NaN;
}

function parseUploadDescriptor(input: {
  fileName?: unknown;
  mimeType?: unknown;
  sizeBytes?: unknown;
}) {
  const descriptor = {
    fileName: readUploadString(input.fileName),
    mimeType: readUploadString(input.mimeType),
    sizeBytes: readUploadSize(input.sizeBytes),
  };

  validateUploadDescriptor(descriptor);
  return descriptor;
}

function classifyUploadBodyParseFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  if (/too large|entity too large|payload too large|body exceeded/i.test(message)) {
    return {
      code: "UPLOAD_REQUEST_TOO_LARGE",
      message:
        "The upload request exceeded the server body limit before it could be processed.",
      status: 413,
    } as const;
  }

  return {
    code: "UPLOAD_REQUEST_INVALID",
    message: "The upload request body could not be processed.",
    status: 400,
  } as const;
}

/* The /upload page now supports a two-step direct-upload path for production-sized files:
   1. Server authenticates the user and signs one owner-scoped Storage object path.
   2. Browser uploads the file directly to that exact path with the Supabase client.
   3. Server re-downloads the object, extracts context, and saves owner-bound metadata.
   This keeps the browser out of owner-path decisions while removing the function body proxy bottleneck. */
async function handlePrepareDirectUpload(
  body: UploadPrepareRequestBody,
) {
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

  if (!hasRemoteBlobStorage() || !hasSupabasePublicRuntime()) {
    return apiError(
      "UPLOAD_DIRECT_UNAVAILABLE",
      "Secure direct uploads are temporarily unavailable in this runtime.",
      503,
    );
  }

  let descriptor;
  try {
    descriptor = parseUploadDescriptor(body);
  } catch (error) {
    return apiError(
      "INVALID_UPLOAD_DESCRIPTOR",
      error instanceof Error ? error.message : "Upload details are invalid.",
      400,
    );
  }

  const documentId = randomUUID();
  const objectPath = buildDocumentStoragePath({
    ownerUid: user.uid,
    documentId,
    fileName: descriptor.fileName,
  });

  try {
    const signedUpload = await createSignedUploadUrlForZootopiaPrivateObject({
      path: objectPath,
      upsert: true,
    });

    const preparedAt = new Date().toISOString();
    await saveUploadPreparation({
      id: documentId,
      ownerUid: user.uid,
      ownerRole: user.role,
      fileName: descriptor.fileName,
      mimeType: descriptor.mimeType,
      sizeBytes: descriptor.sizeBytes,
      storagePath: objectPath,
      status: "prepared",
      createdAt: preparedAt,
      updatedAt: preparedAt,
      /* Prepared direct uploads now persist a minimal lifecycle row so cleanup can remove
         owner-scoped Storage objects even when the browser uploads successfully but finalize
         never reaches the server. Keep this aligned with document upload expiry semantics. */
      expiresAt: resolveUploadWorkspaceExpiryTimestamp({
        createdAt: preparedAt,
        workspaceExpiresAt: session.sessionExpiresAt,
      }),
    });

    return apiSuccess<UploadPrepareResponse>({
      documentId,
      bucket: getZootopiaPrivateBucketName(),
      objectPath: signedUpload.path,
      uploadToken: signedUpload.token,
    });
  } catch (error) {
    return apiError(
      "UPLOAD_PREPARE_FAILED",
      error instanceof Error
        ? error.message
        : "The upload could not be prepared right now.",
      502,
    );
  }
}

async function handleCompleteDirectUpload(
  body: UploadCompleteRequestBody,
) {
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

  const documentId = readUploadString(body.documentId).trim();
  if (!documentId) {
    return apiError(
      "UPLOAD_DOCUMENT_ID_REQUIRED",
      "A prepared document id is required to finish this upload.",
      400,
    );
  }

  let descriptor;
  try {
    descriptor = parseUploadDescriptor(body);
  } catch (error) {
    return apiError(
      "INVALID_UPLOAD_DESCRIPTOR",
      error instanceof Error ? error.message : "Upload details are invalid.",
      400,
    );
  }

  const uploadPreparation = await getUploadPreparationByIdForOwner(documentId, user.uid);
  if (!uploadPreparation) {
    return apiError(
      "UPLOAD_PREPARATION_NOT_FOUND",
      "This upload session is no longer available. Please start the upload again.",
      409,
    );
  }

  if (
    uploadPreparation.fileName !== descriptor.fileName
    || uploadPreparation.mimeType !== descriptor.mimeType
    || uploadPreparation.sizeBytes !== descriptor.sizeBytes
  ) {
    return apiError(
      "UPLOAD_PREPARATION_MISMATCH",
      "The upload did not match the prepared file details. Please start again with a fresh upload.",
      409,
    );
  }

  const expectedObjectPath = buildDocumentStoragePath({
    ownerUid: user.uid,
    documentId,
    fileName: descriptor.fileName,
  });
  if (uploadPreparation.storagePath !== expectedObjectPath) {
    return apiError(
      "UPLOAD_PREPARATION_INVALID",
      "The prepared upload path is no longer valid. Please restart the upload.",
      409,
    );
  }

  try {
    const buffer = await downloadZootopiaPrivateObject(uploadPreparation.storagePath);
    if (!buffer) {
      return apiError(
        "UPLOAD_SOURCE_MISSING",
        "The uploaded file could not be recovered from secure storage. Please retry the upload.",
        409,
      );
    }

    if (buffer.byteLength !== descriptor.sizeBytes) {
      await deleteZootopiaPrivateObject(uploadPreparation.storagePath);
      return apiError(
        "UPLOAD_SOURCE_SIZE_MISMATCH",
        "The uploaded file did not match the prepared upload details. Please retry the upload.",
        409,
      );
    }

    const { document, warnings } = await createDocumentRecord({
      ownerUid: user.uid,
      ownerRole: user.role,
      documentId,
      storagePath: uploadPreparation.storagePath,
      /* Upload records remain bound to the authenticated session workspace even though the
         binary now travels browser -> Storage directly. Session expiry still governs the
         document lifetime, and owner scope still comes only from session.user.uid here. */
      workspaceExpiresAt: session.sessionExpiresAt,
      fileName: descriptor.fileName,
      mimeType: descriptor.mimeType,
      sizeBytes: descriptor.sizeBytes,
      buffer,
    });

    const savedDocument = await saveDocument(document);
    await deleteUploadPreparationForOwner(documentId, user.uid).catch((error) => {
      console.warn("[uploads] upload preparation cleanup after finalize failed", {
        uid: user.uid,
        documentId,
        error: error instanceof Error ? error.message : String(error),
      });
    });

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
    }).catch((error) => {
      console.warn("[uploads] document-uploaded audit log failed", {
        uid: user.uid,
        documentId: savedDocument.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return apiSuccess<UploadResponse>(
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

async function handleMultipartUpload(request: Request) {
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

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (error) {
    const classified = classifyUploadBodyParseFailure(error);
    return apiError(classified.code, classified.message, classified.status);
  }

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
         - Path: users/{userId}/documents/* ← fully scoped to authenticated owner

         Temporary Lifecycle:
         - Uploaded source files are session-workspace assets with env-driven upload retention
         - Additional decay: files also expire when session ends (earlier of session-expiry or upload-retention mark)
         - Cleanup runs opportunistically on auth boundary via sweepExpiredUploadedSources()
         - Optional maintenance endpoint: POST /api/internal/maintenance/expired-uploads

         Ownership Isolation:
         - Only session.uid can access/modify their own uploads (enforced by assertOwnerScopedStoragePath)
         - User A cannot download, modify, or delete User B upload's files
         - Admin has no special privilege in user-facing upload routes (admin observation separately gated)

         Future agents:
         - Do NOT accept userId, ownerId, or uploaderId from request body/params
         - Always derive ownerUid from session.user.uid
         - Preserve the canonical path structure: users/{ownerUid}/documents/{documentId}/{fileName}
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
    }).catch((error) => {
      console.warn("[uploads] multipart document-uploaded audit log failed", {
        uid: user.uid,
        documentId: savedDocument.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return apiSuccess<UploadResponse>(
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

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    let body: UploadPrepareRequestBody | UploadCompleteRequestBody;

    try {
      body = (await request.json()) as UploadPrepareRequestBody | UploadCompleteRequestBody;
    } catch {
      return apiError("INVALID_JSON", "Request body must be valid JSON.", 400);
    }

    if (body.mode === "prepare") {
      return handlePrepareDirectUpload(body);
    }

    if (body.mode === "complete") {
      return handleCompleteDirectUpload(body);
    }

    return apiError(
      "UPLOAD_MODE_INVALID",
      "Upload mode must be either prepare or complete.",
      400,
    );
  }

  return handleMultipartUpload(request);
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
    const currentDocuments = await listDocumentsForUser(user.uid);
    const removedDocument = await deleteDocumentForOwner(documentId, user.uid);
    if (!removedDocument) {
      return apiError("DOCUMENT_NOT_FOUND", "The requested document was not found.", 404);
    }

    // Binary cleanup stays best-effort so removing the active workspace file never fails because storage cleanup lagged.
    await deleteDocumentBinaryFromStorage(removedDocument);
    await deleteUploadPreparationForOwner(removedDocument.id, user.uid).catch((error) => {
      console.warn("[uploads] stale upload preparation cleanup after delete failed", {
        uid: user.uid,
        documentId: removedDocument.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });
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
    }).catch((error) => {
      console.warn("[uploads] document-deleted audit log failed", {
        uid: user.uid,
        documentId: removedDocument.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    const nextDocuments = currentDocuments
      .filter((document) => document.id !== removedDocument.id)
      .map((document, index) =>
        removedDocument.isActive
          ? {
              ...document,
              isActive: index === 0,
              supersededAt: index === 0 ? null : document.supersededAt ?? null,
            }
          : document,
      );

    return apiSuccess<RemoveDocumentResponse>({
      removedDocumentId: documentId,
      documents: nextDocuments,
    });
  } catch (error) {
    return apiError(
      "DOCUMENT_DELETE_FAILED",
      error instanceof Error ? error.message : "Document removal failed.",
      400,
    );
  }
}
