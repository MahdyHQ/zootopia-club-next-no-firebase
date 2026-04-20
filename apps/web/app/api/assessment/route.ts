import {
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
import { resolveDefaultModelForTool } from "@/lib/server/ai/default-models";
import {
  AssessmentExecutionError,
  generateAssessment,
} from "@/lib/server/ai/execution";
import {
  deleteAssessmentArtifact,
  persistAssessmentResultArtifact,
} from "@/lib/server/assessment-artifact-storage";
import {
  createAssessmentCreditTraceId,
  logAssessmentCreditDiagnostic,
} from "@/lib/server/assessment-credit-diagnostics";
import { publishAssessmentCreditLiveUpdate } from "@/lib/server/assessment-credit-live-updates";
import {
  classifyAssessmentFinalizationFailure,
  readPlatformErrorCode,
} from "@/lib/server/assessment-platform-errors";
import { getAssessmentPromptAccessStateForUser } from "@/lib/server/assessment-prompt-lock";
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
import { recordToolUsageEvent } from "@/lib/server/tool-accounting";

export const runtime = "nodejs";
export const maxDuration = 120;

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
  const assessmentCreditTraceId = createAssessmentCreditTraceId();
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

  /* Assessment authorization: admin accounts receive an explicit server-side bypass of
     normal-user generation restrictions (credits, tool-disable, lane gating). Admin
     access is only blocked by a deliberately separate admin-only hard block.
     Normal-user restrictions remain fully intact for non-admins. */
  const isAdmin = user.role === "admin";
  const isAccountActive = user.status === "active";

  /* Structured authorization diagnostic for every assessment request. */
  console.info("[assessment-auth]", {
    event: "assessment-authorization-check",
    route: ASSESSMENT_ROUTE,
    uid: user.uid,
    email: user.email ?? null,
    role: user.role,
    status: user.status,
    isAdmin,
    isAccountActive,
    adminOverrideApplied: isAdmin && isAccountActive,
  });

  /* Admin hard block: only a deliberately separate admin-only deny can stop an admin.
     Currently no admin-only hard block exists, so active admins pass through. */
  if (isAdmin && !isAccountActive) {
    console.warn("[assessment-auth]", {
      event: "assessment-admin-hard-blocked",
      route: ASSESSMENT_ROUTE,
      uid: user.uid,
      role: user.role,
      status: user.status,
      denyReason: "ASSESSMENT_ACCESS_DENIED_ADMIN_HARD_BLOCK",
    });
    return respondAssessmentError({
      code: "ASSESSMENT_ACCESS_DENIED_ADMIN_HARD_BLOCK",
      message: "Assessment access has been explicitly revoked for this admin account.",
      status: 403,
      context: {
        ...baseDiagnosticContext,
        layer: "authorization",
        subsystem: "assessment-route",
        operation: "enforce-admin-active-status",
        denyReason: "ASSESSMENT_ACCESS_DENIED_ADMIN_HARD_BLOCK",
      },
    });
  }

  /* Normal-user lane gate: only applies to non-admin accounts. Admins bypass this check. */
  if (!isAdmin && user.role !== "user") {
    console.warn("[assessment-auth]", {
      event: "assessment-user-lane-required",
      route: ASSESSMENT_ROUTE,
      uid: user.uid,
      role: user.role,
      denyReason: "ASSESSMENT_USER_LANE_REQUIRED",
    });
    return respondAssessmentError({
      code: "ASSESSMENT_USER_LANE_REQUIRED",
      message: "Assessment generation is available only from the user lane.",
      status: 403,
      context: {
        ...baseDiagnosticContext,
        layer: "authorization",
        subsystem: "assessment-route",
        operation: "enforce-user-lane",
        denyReason: "ASSESSMENT_USER_LANE_REQUIRED",
      },
    });
  }

  /* Admin bypass diagnostic: log when admin is allowed through normal-user gates. */
  if (isAdmin) {
    console.info("[assessment-auth]", {
      event: "assessment-admin-bypass-granted",
      route: ASSESSMENT_ROUTE,
      uid: user.uid,
      role: user.role,
      status: user.status,
      allowReason: "ASSESSMENT_ACCESS_ALLOWED_ADMIN_OVERRIDE",
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

  const defaultModel = resolveDefaultModelForTool("assessment");
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
  const promptAccess = await getAssessmentPromptAccessStateForUser({
    uid: user.uid,
    role: user.role,
  });
  if (!promptAccess.unlocked && normalized.prompt) {
    /* Prompt access has two distinct server-owned denial reasons:
       1) admin entitlement is disabled for this account
       2) entitlement exists but the prompt lock has not been opened yet
       Keep those cases separate so the UI can explain the real blocker accurately. */
    const promptLockCode =
      promptAccess.entitlement !== "enabled"
        ? "ASSESSMENT_PROMPT_ENTITLEMENT_REQUIRED"
        : "ASSESSMENT_PROMPT_LOCKED";
    const promptLockMessage =
      promptAccess.entitlement !== "enabled"
        ? "هذه الميزة غير مفعّلة لهذا الحساب حالياً. يرجى التواصل مع الإدارة أو المطوّر ابن عبدالله لتفعيلها."
        : "ميزة طلب التقييم ما زالت مقفلة لهذا الحساب. أدخل كلمة المرور الصحيحة أولاً، أو تواصل مع المطوّر ابن عبدالله إذا كنت بحاجة إلى المساعدة.";

    return respondAssessmentError({
      code: promptLockCode,
      message: promptLockMessage,
      status: 403,
      context: {
        ...baseDiagnosticContext,
        layer: "authorization",
        subsystem: "assessment-prompt-lock",
        operation: "enforce-assessment-prompt-lock",
        promptLength: normalized.prompt.length,
      },
    });
  }

  const canonicalModelId = toCanonicalToolModelId("assessment", normalized.modelId);
  const requestIdempotencyKey = readAssessmentIdempotencyKey(request);
  /* Assessment create requests must carry a logical-attempt key before they can reserve or spend
     credits. Keeping this guard at the route boundary prevents future client regressions from
     silently re-opening duplicate-charge paths when the UI submit flow changes. */
  if (!requestIdempotencyKey) {
    return respondAssessmentError({
      code: "ASSESSMENT_IDEMPOTENCY_KEY_REQUIRED",
      message: "Assessment requests must include an Idempotency-Key header.",
      status: 400,
      context: {
        ...baseDiagnosticContext,
        layer: "request",
        subsystem: "assessment-route",
        operation: "require-idempotency-key",
        modelId: normalized.modelId,
        canonicalModelId,
      },
    });
  }

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
      const linkedDocumentFailureClass =
        document.mimeType.toLowerCase() === "application/pdf" && document.storagePath
          ? "ASSESSMENT_LINKED_DOCUMENT_STORAGE_UNAVAILABLE"
          : "ASSESSMENT_LINKED_DOCUMENT_CONTEXT_UNAVAILABLE";

      console.warn("Assessment linked-document input is unavailable for selected model.", {
        ...baseDiagnosticContext,
        layer: "request",
        subsystem: "linked-document",
        operation: "resolve-linked-document-input",
        modelId: normalized.modelId,
        canonicalModelId,
        documentId: normalized.documentId,
        linkedDocumentFailureClass,
      });

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
          linkedDocumentFailureClass,
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
  /* Pass email so the reservation layer can resolve platform-exemption identity without a
     separate user lookup. Admin bypass is already handled before this call site. */
  const creditReservation = await reserveAssessmentDailyCreditAttempt({
    uid: user.uid,
    role: user.role,
    email: user.email,
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

  const creditLifecycle = {
    reservationRequired: user.role !== "admin",
    reservationReserved: Boolean(creditReservation.reservation),
    reservationReleased: false,
    creditCommitted: false,
  };

  const releaseReservedCredit = async (stage: "execution" | "finalization") => {
    if (!creditReservation.reservation) {
      return;
    }

    try {
      await releaseAssessmentDailyCreditReservation({
        user: {
          uid: user.uid,
          role: user.role,
        },
        reservation: creditReservation.reservation,
      });
      creditLifecycle.reservationReleased = true;
    } catch (releaseError) {
      console.error("Assessment credit reservation release failed unexpectedly.", {
        ...baseDiagnosticContext,
        layer: "credits",
        subsystem: "assessment-route",
        operation: `release-assessment-credit-reservation-${stage}`,
        modelId: normalized.modelId,
        canonicalModelId,
        inputMode,
        releaseError:
          releaseError instanceof Error ? releaseError.message : String(releaseError),
      });
    }
  };

  let generation: Awaited<ReturnType<typeof generateAssessment>>;
  const executionLane: "admin" | "user" = isAdmin ? "admin" : "user";

  /* Attempt lifecycle logs are best-effort observability only. They must never block
     generation, credit release, or idempotency cleanup if logging backends are degraded. */
  await appendAdminLog({
    actorUid: user.uid,
    actorRole: user.role,
    ownerUid: user.uid,
    ownerRole: user.role,
    action: "assessment-generation-started",
    resourceType: "assessment",
    resourceId: deterministicGenerationId ?? undefined,
    route: "/api/assessment",
    metadata: {
      modelId: normalized.modelId,
      canonicalModelId,
      inputMode,
      idempotencyKeyPresent: Boolean(requestIdempotencyKey),
      executionLane,
    },
  }).catch((logError) => {
    console.warn("Assessment start lifecycle log failed unexpectedly.", {
      ...baseDiagnosticContext,
      layer: "audit",
      subsystem: "admin-log",
      operation: "assessment-generation-started",
      modelId: normalized.modelId,
      canonicalModelId,
      inputMode,
      error: logError instanceof Error ? logError.message : String(logError),
    });
  });

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
      sessionLane: executionLane,
      requestLane: executionLane,
    });
  } catch (error) {
    await releaseReservedCredit("execution");

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
        creditLifecycle,
        ...executionContext,
      });

      await appendAdminLog({
        actorUid: user.uid,
        actorRole: user.role,
        ownerUid: user.uid,
        ownerRole: user.role,
        action: "assessment-generation-failed",
        resourceType: "assessment",
        resourceId: deterministicGenerationId ?? undefined,
        route: "/api/assessment",
        metadata: {
          failureCode: error.code,
          failureStatus: error.status,
          modelId: executionContext.modelId ?? normalized.modelId,
          canonicalModelId: executionContext.canonicalModelId ?? canonicalModelId,
          provider: executionContext.provider ?? null,
          providerModelId: executionContext.providerModelId ?? null,
          inputMode,
          upstreamStatus: executionContext.upstreamStatus ?? null,
          upstreamCode: executionContext.upstreamCode ?? null,
          upstreamType: executionContext.upstreamType ?? null,
          creditReservationRequired: creditLifecycle.reservationRequired,
          creditReservationReserved: creditLifecycle.reservationReserved,
          creditReservationReleased: creditLifecycle.reservationReleased,
          creditCommitted: creditLifecycle.creditCommitted,
        },
      }).catch((logError) => {
        console.warn("Assessment failure lifecycle log failed unexpectedly.", {
          ...baseDiagnosticContext,
          layer: "audit",
          subsystem: "admin-log",
          operation: "assessment-generation-failed",
          modelId: normalized.modelId,
          canonicalModelId,
          inputMode,
          error: logError instanceof Error ? logError.message : String(logError),
        });
      });

      return respondAssessmentError({
        code: error.code,
        message: error.message,
        status: error.status,
        context: executionContext,
      });
    }

    console.error("Assessment generation failed unexpectedly.", error);
    await appendAdminLog({
      actorUid: user.uid,
      actorRole: user.role,
      ownerUid: user.uid,
      ownerRole: user.role,
      action: "assessment-generation-failed",
      resourceType: "assessment",
      resourceId: deterministicGenerationId ?? undefined,
      route: "/api/assessment",
      metadata: {
        failureCode: "ASSESSMENT_GENERATION_FAILED",
        failureStatus: 500,
        modelId: normalized.modelId,
        canonicalModelId,
        inputMode,
        creditReservationRequired: creditLifecycle.reservationRequired,
        creditReservationReserved: creditLifecycle.reservationReserved,
        creditReservationReleased: creditLifecycle.reservationReleased,
        creditCommitted: creditLifecycle.creditCommitted,
      },
    }).catch((logError) => {
      console.warn("Assessment generic failure lifecycle log failed unexpectedly.", {
        ...baseDiagnosticContext,
        layer: "audit",
        subsystem: "admin-log",
        operation: "assessment-generation-failed-generic",
        modelId: normalized.modelId,
        canonicalModelId,
        inputMode,
        error: logError instanceof Error ? logError.message : String(logError),
      });
    });

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
  let artifactPersistenceDegraded = false;
  let durableGenerationPersisted = false;

  /* Canonical-result storage is an optimization layer for future cache hits/export reuse.
     The durable assessment record + credit commit remain the source of truth, so a transient
     storage write failure must not discard an already successful model generation. */
  try {
    resultArtifact = await persistAssessmentResultArtifact(baseGeneration);
  } catch (artifactError) {
    artifactPersistenceDegraded = true;
    console.warn("Assessment canonical-result artifact persistence failed; continuing finalization without cached artifact.", {
      ...baseDiagnosticContext,
      layer: "artifact",
      subsystem: "artifact-storage",
      operation: "persist-assessment-result-artifact",
      modelId: normalized.modelId,
      canonicalModelId,
      inputMode,
      error: artifactError instanceof Error ? artifactError.message : String(artifactError),
    });
  }

  try {
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
        email: user.email ?? null,
      },
      reservation: creditReservation.reservation,
    });
    durableGenerationPersisted = true;
    creditLifecycle.creditCommitted = true;

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

    let creditRealtimeBroadcastStatus: string | null = null;
    let creditRealtimeBroadcastErrorCode: string | null = null;

    /* Assessment generation changes the same server-owned balance that admin mutations change.
       Publish the same owner-scoped invalidation signal after the durable credit commit so other
       tabs for this user refetch canonical `/api/assessment/credits` instead of waiting on
       focus/poll heuristics or trying to infer a local balance delta. */
    try {
      const liveUpdate = await publishAssessmentCreditLiveUpdate({
        ownerUid: user.uid,
        credits: savedGeneration.credits,
        reason: "assessment-route:credit-commit",
        traceId: assessmentCreditTraceId,
      });
      creditRealtimeBroadcastStatus = liveUpdate.broadcast.status;
      creditRealtimeBroadcastErrorCode = liveUpdate.broadcast.errorCode;
      logAssessmentCreditDiagnostic({
        event: "assessment_credit_assessment_route_publish_result",
        traceId: assessmentCreditTraceId,
        details: {
          ownerUid: user.uid,
          generationId: savedGeneration.generation.id,
          route: ASSESSMENT_ROUTE,
          status: creditRealtimeBroadcastStatus,
          errorCode: creditRealtimeBroadcastErrorCode,
          eventId: liveUpdate.eventId,
        },
      });
    } catch (publishError) {
      creditRealtimeBroadcastStatus = "error";
      creditRealtimeBroadcastErrorCode = readPlatformErrorCode(publishError);
      logAssessmentCreditDiagnostic({
        event: "assessment_credit_assessment_route_publish_failed",
        level: "warn",
        traceId: assessmentCreditTraceId,
        details: {
          ownerUid: user.uid,
          generationId: savedGeneration.generation.id,
          route: ASSESSMENT_ROUTE,
          errorCode: creditRealtimeBroadcastErrorCode,
        },
        error: publishError,
      });
      console.warn("Assessment credit live update publish failed after committed generation.", {
        ...baseDiagnosticContext,
        generationId: savedGeneration.generation.id,
        route: ASSESSMENT_ROUTE,
        creditRealtimeBroadcastErrorCode,
      });
    }

    /* Cross-tool usage ledger: write a best-effort tool_usage_events row for every successful
       assessment generation. This is the central cross-tool foundation (tool-accounting.ts) and
       is intentionally kept non-fatal — a failure here must never undo a committed generation or
       a committed credit decrement. Future tools plug into the same recordToolUsageEvent call
       with their own toolId / eventKind without needing changes to the assessment quota engine. */
    try {
      await recordToolUsageEvent({
        ownerUid: user.uid,
        ownerEmail: user.email ?? null,
        ownerRole: user.role,
        toolId: "assessment",
        eventKind: "generation",
        dayKey: savedGeneration.credits.dayKey,
        generationId: savedGeneration.generation.id,
        metadata: {
          modelId: savedGeneration.generation.modelId,
          provider: savedGeneration.generation.meta.provider,
          inputMode,
        },
      });
    } catch (toolUsageError) {
      console.warn("Assessment tool-usage event write failed (non-fatal).", {
        ...baseDiagnosticContext,
        layer: "tool-accounting",
        subsystem: "tool-usage-events",
        generationId: savedGeneration.generation.id,
        error:
          toolUsageError instanceof Error
            ? toolUsageError.message
            : String(toolUsageError),
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
        provider: savedGeneration.generation.meta.provider,
        canonicalResultArtifactPersisted: Boolean(resultArtifact),
        artifactPersistenceDegraded,
        durableGenerationPersisted,
        dailyCreditsRemaining: savedGeneration.credits.remainingCount ?? "admin-exempt",
        creditRealtimeBroadcastStatus,
        creditRealtimeBroadcastErrorCode,
        creditReservationRequired: creditLifecycle.reservationRequired,
        creditReservationReserved: creditLifecycle.reservationReserved,
        creditReservationReleased: creditLifecycle.reservationReleased,
        creditCommitted: creditLifecycle.creditCommitted,
      },
    }).catch((logError) => {
      console.warn("Assessment success lifecycle log failed unexpectedly.", {
        ...baseDiagnosticContext,
        layer: "audit",
        subsystem: "admin-log",
        operation: "assessment-generated",
        modelId: savedGeneration.generation.modelId,
        inputMode,
        error: logError instanceof Error ? logError.message : String(logError),
      });
    });

    return apiSuccess<AssessmentCreateResponse>(savedGeneration, 201);
  } catch (error) {
    await releaseReservedCredit("finalization");

    if (idempotencyToken) {
      await clearAssessmentGenerationIdempotencyLock({
        token: idempotencyToken,
      }).catch(() => undefined);
    }

     /* Artifact writes happen before the final repository commit so the saved generation never
       points at a missing canonical result. If the durable save or credit commit fails, clean up
       the orphaned artifact best-effort and report failure without consuming a credit. */
    if (resultArtifact) {
      await deleteAssessmentArtifact(resultArtifact, user.uid).catch((cleanupError) => {
        console.warn("Assessment artifact cleanup failed after finalization error.", {
          ...baseDiagnosticContext,
          layer: "artifact",
          subsystem: "artifact-storage",
          operation: "cleanup-orphaned-assessment-artifact",
          artifactKey: resultArtifact?.key,
          modelId: normalized.modelId,
          canonicalModelId,
          inputMode,
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        });
      });
    }

    const classifiedFinalizationFailure = classifyAssessmentFinalizationFailure(error);
    const finalizationFailureContext = {
      ...baseDiagnosticContext,
      layer: "persistence",
      subsystem: "repository",
      operation: "save-assessment-generation-with-credit-commit",
      modelId: normalized.modelId,
      canonicalModelId,
      provider: baseGeneration.meta.provider,
      inputMode,
      internalFailureCode: classifiedFinalizationFailure.internalCode,
      internalFailureCategory: classifiedFinalizationFailure.internalCategory,
      creditLifecycle,
      canonicalResultArtifactPersisted: Boolean(resultArtifact),
      artifactPersistenceDegraded,
      durableGenerationPersisted,
    };

    const finalizationLogMethod =
      classifiedFinalizationFailure.status >= 500 ? console.error : console.warn;
    finalizationLogMethod("Assessment finalization failed with classified reason.", {
      ...finalizationFailureContext,
      responseCode: classifiedFinalizationFailure.code,
      responseStatus: classifiedFinalizationFailure.status,
      errorMessage: error instanceof Error ? error.message : String(error),
    });

    await appendAdminLog({
      actorUid: user.uid,
      actorRole: user.role,
      ownerUid: user.uid,
      ownerRole: user.role,
      action: "assessment-finalization-failed",
      resourceType: "assessment",
      resourceId: baseGeneration.id,
      route: "/api/assessment",
      metadata: {
        failureCode: classifiedFinalizationFailure.code,
        failureStatus: classifiedFinalizationFailure.status,
        internalFailureCode: classifiedFinalizationFailure.internalCode,
        internalFailureCategory: classifiedFinalizationFailure.internalCategory,
        modelId: normalized.modelId,
        canonicalModelId,
        provider: baseGeneration.meta.provider,
        inputMode,
        canonicalResultArtifactPersisted: Boolean(resultArtifact),
        artifactPersistenceDegraded,
        durableGenerationPersisted,
        creditReservationRequired: creditLifecycle.reservationRequired,
        creditReservationReserved: creditLifecycle.reservationReserved,
        creditReservationReleased: creditLifecycle.reservationReleased,
        creditCommitted: creditLifecycle.creditCommitted,
      },
    }).catch((logError) => {
      console.warn("Assessment finalization failure lifecycle log failed unexpectedly.", {
        ...baseDiagnosticContext,
        layer: "audit",
        subsystem: "admin-log",
        operation: "assessment-finalization-failed",
        modelId: normalized.modelId,
        canonicalModelId,
        inputMode,
        error: logError instanceof Error ? logError.message : String(logError),
      });
    });

    return respondAssessmentError({
      code: classifiedFinalizationFailure.code,
      message: classifiedFinalizationFailure.message,
      status: classifiedFinalizationFailure.status,
      context: finalizationFailureContext,
    });
  }
}
