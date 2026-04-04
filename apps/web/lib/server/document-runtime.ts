import "server-only";

import type { DocumentRecord } from "@zootopia/shared-types";
import {
  validateUploadDescriptor,
} from "@zootopia/shared-utils";
import { randomUUID } from "node:crypto";

import { buildDocumentMarkdownSnapshot } from "@/lib/server/document-markdown";
import { getFirebaseAdminStorageBucket, hasFirebaseAdminRuntime } from "@/lib/server/firebase-admin";
import {
  assertOwnerScopedStoragePath,
  buildDocumentStoragePath,
} from "@/lib/server/owner-scope";
import { getRetentionExpiryTimestamp } from "@/lib/server/assessment-retention";

async function tryPersistBinaryToStorage(input: {
  ownerUid: string;
  documentId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}) {
  if (!hasFirebaseAdminRuntime()) {
    return null;
  }

  try {
    const bucket = getFirebaseAdminStorageBucket();
    const path = buildDocumentStoragePath({
      ownerUid: input.ownerUid,
      documentId: input.documentId,
      fileName: input.fileName,
    });

    await bucket.file(path).save(input.buffer, {
      metadata: {
        contentType: input.mimeType,
      },
      resumable: false,
    });

    return path;
  } catch {
    return null;
  }
}

export async function loadDocumentBinaryFromStorage(record: Pick<
  DocumentRecord,
  "storagePath" | "ownerUid" | "id"
>) {
  if (!record.storagePath || !hasFirebaseAdminRuntime()) {
    return null;
  }

  try {
    const bucket = getFirebaseAdminStorageBucket();
    const storagePath = assertOwnerScopedStoragePath(record.storagePath, record.ownerUid, [
      "documents",
    ]);
    const [buffer] = await bucket.file(storagePath).download();
    return buffer;
  } catch {
    return null;
  }
}

export async function deleteDocumentBinaryFromStorage(record: Pick<
  DocumentRecord,
  "storagePath" | "ownerUid"
>) {
  if (!record.storagePath || !hasFirebaseAdminRuntime()) {
    return;
  }

  try {
    const bucket = getFirebaseAdminStorageBucket();
    const storagePath = assertOwnerScopedStoragePath(record.storagePath, record.ownerUid, [
      "documents",
    ]);
    await bucket.file(storagePath).delete();
  } catch {
    // Storage cleanup is best-effort only. The document record remains the primary owner-scoped source of truth.
  }
}

export async function createDocumentRecord(input: {
  ownerUid: string;
  ownerRole: DocumentRecord["ownerRole"];
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
      expiresAt: getRetentionExpiryTimestamp(createdAt),
      createdAt,
      updatedAt: createdAt,
    },
    warnings,
  };
}
