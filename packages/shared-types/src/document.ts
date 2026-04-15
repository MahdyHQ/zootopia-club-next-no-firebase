import type { UserRole } from "./auth";

export type DocumentStatus =
  | "received"
  | "processing"
  | "ready"
  | "failed";

/* Historic records may still carry the retired Datalab marker from older uploads.
   New writes should stay on the direct-file runtime without breaking reads for those persisted documents. */
export type DocumentExtractionEngine =
  | "direct-file"
  | "datalab-convert";

export type StorageDataClass =
  | "upload-source"
  | "assessment-result"
  | "assessment-export";

export type StorageLayoutVersion = "legacy-v1" | "unified-v2";

export interface DocumentRecord {
  id: string;
  ownerUid: string;
  ownerRole?: UserRole;
  fileName: string;
  fileExtension?: string;
  mimeType: string;
  sizeBytes: number;
  contentSha256?: string;
  storagePath: string | null;
  sourceBinaryRetained?: boolean;
  storageDataClass?: "upload-source";
  storageOwnerUid?: string;
  storageLayoutVersion?: StorageLayoutVersion;
  status: DocumentStatus;
  markdown: string | null;
  extractionEngine: DocumentExtractionEngine;
  isActive?: boolean;
  supersededAt?: string | null;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UploadResponse {
  document: DocumentRecord;
  warnings: string[];
}

export interface RemoveDocumentResponse {
  removedDocumentId: string;
  documents: DocumentRecord[];
}
