import "server-only";

import { normalizeUploadExtension } from "@zootopia/shared-utils";

function normalizeTextDocument(fileName: string, body: string) {
  const trimmed = body.trim();
  if (!trimmed) {
    return `# ${fileName}\n\nThe uploaded file was empty after normalization.`;
  }

  return `# ${fileName}\n\n${trimmed}`;
}

function buildBinaryDocumentSnapshot(input: {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  extension: string;
}) {
  const extension = input.extension || "unknown";
  const normalizedMimeType = input.mimeType || "application/octet-stream";
  const isImage = ["png", "jpg", "jpeg", "webp"].includes(input.extension);

  return [
    `# ${input.fileName}`,
    "",
    isImage ? "Image upload linked successfully." : "Document upload linked successfully.",
    "",
    "The current runtime treats the uploaded file itself as the primary source for generation and keeps this lightweight snapshot for metadata-aware text fallbacks.",
    `- MIME type: ${normalizedMimeType}`,
    `- Extension: ${extension}`,
    `- Size: ${input.sizeBytes} bytes`,
  ].join("\n");
}

export function buildDocumentMarkdownSnapshot(input: {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  buffer: Buffer;
}): { markdown: string; warnings: string[] } {
  const extension = normalizeUploadExtension(input.fileName);

  /* Upload now owns a local, truthful snapshot path for the direct-file runtime.
     Future agents should keep this helper lightweight and must not reintroduce Datalab-branded warnings into the default upload flow. */
  if (extension === "txt" || extension === "csv") {
    return {
      markdown: normalizeTextDocument(input.fileName, input.buffer.toString("utf8")),
      warnings: [],
    };
  }

  return {
    markdown: buildBinaryDocumentSnapshot({
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      extension,
    }),
    warnings: [],
  };
}
