export type DocumentStatus =
  | "received"
  | "processing"
  | "ready"
  | "failed";

export interface DocumentRecord {
  id: string;
  ownerUid: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string | null;
  status: DocumentStatus;
  markdown: string | null;
  extractionEngine: "datalab-convert";
  isActive?: boolean;
  supersededAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UploadResponse {
  document: DocumentRecord;
  warnings: string[];
}
