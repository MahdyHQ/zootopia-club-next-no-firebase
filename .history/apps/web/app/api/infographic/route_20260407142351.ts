import type { InfographicRequest } from "@zootopia/shared-types";

import { isProfileCompletionRequired } from "@/lib/return-to";
import { apiError, apiSuccess } from "@/lib/server/api";
import { generateInfographic } from "@/lib/server/ai/execution";
import {
  getDocumentByIdForOwner,
  saveInfographicGeneration,
} from "@/lib/server/repository";
import { getAuthenticatedSessionContext } from "@/lib/server/session";

export const runtime = "nodejs";

function normalizeInfographicRequest(input: Partial<InfographicRequest>): InfographicRequest {
  return {
    documentId: input.documentId || undefined,
    topic: String(input.topic || "").trim(),
    style:
      input.style === "academic" ||
      input.style === "balanced" ||
      input.style === "bold"
        ? input.style
        : "balanced",
    modelId: String(input.modelId || "google-balanced"),
  };
}

export async function POST(request: Request) {
  const session = await getAuthenticatedSessionContext();
  if (!session) {
    return apiError("UNAUTHENTICATED", "Sign in is required for infographics.", 401);
  }
  if (!session.isAdmin) {
    return apiError("ADMIN_REQUIRED", "Admin access is required for infographics.", 403);
  }

  const user = session.user;
  if (isProfileCompletionRequired(user)) {
    return apiError(
      "PROFILE_INCOMPLETE",
      "Complete your profile in Settings before generating infographics.",
      403,
    );
  }

  let body: Partial<InfographicRequest>;

  try {
    body = (await request.json()) as Partial<InfographicRequest>;
  } catch {
    return apiError("INVALID_JSON", "Request body must be valid JSON.", 400);
  }

  const normalized = normalizeInfographicRequest(body);
  if (!normalized.topic) {
    return apiError("TOPIC_REQUIRED", "An infographic topic is required.", 400);
  }

  let documentContext: string | null | undefined;
  let sourceDocument = null;
  if (normalized.documentId) {
    const document = await getDocumentByIdForOwner(normalized.documentId, user.uid);
    if (!document) {
      return apiError("DOCUMENT_NOT_FOUND", "The selected document was not found.", 404);
    }

    documentContext = document.markdown;
    sourceDocument = {
      id: document.id,
      fileName: document.fileName,
      status: document.status,
    };
  }

  const generation = await generateInfographic({
    ownerUid: user.uid,
    ownerRole: user.role,
    request: normalized,
    documentContext,
    sourceDocument,
  });

  await saveInfographicGeneration(generation);
  return apiSuccess(generation, 201);
}
