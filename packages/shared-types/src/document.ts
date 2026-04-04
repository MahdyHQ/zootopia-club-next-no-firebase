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

export interface DocumentRecord {
  id: string;
  ownerUid: string;
  ownerRole?: UserRole;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string | null;
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
