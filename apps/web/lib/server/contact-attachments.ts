import "server-only";

import {
  resolveContactAttachmentMimeType,
  type ContactAttachmentValidationCode,
  validateContactAttachmentBatch,
} from "@zootopia/shared-utils";

export type ContactMailAttachment = {
  fileName: string;
  contentType: string;
  sizeBytes: number;
  content: Buffer;
};

export class ContactAttachmentValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "ContactAttachmentValidationError";
  }
}

function sanitizeContactAttachmentFileName(fileName: string) {
  const baseName =
    fileName
      .replace(/\\/g, "/")
      .split("/")
      .filter(Boolean)
      .at(-1) ?? "attachment";

  const sanitized = baseName
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/["<>:*?|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  return sanitized.slice(0, 180) || "attachment";
}

function bufferStartsWith(buffer: Buffer, bytes: readonly number[]) {
  return bytes.every((byte, index) => buffer[index] === byte);
}

function matchesContactAttachmentMagic(input: {
  contentType: string;
  content: Buffer;
}) {
  if (input.contentType === "application/pdf") {
    return (
      input.content.length >= 5 &&
      input.content.subarray(0, 5).toString("ascii") === "%PDF-"
    );
  }

  if (input.contentType === "image/png") {
    return (
      input.content.length >= 8 &&
      bufferStartsWith(input.content, [
        0x89,
        0x50,
        0x4e,
        0x47,
        0x0d,
        0x0a,
        0x1a,
        0x0a,
      ])
    );
  }

  if (input.contentType === "image/jpeg") {
    return (
      input.content.length >= 3 &&
      bufferStartsWith(input.content, [0xff, 0xd8, 0xff])
    );
  }

  if (input.contentType === "image/webp") {
    return (
      input.content.length >= 12 &&
      input.content.subarray(0, 4).toString("ascii") === "RIFF" &&
      input.content.subarray(8, 12).toString("ascii") === "WEBP"
    );
  }

  return false;
}

function toContactAttachmentValidationError(code: ContactAttachmentValidationCode) {
  if (code === "ATTACHMENT_TOTAL_TOO_LARGE") {
    return new ContactAttachmentValidationError(
      "CONTACT_ATTACHMENTS_TOTAL_TOO_LARGE",
      "Total attachment size must stay at or below 50 MB.",
      400,
    );
  }

  if (code === "ATTACHMENT_TYPE_UNSUPPORTED") {
    return new ContactAttachmentValidationError(
      "CONTACT_ATTACHMENT_TYPE_INVALID",
      "Attachments must be PDF, PNG, JPG, JPEG, or WEBP files.",
      400,
    );
  }

  return new ContactAttachmentValidationError(
    "CONTACT_ATTACHMENTS_INVALID",
    "The submitted attachments could not be validated.",
    400,
  );
}

export function extractContactAttachmentFiles(formData: FormData) {
  const files: File[] = [];

  for (const value of formData.getAll("attachments")) {
    if (value instanceof File) {
      if (value.size > 0) {
        files.push(value);
      }
      continue;
    }

    throw new ContactAttachmentValidationError(
      "CONTACT_ATTACHMENTS_INVALID",
      "The submitted attachments could not be validated.",
      400,
    );
  }

  return files;
}

export async function readValidatedContactAttachments(
  files: readonly File[],
): Promise<ContactMailAttachment[]> {
  const validation = validateContactAttachmentBatch(
    files.map((file) => ({
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    })),
  );

  if (!validation.ok) {
    throw toContactAttachmentValidationError(validation.code);
  }

  const attachments: ContactMailAttachment[] = [];

  // Public Contact attachments are intentionally relay-only. Future agents should
  // keep this helper free of storage or database writes so uploaded files do not
  // become durable platform data outside the outgoing email itself.
  for (const file of files) {
    const fileName = sanitizeContactAttachmentFileName(file.name);
    const contentType = resolveContactAttachmentMimeType({
      fileName,
      mimeType: file.type,
    });

    if (!contentType) {
      throw new ContactAttachmentValidationError(
        "CONTACT_ATTACHMENT_TYPE_INVALID",
        "Attachments must be PDF, PNG, JPG, JPEG, or WEBP files.",
        400,
      );
    }

    let content: Buffer;
    try {
      content = Buffer.from(await file.arrayBuffer());
    } catch {
      throw new ContactAttachmentValidationError(
        "CONTACT_ATTACHMENTS_INVALID",
        "The submitted attachments could not be read.",
        400,
      );
    }

    if (content.byteLength !== file.size || !matchesContactAttachmentMagic({
      contentType,
      content,
    })) {
      throw new ContactAttachmentValidationError(
        "CONTACT_ATTACHMENT_BODY_INVALID",
        "The submitted attachments did not match the allowed file types.",
        400,
      );
    }

    attachments.push({
      fileName,
      contentType,
      sizeBytes: file.size,
      content,
    });
  }

  return attachments;
}
