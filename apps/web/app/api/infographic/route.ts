import {
  isModelSupportedForTool,
  toCanonicalToolModelId,
} from "@zootopia/shared-config";
import type { InfographicRequest } from "@zootopia/shared-types";

import { isProfileCompletionRequired } from "@/lib/return-to";
import { apiError, apiSuccess } from "@/lib/server/api";
import { resolveDefaultModelForTool } from "@/lib/server/ai/default-models";
import { generateInfographic } from "@/lib/server/ai/execution";
import {
  recordInfographicGenerationAccountingDeduction,
  recordInfographicGenerationUsageEvent,
} from "@/lib/server/infographic-tool-accounting";
import {
  appendAdminLog,
  getDocumentByIdForOwner,
  saveInfographicGeneration,
} from "@/lib/server/repository";
import { getAuthenticatedSessionContext } from "@/lib/server/session";

export const runtime = "nodejs";

function normalizeInfographicRequest(
  input: Partial<InfographicRequest>,
  defaultModelId: string,
): InfographicRequest {
  return {
    documentId: input.documentId || undefined,
    topic: String(input.topic || "").trim(),
    style:
      input.style === "academic" ||
      input.style === "balanced" ||
      input.style === "bold"
        ? input.style
        : "balanced",
    modelId: String(input.modelId || defaultModelId).trim(),
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

  const defaultModel = resolveDefaultModelForTool("infographic");
  const normalized = normalizeInfographicRequest(body, defaultModel.id);
  if (!normalized.topic) {
    return apiError("TOPIC_REQUIRED", "An infographic topic is required.", 400);
  }

  const canonicalModelId = toCanonicalToolModelId("infographic", normalized.modelId);
  if (!isModelSupportedForTool("infographic", canonicalModelId)) {
    return apiError(
      "INFOGRAPHIC_MODEL_UNSUPPORTED",
      "Select one of the supported infographic models.",
      400,
    );
  }

  /* Keep infographic model selection validated on the server before execution so unsupported
     client input cannot fall through to the generic catalog helper and silently pick a
     different tool's default model. */
  normalized.modelId = canonicalModelId;

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
  /* Keep infographic writes dual-laned into the central accounting foundation:
     - usage event lane (operational feed)
     - accounting-entry lane (durable deduction/mutation history)
     This keeps global aggregation resilient if one lane is temporarily degraded and ensures
     infographic remains isolated to its own adapter without reusing assessment semantics. */
  try {
    await recordInfographicGenerationAccountingDeduction({
      ownerUid: user.uid,
      ownerEmail: user.email ?? null,
      ownerRole: user.role,
      generation,
      documentId: normalized.documentId ?? null,
      actorUid: user.uid,
      actorEmail: user.email ?? null,
      actorRole: user.role,
    });
  } catch (toolAccountingError) {
    console.warn("Infographic tool-accounting entry write failed (non-fatal).", {
      ownerUid: user.uid,
      generationId: generation.id,
      error:
        toolAccountingError instanceof Error
          ? toolAccountingError.message
          : String(toolAccountingError),
    });
  }
  try {
    await recordInfographicGenerationUsageEvent({
      ownerUid: user.uid,
      ownerEmail: user.email ?? null,
      ownerRole: user.role,
      generation,
      documentId: normalized.documentId ?? null,
    });
  } catch (toolUsageError) {
    console.warn("Infographic tool-usage event write failed (non-fatal).", {
      ownerUid: user.uid,
      generationId: generation.id,
      error: toolUsageError instanceof Error ? toolUsageError.message : String(toolUsageError),
    });
  }
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
      modelId: generation.modelId,
      documentId: normalized.documentId ?? null,
    },
  });
  return apiSuccess(generation, 201);
}
