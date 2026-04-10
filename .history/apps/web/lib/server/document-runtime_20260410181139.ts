import "server-only";

import type { DocumentRecord } from "@zootopia/shared-types";
import {
  validateUploadDescriptor,
} from "@zootopia/shared-utils";
import { randomUUID } from "node:crypto";

import { buildDocumentMarkdownSnapshot } from "@/lib/server/document-markdown";
import {
  deleteZootopiaPrivateObject,
  downloadZootopiaPrivateObject,
  hasRemoteBlobStorage,
  uploadZootopiaPrivateObject,
} from "@/lib/server/supabase-blob-storage";
import {
  assertOwnerScopedStoragePath,
  buildDocumentStoragePath,
} from "@/lib/server/owner-scope";
import { getRetentionExpiryTimestamp } from "@/lib/server/assessment-retention";

function resolveWorkspaceExpiryTimestamp(input: {
  createdAt: string;
  workspaceExpiresAt?: string | null;
}) {
  const workspaceExpiryMs = input.workspaceExpiresAt
    ? Date.parse(input.workspaceExpiresAt)
    : Number.NaN;

  if (Number.isFinite(workspaceExpiryMs)) {
    return new Date(workspaceExpiryMs).toISOString();
  }

  return getRetentionExpiryTimestamp(input.createdAt);
}

async function tryPersistBinaryToStorage(input: {
  ownerUid: string;
  documentId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}) {
  if (!hasRemoteBlobStorage()) {
    return null;
  }

  try {
    const path = buildDocumentStoragePath({
      ownerUid: input.ownerUid,
      documentId: input.documentId,
      fileName: input.fileName,
    });
    /* OWNER-SCOPED STORAGE PERSISTENCE:
       
       Every file persisted to storage MUST have its ownerUid embedded in the path.
       The ownerUid is derived from session.user.uid (authenticated identity), NOT from
       client request parameters.
       
       Path format: documents/{ownerUid}/* ← {ownerUid} comes from getAuthenticatedSessionUser().uid
       
       Assertion layer: Even if a corrupted metadata record has the wrong ownerUid,
       assertOwnerScopedStoragePath() will reject the write and throw OWNER_STORAGE_SCOPE_MISMATCH.
       
       Future agents: 
       - Do NOT infer ownerUid from FormData, request body, or URL params
       - Always pass session.uid as the source of truth for ownerUid
       - Every storage write must include this assertion
    */
    const storagePath = assertOwnerScopedStoragePath(path, input.ownerUid, ["documents"]);

    await uploadZootopiaPrivateObject({
      path: storagePath,
      body: input.buffer,
      contentType: input.mimeType,
    });

    return storagePath;
  } catch {
    return null;
  }
}

export async function loadDocumentBinaryFromStorage(record: Pick<
  DocumentRecord,
  "storagePath" | "ownerUid" | "id"
>) {
  if (!record.storagePath || !hasRemoteBlobStorage()) {
    return null;
  }

  try {
    const storagePath = assertOwnerScopedStoragePath(record.storagePath, record.ownerUid, [
      "documents",
    ]);
    return downloadZootopiaPrivateObject(storagePath);
  } catch {
    return null;
  }
}

export async function deleteDocumentBinaryFromStorage(record: Pick<
  DocumentRecord,
  "storagePath" | "ownerUid"
>) {
  if (!record.storagePath || !hasRemoteBlobStorage()) {
    return;
  }

  try {
    const storagePath = assertOwnerScopedStoragePath(record.storagePath, record.ownerUid, [
      "documents",
    ]);
    await deleteZootopiaPrivateObject(storagePath);
  } catch {
    // Storage cleanup is best-effort only. The document record remains the primary owner-scoped source of truth.
  }
}

export async function createDocumentRecord(input: {
  ownerUid: string;
  ownerRole: DocumentRecord["ownerRole"];
  workspaceExpiresAt?: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  buffer: Buffer;
}): Promise<{ document: DocumentRecord; warnings: string[] }> {
  validateUploadDescriptor({
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
  });

  const createdAt = new Date().toISOString();
  const documentId = randomUUID();
  /* This is the active upload normalization path for the protected workspace.
     It replaced the retired Datalab-specific helper, and future agents should preserve the same direct-file-first contract and truthful warnings. */
  const snapshot = buildDocumentMarkdownSnapshot({
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    buffer: input.buffer,
  });
  const warnings = [...snapshot.warnings];

  const storagePath = await tryPersistBinaryToStorage({
    ownerUid: input.ownerUid,
    documentId,
    fileName: input.fileName,
    mimeType: input.mimeType,
    buffer: input.buffer,
  });

  if (!storagePath) {
    warnings.push(
      "Original binary storage is not active in this runtime yet. Metadata and extracted context were still preserved.",
    );
  }

  return {
    document: {
      id: documentId,
      ownerUid: input.ownerUid,
      ownerRole: input.ownerRole,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      storagePath,
      status: "ready",
      markdown: snapshot.markdown,
      extractionEngine: "direct-file",
      isActive: true,
      supersededAt: null,
      /* Upload binaries are session-scoped workspace assets. This expiry timestamp is now driven
         by the authenticated session boundary, with retention-window fallback when unavailable. */
      expiresAt: resolveWorkspaceExpiryTimestamp({
        createdAt,
        workspaceExpiresAt: input.workspaceExpiresAt,
      }),
      createdAt,
      updatedAt: createdAt,
    },
    warnings,
  };
}
