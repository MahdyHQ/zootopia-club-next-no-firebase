import "server-only";

import type { DocumentRecord } from "@zootopia/shared-types";
import {
  validateUploadDescriptor,
} from "@zootopia/shared-utils";
import { randomUUID } from "node:crypto";

import { convertDocumentToMarkdown } from "@/lib/server/datalab-convert";
import { getFirebaseAdminStorageBucket, hasFirebaseAdminRuntime } from "@/lib/server/firebase-admin";

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
    const path = `documents/${input.ownerUid}/${input.documentId}/${input.fileName}`;

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

export async function createDocumentRecord(input: {
  ownerUid: string;
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
  const conversion = await convertDocumentToMarkdown({
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    buffer: input.buffer,
  });
  const warnings = [...conversion.warnings];

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
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      storagePath,
      status: "ready",
      markdown: conversion.markdown,
      extractionEngine: "datalab-convert",
      createdAt,
      updatedAt: createdAt,
    },
    warnings,
  };
}
