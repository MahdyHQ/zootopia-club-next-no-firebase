import type { AssessmentRequest } from "@zootopia/shared-types";

import { isProfileCompletionRequired } from "@/lib/return-to";
import { apiError, apiSuccess } from "@/lib/server/api";
import { generateAssessment } from "@/lib/server/ai/execution";
import {
  getDocumentByIdForOwner,
  saveAssessmentGeneration,
} from "@/lib/server/repository";
import { getAuthenticatedSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";

function normalizeAssessmentRequest(input: Partial<AssessmentRequest>): AssessmentRequest {
  return {
    documentId: input.documentId || undefined,
    prompt: String(input.prompt || "").trim(),
    questionCount: Math.min(
      10,
      Math.max(2, Number.isFinite(input.questionCount) ? Number(input.questionCount) : 6),
    ),
    difficulty:
      input.difficulty === "easy" ||
      input.difficulty === "medium" ||
      input.difficulty === "hard"
        ? input.difficulty
        : "medium",
    modelId: String(input.modelId || "google-balanced"),
  };
}

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

  let body: Partial<AssessmentRequest>;

  try {
    body = (await request.json()) as Partial<AssessmentRequest>;
  } catch {
    return apiError("INVALID_JSON", "Request body must be valid JSON.", 400);
  }

  const normalized = normalizeAssessmentRequest(body);
  if (!normalized.prompt) {
    return apiError("PROMPT_REQUIRED", "An assessment prompt is required.", 400);
  }

  let documentContext: string | null | undefined;
  if (normalized.documentId) {
    const document = await getDocumentByIdForOwner(normalized.documentId, user.uid);
    if (!document) {
      return apiError("DOCUMENT_NOT_FOUND", "The selected document was not found.", 404);
    }

    documentContext = document.markdown;
  }

  const generation = await generateAssessment({
    ownerUid: user.uid,
    request: normalized,
    documentContext,
  });

  await saveAssessmentGeneration(generation);
  return apiSuccess(generation, 201);
}
