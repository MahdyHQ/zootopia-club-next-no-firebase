import {
  getDefaultModelForTool,
  isModelSupportedForTool,
  toCanonicalToolModelId,
} from "@zootopia/shared-config";
import type {
  ApiFieldErrors,
  AssessmentCreateResponse,
  AssessmentRequestInput,
} from "@zootopia/shared-types";
import { validateAssessmentRequest } from "@zootopia/shared-utils";
import { createHash } from "node:crypto";

import { isProfileCompletionRequired } from "@/lib/return-to";
import { apiError, apiSuccess } from "@/lib/server/api";
import {
  AssessmentExecutionError,
  generateAssessment,
} from "@/lib/server/ai/execution";
import {
  deleteAssessmentArtifact,
  persistAssessmentResultArtifact,
} from "@/lib/server/assessment-artifact-storage";
import { resolveAssessmentLinkedDocumentInput } from "@/lib/server/assessment-linked-document";
import {
  appendAdminLog,
  beginAssessmentGenerationIdempotency,
  clearAssessmentGenerationIdempotencyLock,
  completeAssessmentGenerationIdempotency,
  getDocumentByIdForOwner,
  releaseAssessmentDailyCreditReservation,
  reserveAssessmentDailyCreditAttempt,
  saveAssessmentGenerationWithCreditCommit,
  type AssessmentGenerationIdempotencyToken,
} from "@/lib/server/repository";
import { getAuthenticatedSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";

const ASSESSMENT_IDEMPOTENCY_KEY_MAX_LENGTH = 200;
const ASSESSMENT_ROUTE = "/api/assessment" as const;
const ASSESSMENT_FLOW = "assessment-create" as const;

type AssessmentSessionLane = "anonymous" | "admin" | "user";
type AssessmentRequestLane =
  | "assessment-anonymous-route"
  | "assessment-admin-route"
  | "assessment-user-route";

function resolveSessionLane(
  user: Awaited<ReturnType<typeof getAuthenticatedSessionUser>> | null,
): AssessmentSessionLane {
  if (!user) {
    return "anonymous";
  }

  if (user.role === "admin") {
    return "admin";
  }

  return "user";
}

function resolveRequestLane(sessionLane: AssessmentSessionLane): AssessmentRequestLane {
  if (sessionLane === "admin") {
    return "assessment-admin-route";
  }

  if (sessionLane === "user") {
    return "assessment-user-route";
  }

  return "assessment-anonymous-route";
}

function summarizeOwnerUid(ownerUid: string | undefined) {
  if (!ownerUid) {
    return undefined;
  }

  if (ownerUid.length <= 8) {
    return ownerUid;
  }

  return `${ownerUid.slice(0, 8)}...`;
}

function buildAssessmentDiagnosticFieldErrors(context: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production") {
    return undefined;
  }

  const diagnosticFieldErrors: ApiFieldErrors = {};

  for (const [key, value] of Object.entries(context)) {
    if (value == null || value === "") {
      continue;
    }

    if (key === "ownerUid") {
      const ownerUidHint = summarizeOwnerUid(String(value));
      if (ownerUidHint) {
        diagnosticFieldErrors["diagnostic.ownerUid"] = ownerUidHint;
      }
      continue;
    }

    if (typeof value === "string") {
      diagnosticFieldErrors[`diagnostic.${key}`] = value;
      continue;
    }

    diagnosticFieldErrors[`diagnostic.${key}`] = JSON.stringify(value);
  }

  return Object.keys(diagnosticFieldErrors).length > 0
    ? diagnosticFieldErrors
    : undefined;
}

function respondAssessmentError(input: {
  code: string;
  message: string;
  status: number;
  context: Record<string, unknown>;
  fieldErrors?: ApiFieldErrors;
}) {
  const diagnosticFieldErrors = buildAssessmentDiagnosticFieldErrors(input.context);
  const mergedFieldErrors = input.fieldErrors || diagnosticFieldErrors
    ? {
        ...(input.fieldErrors ?? {}),
        ...(diagnosticFieldErrors ?? {}),
      }
    : undefined;

  return apiError(input.code, input.message, input.status, mergedFieldErrors);
}

