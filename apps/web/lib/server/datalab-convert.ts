import "server-only";

import { normalizeUploadExtension } from "@zootopia/shared-utils";

function normalizeTextDocument(fileName: string, body: string) {
  const trimmed = body.trim();
  if (!trimmed) {
    return `# ${fileName}\n\nThe uploaded file was empty after extraction.`;
  }

  return `# ${fileName}\n\n${trimmed}`;
}

function buildFallbackMarkdown(input: {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  extension: string;
}) {
  if (input.extension === "txt" || input.extension === "csv") {
    return null;
  }

  if (["png", "jpg", "jpeg", "webp"].includes(input.extension)) {
    return [
      `# ${input.fileName}`,
      "",
      "Image upload received.",
      "",
      "- Visual extraction will be improved when the Datalab pipeline is configured.",
      `- MIME type: ${input.mimeType}`,
      `- Size: ${input.sizeBytes} bytes`,
    ].join("\n");
  }

  return [
    `# ${input.fileName}`,
    "",
    "Structured extraction placeholder created.",
    "",
    "- Datalab Convert can replace this fallback when server runtime credentials are configured.",
    `- MIME type: ${input.mimeType}`,
    `- Extension: ${input.extension}`,
  ].join("\n");
}

export async function convertDocumentToMarkdown(input: {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  buffer: Buffer;
}): Promise<{ markdown: string; warnings: string[] }> {
  const warnings: string[] = [];
  const extension = normalizeUploadExtension(input.fileName);

  if (extension === "txt" || extension === "csv") {
    return {
      markdown: normalizeTextDocument(
        input.fileName,
        input.buffer.toString("utf8"),
      ),
      warnings,
    };
  }

  const convertUrl = process.env.DATALAB_CONVERT_URL;
  const apiKey = process.env.DATALAB_API_KEY;

  if (convertUrl && apiKey) {
    try {
      const response = await fetch(convertUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": input.mimeType || "application/octet-stream",
          "X-Zootopia-File-Name": encodeURIComponent(input.fileName),
        },
        body: new Uint8Array(input.buffer),
      });

      if (response.ok) {
        const payload = (await response.json()) as {
          markdown?: string;
          text?: string;
          warnings?: string[];
        };
        const extracted = String(
          payload.markdown || payload.text || "",
        ).trim();

        if (payload.warnings?.length) {
          warnings.push(...payload.warnings);
        }

        if (extracted) {
          return {
            markdown: `# ${input.fileName}\n\n${extracted}`,
            warnings,
          };
        }

        warnings.push(
          "Datalab Convert returned no markdown payload. Using local fallback extraction instead.",
        );
      } else {
        warnings.push(
          `Datalab Convert returned HTTP ${response.status}. Using local fallback extraction instead.`,
        );
      }
    } catch {
      warnings.push(
        "Datalab Convert request failed in this runtime. Using local fallback extraction instead.",
      );
    }
  } else {
    warnings.push(
      "Datalab Convert credentials are not configured in this runtime. Using local fallback extraction instead.",
    );
  }

  return {
    markdown:
      buildFallbackMarkdown({
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        extension,
      }) || normalizeTextDocument(input.fileName, input.buffer.toString("utf8")),
    warnings,
  };
}
