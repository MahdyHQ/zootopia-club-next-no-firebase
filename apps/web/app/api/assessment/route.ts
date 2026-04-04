import {
  getDefaultModelForTool,
  isModelSupportedForTool,
  toCanonicalToolModelId,
} from "@zootopia/shared-config";
import type { AssessmentRequestInput } from "@zootopia/shared-types";
import { validateAssessmentRequest } from "@zootopia/shared-utils";

import { isProfileCompletionRequired } from "@/lib/return-to";
import { apiError, apiSuccess } from "@/lib/server/api";
import {
  AssessmentExecutionError,
  generateAssessment,
} from "@/lib/server/ai/execution";
import { persistAssessmentResultArtifact } from "@/lib/server/assessment-artifact-storage";
import { resolveAssessmentLinkedDocumentInput } from "@/lib/server/assessment-linked-document";
import {
  appendAdminLog,
  getDocumentByIdForOwner,
  saveAssessmentGeneration,
} from "@/lib/server/repository";
import { getAuthenticatedSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getAuthenticatedSessionUser();
  if (!user) {
    return apiError("UNAUTHENTICATED", "Sign in is required for assessments.", 401);
  }
  if (isProfileCompletionRequired(user)) {
    return apiError(
      "PROFILE_INCOMPLETE",
      "Complete your profile in Settings before generating assessments.",
      403,
    );
  }

  let body: AssessmentRequestInput;

  try {
    body = (await request.json()) as AssessmentRequestInput;
  } catch {
    return apiError("INVALID_JSON", "Request body must be valid JSON.", 400);
  }

  const defaultModel = getDefaultModelForTool("assessment");
  const validation = validateAssessmentRequest(body, {
    defaultModelId: defaultModel.id,
    normalizeModelId: (modelId) => toCanonicalToolModelId("assessment", modelId),
    isModelSupported: (modelId) => isModelSupportedForTool("assessment", modelId),
  });
  if (!validation.ok) {
    return apiError(
      "INVALID_ASSESSMENT_REQUEST",
      validation.message,
      400,
      Object.fromEntries(
        Object.entries(validation.fieldErrors).filter(([, value]) => Boolean(value)),
      ),
    );
  }

  const normalized = validation.value;
  let documentContext: string | null | undefined;
  let sourceDocument = null;
  let inputMode: "prompt-only" | "text-context" | "pdf-file" = "prompt-only";
  let directFile: { fileName: string; mimeType: string; buffer: Buffer } | undefined;
  if (normalized.documentId) {
    const document = await getDocumentByIdForOwner(normalized.documentId, user.uid);
    if (!document) {
      return apiError("DOCUMENT_NOT_FOUND", "The selected document was not found.", 404);
    }

    if (document.status !== "ready") {
      return apiError(
        "DOCUMENT_NOT_READY",
        "The selected document is still processing. Wait until extraction finishes before generating an assessment.",
        409,
      );
    }

    const resolvedDocument = await resolveAssessmentLinkedDocumentInput({
      document,
      modelId: normalized.modelId,
    });

    if (!resolvedDocument) {
      return apiError(
        "DOCUMENT_CONTEXT_UNAVAILABLE",
        "The selected document does not expose a usable generation context for the selected model yet.",
        409,
      );
    }

    documentContext = resolvedDocument.documentContext;
    sourceDocument = resolvedDocument.sourceDocument;
    inputMode = resolvedDocument.inputMode;
    directFile = resolvedDocument.directFile;
  }

  let generation: Awaited<ReturnType<typeof generateAssessment>>;

  try {
    generation = await generateAssessment({
      ownerUid: user.uid,
      ownerRole: user.role,
      request: normalized,
      documentContext,
      sourceDocument,
      inputMode,
      directFile,
    });
  } catch (error) {
    if (error instanceof AssessmentExecutionError) {
      return apiError(error.code, error.message, error.status);
    }

    console.error("Assessment generation failed unexpectedly.", error);
    return apiError(
      "ASSESSMENT_GENERATION_FAILED",
      "The assessment could not be generated right now.",
      500,
    );
  }

  const baseGeneration = {
    ...generation,
    ownerRole: user.role,
  };
  const resultArtifact = await persistAssessmentResultArtifact(baseGeneration);
  const savedGeneration = await saveAssessmentGeneration({
    ...baseGeneration,
    artifacts: resultArtifact
      ? {
          ...(baseGeneration.artifacts ?? {}),
          [resultArtifact.key]: resultArtifact,
        }
      : baseGeneration.artifacts,
  });

  await appendAdminLog({
    actorUid: user.uid,
    actorRole: user.role,
    ownerUid: user.uid,
    ownerRole: user.role,
    action: "assessment-generated",
    resourceType: "assessment",
    resourceId: savedGeneration.id,
    route: "/api/assessment",
    metadata: {
      inputMode,
      modelId: savedGeneration.modelId,
    },
  });

  return apiSuccess(savedGeneration, 201);
}