function readAssessmentIdempotencyKey(request: Request) {
  const raw =
    request.headers.get("idempotency-key")
    ?? request.headers.get("x-idempotency-key");
  if (!raw) {
    return null;
  }

  const normalized = raw.trim();
  if (!normalized) {
    return null;
  }

  if (normalized.length > ASSESSMENT_IDEMPOTENCY_KEY_MAX_LENGTH) {
    return "INVALID_LENGTH" as const;
  }

  return normalized;
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([entryKey, entryValue]) =>
          `${JSON.stringify(entryKey)}:${stableSerialize(entryValue)}`,
      )
      .join(",")}}`;
  }

  return JSON.stringify(value) ?? "null";
}

function buildAssessmentRequestFingerprint(input: {
  ownerUid: string;
  normalizedRequest: unknown;
}) {
  return createHash("sha256")
    .update(
      stableSerialize({
        ownerUid: input.ownerUid,
        request: input.normalizedRequest,
      }),
    )
    .digest("hex");
}

function buildDeterministicAssessmentGenerationId(input: {
  ownerUid: string;
  idempotencyKey: string;
}) {
  const hash = createHash("sha256")
    .update(`${input.ownerUid}:${input.idempotencyKey}`)
    .digest("hex");

  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

export async function POST(request: Request) {
  const anonymousSessionLane = resolveSessionLane(null);
  const anonymousRequestLane = resolveRequestLane(anonymousSessionLane);
  const user = await getAuthenticatedSessionUser();
  if (!user) {
    return respondAssessmentError({
      code: "UNAUTHENTICATED",
      message: "Sign in is required for assessments.",
      status: 401,
      context: {
        layer: "session",
        subsystem: "assessment-route",
        operation: "get-authenticated-session-user",
        route: ASSESSMENT_ROUTE,
        flow: ASSESSMENT_FLOW,
        sessionLane: anonymousSessionLane,
        requestLane: anonymousRequestLane,
      },
    });
  }

  const sessionLane = resolveSessionLane(user);
  const requestLane = resolveRequestLane(sessionLane);
  const baseDiagnosticContext = {
    route: ASSESSMENT_ROUTE,
    flow: ASSESSMENT_FLOW,
    ownerUid: user.uid,
    role: user.role,
    sessionLane,
    requestLane,
  };

  if (isProfileCompletionRequired(user)) {
    return respondAssessmentError({
      code: "PROFILE_INCOMPLETE",
      message: "Complete your profile in Settings before generating assessments.",
      status: 403,
      context: {
        ...baseDiagnosticContext,
        layer: "session",
        subsystem: "assessment-route",
        operation: "enforce-profile-completion",
      },
    });
  }

  /* Assessment generation is intentionally user-lane-only. Admin paths stay isolated
     under explicit admin route handlers so role boundaries remain auditable. */
  if (user.role !== "user") {
    return respondAssessmentError({
      code: "ASSESSMENT_USER_LANE_REQUIRED",
      message: "Assessment generation is available only from the user lane.",
      status: 403,
      context: {
        ...baseDiagnosticContext,
        layer: "session",
        subsystem: "assessment-route",
        operation: "enforce-user-lane",
      },
    });
  }

  let body: AssessmentRequestInput;

  try {
    body = (await request.json()) as AssessmentRequestInput;
  } catch {
    return respondAssessmentError({
      code: "INVALID_JSON",
      message: "Request body must be valid JSON.",
      status: 400,
      context: {
        ...baseDiagnosticContext,
        layer: "request",
        subsystem: "assessment-route",
        operation: "parse-request-json",
      },
    });
  }

  const defaultModel = getDefaultModelForTool("assessment");
  const validation = validateAssessmentRequest(body, {
    defaultModelId: defaultModel.id,
    normalizeModelId: (modelId) => toCanonicalToolModelId("assessment", modelId),
    isModelSupported: (modelId) => isModelSupportedForTool("assessment", modelId),
  });
  if (!validation.ok) {
    return respondAssessmentError({
      code: "INVALID_ASSESSMENT_REQUEST",
      message: validation.message,
      status: 400,
      fieldErrors: Object.fromEntries(
        Object.entries(validation.fieldErrors).filter(([, value]) => Boolean(value)),
      ),
      context: {
        ...baseDiagnosticContext,
        layer: "request",
        subsystem: "assessment-route",
        operation: "validate-assessment-request",
      },
    });
  }

  const normalized = validation.value;
  const canonicalModelId = toCanonicalToolModelId("assessment", normalized.modelId);
  const requestIdempotencyKey = readAssessmentIdempotencyKey(request);
  if (requestIdempotencyKey === "INVALID_LENGTH") {
    return respondAssessmentError({
      code: "ASSESSMENT_IDEMPOTENCY_KEY_INVALID",
      message: "Idempotency-Key must be 200 characters or fewer.",
      status: 400,
      context: {
        ...baseDiagnosticContext,
        layer: "request",
        subsystem: "assessment-route",
        operation: "validate-idempotency-key",
        modelId: normalized.modelId,
        canonicalModelId,
      },
    });
  }

  let idempotencyToken: AssessmentGenerationIdempotencyToken | null = null;
  let deterministicGenerationId: string | undefined;
  let documentContext: string | null | undefined;
  let sourceDocument = null;
  let inputMode: "prompt-only" | "text-context" | "pdf-file" = "prompt-only";
  let directFile: { fileName: string; mimeType: string; buffer: Buffer } | undefined;

  if (normalized.documentId) {
    const document = await getDocumentByIdForOwner(normalized.documentId, user.uid);
    if (!document) {
      return respondAssessmentError({
        code: "DOCUMENT_NOT_FOUND",
        message: "The selected document was not found.",
        status: 404,
        context: {
          ...baseDiagnosticContext,
          layer: "request",
          subsystem: "linked-document",
          operation: "load-owner-document",
          modelId: normalized.modelId,
          canonicalModelId,
          documentId: normalized.documentId,
        },
      });
    }

    if (document.status !== "ready") {
      return respondAssessmentError({
        code: "DOCUMENT_NOT_READY",
        message:
          "The selected document is still processing. Wait until extraction finishes before generating an assessment.",
        status: 409,
        context: {
          ...baseDiagnosticContext,
          layer: "request",
          subsystem: "linked-document",
          operation: "enforce-ready-document",
          modelId: normalized.modelId,
          canonicalModelId,
          documentId: normalized.documentId,
          documentStatus: document.status,
        },
      });
    }

    const resolvedDocument = await resolveAssessmentLinkedDocumentInput({
      document,
      modelId: normalized.modelId,
    });

    if (!resolvedDocument) {
      return respondAssessmentError({
        code: "DOCUMENT_CONTEXT_UNAVAILABLE",
        message:
          "The selected document does not expose a usable generation context for the selected model yet.",
        status: 409,
        context: {
          ...baseDiagnosticContext,
          layer: "request",
          subsystem: "linked-document",
          operation: "resolve-linked-document-input",
          modelId: normalized.modelId,
          canonicalModelId,
          documentId: normalized.documentId,
        },
      });
    }

    documentContext = resolvedDocument.documentContext;
    sourceDocument = resolvedDocument.sourceDocument;
    inputMode = resolvedDocument.inputMode;
    directFile = resolvedDocument.directFile;
  }

  if (requestIdempotencyKey) {
    /* Idempotency is enforced server-side before reservation/model execution to collapse
       browser retries and duplicate submits into one authoritative persisted generation. */
    deterministicGenerationId = buildDeterministicAssessmentGenerationId({
      ownerUid: user.uid,
      idempotencyKey: requestIdempotencyKey,
    });
    const idempotencyResult = await beginAssessmentGenerationIdempotency({
      user: {
        uid: user.uid,
        role: user.role,
      },
      idempotencyKeyHash: createHash("sha256")
        .update(requestIdempotencyKey)
        .digest("hex"),
      requestFingerprint: buildAssessmentRequestFingerprint({
        ownerUid: user.uid,
        normalizedRequest: normalized,
      }),
      generationId: deterministicGenerationId,
    });

    if (idempotencyResult.status === "replay") {
      return apiSuccess<AssessmentCreateResponse>({
        generation: idempotencyResult.generation,
        credits: idempotencyResult.credits,
      });
    }

    if (idempotencyResult.status === "in-progress") {
      return respondAssessmentError({
        code: "ASSESSMENT_REQUEST_IN_PROGRESS",
        message: "This assessment request is already in progress for the provided idempotency key.",
        status: 409,
        context: {
          ...baseDiagnosticContext,
          layer: "request",
          subsystem: "idempotency",
          operation: "begin-assessment-idempotency",
          modelId: normalized.modelId,
          canonicalModelId,
          idempotencyKeyPresent: "yes",
        },
      });
    }

    if (idempotencyResult.status === "key-conflict") {
      return respondAssessmentError({
        code: "ASSESSMENT_IDEMPOTENCY_KEY_REUSED",
        message: "This idempotency key was already used with a different assessment request.",
        status: 409,
        context: {
          ...baseDiagnosticContext,
          layer: "request",
          subsystem: "idempotency",
          operation: "detect-idempotency-fingerprint-conflict",
          modelId: normalized.modelId,
          canonicalModelId,
          idempotencyKeyPresent: "yes",
        },
      });
    }

    idempotencyToken = idempotencyResult.token;
  }

  /* Daily credits belong to the verified session user only, and only normal users consume them.
     Keep the reservation on the server right before the model call so invalid forms never touch
     quota state while duplicate in-flight requests still cannot oversubscribe the daily limit. */
  const creditReservation = await reserveAssessmentDailyCreditAttempt({
    uid: user.uid,
    role: user.role,
  });
  if (!creditReservation.ok) {
    if (idempotencyToken) {
      await clearAssessmentGenerationIdempotencyLock({
        token: idempotencyToken,
      }).catch(() => undefined);
    }

    return respondAssessmentError({
      code: creditReservation.code,
      message: creditReservation.message,
      status: creditReservation.status,
      context: {
        ...baseDiagnosticContext,
        layer: "request",
        subsystem: "credits",
        operation: "reserve-assessment-daily-credit",
        modelId: normalized.modelId,
        canonicalModelId,
      },
    });
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
      generationId: deterministicGenerationId,
      sessionLane,
      requestLane: "user",
    });
  } catch (error) {
    await releaseAssessmentDailyCreditReservation({
      user: {
        uid: user.uid,
        role: user.role,
      },
      reservation: creditReservation.reservation,
    });

    if (idempotencyToken) {
      await clearAssessmentGenerationIdempotencyLock({
        token: idempotencyToken,
      }).catch(() => undefined);
    }

    if (error instanceof AssessmentExecutionError) {
      const executionContext = {
        ...baseDiagnosticContext,
        layer: error.context.layer,
        subsystem: error.context.subsystem,
        operation: error.context.operation,
        modelId: error.context.modelId ?? normalized.modelId,
        canonicalModelId: error.context.canonicalModelId ?? canonicalModelId,
        provider: error.context.provider,
        providerModelId: error.context.providerModelId,
        inputMode,
        upstreamStatus: error.context.upstreamStatus,
        upstreamCode: error.context.upstreamCode,
        upstreamType: error.context.upstreamType,
      };

      console.warn("Assessment generation provider/runtime failure.", {
        code: error.code,
        status: error.status,
        ...executionContext,
      });

      return respondAssessmentError({
        code: error.code,
        message: error.message,
        status: error.status,
        context: executionContext,
      });
    }

    console.error("Assessment generation failed unexpectedly.", error);
    return respondAssessmentError({
      code: "ASSESSMENT_GENERATION_FAILED",
      message: "The assessment could not be generated right now.",
      status: 500,
      context: {
        ...baseDiagnosticContext,
        layer: "provider-execution",
        subsystem: "assessment-route",
        operation: "generate-assessment",
        modelId: normalized.modelId,
        canonicalModelId,
        inputMode,
      },
    });
  }

  const baseGeneration = {
    ...generation,
    ownerRole: user.role,
  };
  let resultArtifact: Awaited<ReturnType<typeof persistAssessmentResultArtifact>> = null;

  try {
    resultArtifact = await persistAssessmentResultArtifact(baseGeneration);
    const savedGeneration = await saveAssessmentGenerationWithCreditCommit({
      generation: {
        ...baseGeneration,
        artifacts: resultArtifact
          ? {
              ...(baseGeneration.artifacts ?? {}),
              [resultArtifact.key]: resultArtifact,
            }
          : baseGeneration.artifacts,
      },
      user: {
        uid: user.uid,
        role: user.role,
      },
      reservation: creditReservation.reservation,
    });

    if (idempotencyToken) {
      await completeAssessmentGenerationIdempotency({
        token: idempotencyToken,
        generation: {
          id: savedGeneration.generation.id,
          ownerUid: savedGeneration.generation.ownerUid,
          expiresAt: savedGeneration.generation.expiresAt,
        },
      }).catch((completionError) => {
        console.error(
          "Assessment idempotency completion failed unexpectedly.",
          completionError,
        );
      });
    }

    await appendAdminLog({
      actorUid: user.uid,
      actorRole: user.role,
      ownerUid: user.uid,
      ownerRole: user.role,
      action: "assessment-generated",
      resourceType: "assessment",
      resourceId: savedGeneration.generation.id,
      route: "/api/assessment",
      metadata: {
        inputMode,
        modelId: savedGeneration.generation.modelId,
        dailyCreditsRemaining: savedGeneration.credits.remainingCount ?? "admin-exempt",
      },
    });

    return apiSuccess<AssessmentCreateResponse>(savedGeneration, 201);
  } catch (error) {
    await releaseAssessmentDailyCreditReservation({
      user: {
        uid: user.uid,
        role: user.role,
      },
      reservation: creditReservation.reservation,
    });

    if (idempotencyToken) {
      await clearAssessmentGenerationIdempotencyLock({
        token: idempotencyToken,
      }).catch(() => undefined);
    }

     /* Artifact writes happen before the final repository commit so the saved generation never
       points at a missing canonical result. If the durable save or credit commit fails, clean up
       the orphaned artifact best-effort and report failure without consuming a credit. */
    if (resultArtifact) {
      await deleteAssessmentArtifact(resultArtifact, user.uid);
    }

    if (error instanceof Error && error.message === "ASSESSMENT_ACCESS_DISABLED") {
      return apiError(
        "ASSESSMENT_ACCESS_DISABLED",
        "Assessment generation is disabled for this account.",
        403,
      );
    }

    console.error("Assessment finalization failed unexpectedly.", error);
    return apiError(
      "ASSESSMENT_FINALIZATION_FAILED",
      "The assessment finished, but it could not be finalized safely. No daily credit was used.",
      500,
    );
  }
}
