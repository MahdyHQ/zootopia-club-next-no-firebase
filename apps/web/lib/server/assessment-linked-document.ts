import "server-only";

import type {
  AssessmentGenerationSourceDocument,
  AssessmentInputMode,
  DocumentRecord,
} from "@zootopia/shared-types";

import { getAssessmentModelCapabilities } from "@/lib/server/ai/provider-runtime";
import { loadDocumentBinaryFromStorage } from "@/lib/server/document-runtime";
import { prepareAssessmentDocumentContext } from "@/lib/server/assessment-records";

export interface AssessmentDirectFileInput {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}

export interface ResolvedAssessmentLinkedDocument {
  sourceDocument: AssessmentGenerationSourceDocument;
  inputMode: Exclude<AssessmentInputMode, "prompt-only">;
  documentContext?: string | null;
  directFile?: AssessmentDirectFileInput;
}

export function buildAssessmentSourceDocument(
  document: Pick<DocumentRecord, "id" | "fileName" | "status">,
): AssessmentGenerationSourceDocument {
  return {
    id: document.id,
    fileName: document.fileName,
    status: document.status,
  };
}

export async function resolveAssessmentLinkedDocumentInput(input: {
  document: DocumentRecord;
  modelId: string;
}): Promise<ResolvedAssessmentLinkedDocument | null> {
  const capabilities = getAssessmentModelCapabilities(input.modelId);
  const sourceDocument = buildAssessmentSourceDocument(input.document);
  const normalizedMimeType = input.document.mimeType.toLowerCase();

  if (capabilities.supportsPdfFile && normalizedMimeType === "application/pdf") {
    const buffer = await loadDocumentBinaryFromStorage(input.document);
    if (buffer) {
      return {
        sourceDocument,
        inputMode: "pdf-file",
        directFile: {
          fileName: input.document.fileName,
          mimeType: input.document.mimeType,
          buffer,
        },
      };
    }
  }

  if (capabilities.supportsTextContext) {
    const documentContext = prepareAssessmentDocumentContext(input.document.markdown);
    if (documentContext) {
      return {
        sourceDocument,
        inputMode: "text-context",
        documentContext,
      };
    }
  }

  return null;
}
