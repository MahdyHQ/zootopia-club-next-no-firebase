import type { InfographicRequest } from "@zootopia/shared-types";

import { isProfileCompletionRequired } from "@/lib/return-to";
import { apiError, apiSuccess } from "@/lib/server/api";
import { generateInfographic } from "@/lib/server/ai/execution";
import {
  appendAdminLog,
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
    /* Keep privilege-escalation attempts visible in the server audit stream so admin-only
       infographic access cannot silently fail without a trace during incident review. */
    await appendAdminLog({
      actorUid: session.user.uid,
      actorRole: session.user.role,
      ownerUid: session.user.uid,
      ownerRole: session.user.role,
      action: "infographic-admin-access-denied",
      resourceType: "infographic",
      route: "/api/infographic",
      metadata: {
        denyReason: "ADMIN_REQUIRED",
      },
    });
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
  await appendAdminLog({
    actorUid: user.uid,
    actorRole: user.role,
    ownerUid: user.uid,
    ownerRole: user.role,
    action: "infographic-generated",
    resourceType: "infographic",
    resourceId: generation.id,
    route: "/api/infographic",
    metadata: {
      modelId: normalized.modelId,
      documentId: normalized.documentId ?? null,
    },
  });
  return apiSuccess(generation, 201);
}
