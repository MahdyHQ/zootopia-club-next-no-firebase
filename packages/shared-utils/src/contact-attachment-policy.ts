export const CONTACT_ATTACHMENT_MAX_TOTAL_BYTES = 50 * 1024 * 1024;

export const CONTACT_ATTACHMENT_ACCEPT_ATTRIBUTE = ".pdf,.png,.jpg,.jpeg,.webp";

export const CONTACT_ATTACHMENT_ALLOWED_EXTENSIONS = [
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "webp",
] as const;

export const CONTACT_ATTACHMENT_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/x-pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
] as const;

export type ContactAttachmentDescriptor = {
  fileName: string;
  mimeType?: string | null;
  sizeBytes: number;
};

export type ContactAttachmentValidationCode =
  | "ATTACHMENT_NAME_REQUIRED"
  | "ATTACHMENT_EMPTY"
  | "ATTACHMENT_TOTAL_TOO_LARGE"
  | "ATTACHMENT_TYPE_UNSUPPORTED";

export type ContactAttachmentBatchValidationResult =
  | {
      ok: true;
      totalSizeBytes: number;
    }
  | {
      ok: false;
      code: ContactAttachmentValidationCode;
    };

const GENERIC_CONTACT_ATTACHMENT_MIME_TYPES = new Set([
  "",
  "application/octet-stream",
  "binary/octet-stream",
]);

const CONTACT_ATTACHMENT_EXTENSION_TO_ALLOWED_MIME_TYPES: Record<
  (typeof CONTACT_ATTACHMENT_ALLOWED_EXTENSIONS)[number],
  Set<string>
> = {
  pdf: new Set(["application/pdf", "application/x-pdf"]),
  png: new Set(["image/png"]),
  jpg: new Set(["image/jpeg", "image/jpg"]),
  jpeg: new Set(["image/jpeg", "image/jpg"]),
  webp: new Set(["image/webp"]),
};

const CONTACT_ATTACHMENT_EXTENSION_TO_CANONICAL_MIME_TYPE: Record<
  (typeof CONTACT_ATTACHMENT_ALLOWED_EXTENSIONS)[number],
  string
> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export function normalizeContactAttachmentExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase()?.trim() || "";
}

export function normalizeContactAttachmentMimeType(value: string | null | undefined) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "image/jpg") {
    return "image/jpeg";
  }

  if (normalized === "application/x-pdf") {
    return "application/pdf";
  }

  return normalized;
}

export function resolveContactAttachmentMimeType(input: {
  fileName: string;
  mimeType?: string | null;
}) {
  const normalizedMimeType = normalizeContactAttachmentMimeType(input.mimeType);
  if (
    normalizedMimeType &&
    !GENERIC_CONTACT_ATTACHMENT_MIME_TYPES.has(normalizedMimeType)
  ) {
    return normalizedMimeType;
  }

  const extension = normalizeContactAttachmentExtension(input.fileName);
  return CONTACT_ATTACHMENT_EXTENSION_TO_CANONICAL_MIME_TYPE[
    extension as keyof typeof CONTACT_ATTACHMENT_EXTENSION_TO_CANONICAL_MIME_TYPE
  ] ?? null;
}

export function validateContactAttachmentBatch(
  inputs: readonly ContactAttachmentDescriptor[],
): ContactAttachmentBatchValidationResult {
  let totalSizeBytes = 0;

  for (const input of inputs) {
    if (!input.fileName.trim()) {
      return { ok: false, code: "ATTACHMENT_NAME_REQUIRED" };
    }

    const sizeBytes = Math.trunc(input.sizeBytes);
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      return { ok: false, code: "ATTACHMENT_EMPTY" };
    }

    totalSizeBytes += sizeBytes;
    if (totalSizeBytes > CONTACT_ATTACHMENT_MAX_TOTAL_BYTES) {
      return { ok: false, code: "ATTACHMENT_TOTAL_TOO_LARGE" };
    }

    const extension = normalizeContactAttachmentExtension(input.fileName);
    const allowedMimeTypes = CONTACT_ATTACHMENT_EXTENSION_TO_ALLOWED_MIME_TYPES[
      extension as keyof typeof CONTACT_ATTACHMENT_EXTENSION_TO_ALLOWED_MIME_TYPES
    ];
    if (!allowedMimeTypes) {
      return { ok: false, code: "ATTACHMENT_TYPE_UNSUPPORTED" };
    }

    const normalizedMimeType = normalizeContactAttachmentMimeType(input.mimeType);
    if (
      normalizedMimeType &&
      !GENERIC_CONTACT_ATTACHMENT_MIME_TYPES.has(normalizedMimeType) &&
      !allowedMimeTypes.has(normalizedMimeType)
    ) {
      return { ok: false, code: "ATTACHMENT_TYPE_UNSUPPORTED" };
    }
  }

  return {
    ok: true,
    totalSizeBytes,
  };
}
