import type {
  AdminAssessmentCreditMutationInput,
  AdminUserAssessmentCreditsResponse,
} from "@zootopia/shared-types";

import { apiError, apiSuccess, applyNoStore } from "@/lib/server/api";
import {
  createAssessmentCreditTraceId,
  logAssessmentCreditDiagnostic,
} from "@/lib/server/assessment-credit-diagnostics";
import { publishAssessmentCreditLiveUpdate } from "@/lib/server/assessment-credit-live-updates";
import {
  getAdminAccessRequiredError,
  getAssessmentCreditStateUnavailablePlatformError,
  getInvalidJsonPlatformError,
  getUserLookupUnavailablePlatformError,
  getUserNotFoundPlatformError,
  mapAdminAssessmentCreditMutationError,
  readPlatformErrorCode,
} from "@/lib/server/assessment-platform-errors";
import {
  appendAdminLog,
  applyAdminAssessmentCreditMutation,
  getAdminAssessmentCreditStateForUser,
  getUserByUid,
} from "@/lib/server/repository";
import { getAdminSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";
const ADMIN_CREDITS_MUTATION_ROUTE = "/api/admin/users/[uid]/credits";
const ASSESSMENT_CREDIT_TRACE_ID_HEADER = "X-Zootopia-Assessment-Credit-Trace-Id";

function applyAssessmentCreditTraceIdHeader<T extends Response>(response: T, traceId: string) {
  /* Admin credit mutations already mint a structured trace ID for server diagnostics.
     Exposing the same opaque identifier on API responses lets browser tooling and future
     operators correlate the API result with repository/realtime logs without leaking balance
     data or cross-user metadata. */
  response.headers.set(ASSESSMENT_CREDIT_TRACE_ID_HEADER, traceId);
  return response;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ uid: string }> },
) {
  /* This route exposes admin-only credit/account visibility for one owner. Keep authorization
     server-side so only claim-verified admins can inspect or mutate account credit state. */
  const admin = await getAdminSessionUser();
  if (!admin) {
    const error = getAdminAccessRequiredError();
    return applyNoStore(apiError(error.code, error.message, error.status));
  }

  const { uid } = await context.params;
  let user: Awaited<ReturnType<typeof getUserByUid>>;
  try {
    user = await getUserByUid(uid);
  } catch (error) {
    console.error("[api-admin-user-credits] failed to load user record", {
      targetUid: uid,
      adminUid: admin.uid,
      error: error instanceof Error ? error.name : "UNKNOWN",
    });
    const mapped = getUserLookupUnavailablePlatformError();
    return applyNoStore(
      apiError(mapped.code, mapped.message, mapped.status),
    );
  }

  if (!user) {
    const error = getUserNotFoundPlatformError();
    return applyNoStore(apiError(error.code, error.message, error.status));
  }

  let state: Awaited<ReturnType<typeof getAdminAssessmentCreditStateForUser>>;
  try {
    state = await getAdminAssessmentCreditStateForUser(uid, {
      ownerRole: user.role,
    });
  } catch (error) {
    console.error("[api-admin-user-credits] failed to load credit state", {
      targetUid: uid,
      adminUid: admin.uid,
      error: error instanceof Error ? error.name : "UNKNOWN",
    });
    const mapped = getAssessmentCreditStateUnavailablePlatformError();
    return applyNoStore(
      apiError(mapped.code, mapped.message, mapped.status),
    );
  }

  if (!state) {
    const error = getAssessmentCreditStateUnavailablePlatformError(500);
    return applyNoStore(
      apiError(error.code, error.message, error.status),
    );
  }

  return applyNoStore(
    apiSuccess<AdminUserAssessmentCreditsResponse>({
      user,
      state,
    }),
  );
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ uid: string }> },
) {
  /* Admin mutations remain repository-owned and transaction-backed to keep access toggles,
     manual credits, overrides, and grants authoritative in one backend path. */
  const creditTraceId = createAssessmentCreditTraceId();
  const admin = await getAdminSessionUser();
  if (!admin) {
    const error = getAdminAccessRequiredError();
    return applyNoStore(
      applyAssessmentCreditTraceIdHeader(
        apiError(error.code, error.message, error.status),
        creditTraceId,
      ),
    );
  }

  const { uid } = await context.params;
  if (uid === admin.uid) {
    const mapped = mapAdminAssessmentCreditMutationError(
      new Error("ASSESSMENT_CREDIT_SELF_MUTATION_FORBIDDEN"),
    );
    return applyNoStore(
      applyAssessmentCreditTraceIdHeader(
        apiError(mapped.code, mapped.message, mapped.status),
        creditTraceId,
      ),
    );
  }

  let body: AdminAssessmentCreditMutationInput;
  try {
    body = (await request.json()) as AdminAssessmentCreditMutationInput;
  } catch {
    const error = getInvalidJsonPlatformError();
    return applyAssessmentCreditTraceIdHeader(
      applyNoStore(apiError(error.code, error.message, error.status)),
      creditTraceId,
    );
  }

  let user: Awaited<ReturnType<typeof getUserByUid>>;

  logAssessmentCreditDiagnostic({
    event: "assessment_credit_admin_api_requested",
    traceId: creditTraceId,
    details: {
      route: ADMIN_CREDITS_MUTATION_ROUTE,
      actorUid: admin.uid,
      actorEmail: admin.email ?? null,
      targetUid: uid,
      action: body.action,
    },
  });

  try {
    user = await getUserByUid(uid);
  } catch (error) {
    logAssessmentCreditDiagnostic({
      event: "assessment_credit_admin_api_target_lookup_failed",
      level: "error",
      traceId: creditTraceId,
      details: {
        route: ADMIN_CREDITS_MUTATION_ROUTE,
        actorUid: admin.uid,
        actorEmail: admin.email ?? null,
        targetUid: uid,
        action: body.action,
      },
      error,
    });
    const mapped = getUserLookupUnavailablePlatformError();
    return applyNoStore(
      applyAssessmentCreditTraceIdHeader(
        apiError(mapped.code, mapped.message, mapped.status),
        creditTraceId,
      ),
    );
  }

  if (!user) {
    const error = getUserNotFoundPlatformError();
    return applyNoStore(
      applyAssessmentCreditTraceIdHeader(
        apiError(error.code, error.message, error.status),
        creditTraceId,
      ),
    );
  }

  logAssessmentCreditDiagnostic({
    event: "assessment_credit_admin_api_target_resolved",
    traceId: creditTraceId,
    details: {
      route: ADMIN_CREDITS_MUTATION_ROUTE,
      actorUid: admin.uid,
      actorEmail: admin.email ?? null,
      targetUid: uid,
      targetRole: user.role,
    },
  });

  console.info("[admin-users-mutation]", {
    action: `assessment-credits:${body.action}`,
    targetUid: uid,
    actingAdminUid: admin.uid,
    routeHit: ADMIN_CREDITS_MUTATION_ROUTE,
    backendMutationResult: "started",
  });

  let state: Awaited<ReturnType<typeof applyAdminAssessmentCreditMutation>>;
  try {
    state = await applyAdminAssessmentCreditMutation({
      ownerUid: uid,
      admin: {
        uid: admin.uid,
        role: admin.role,
        email: admin.email ?? null,
      },
      mutation: body,
      diagnostics: {
        traceId: creditTraceId,
        source: "admin-api-route",
      },
    });
  } catch (error) {
    logAssessmentCreditDiagnostic({
      event: "assessment_credit_admin_api_failed",
      level: "error",
      traceId: creditTraceId,
      details: {
        route: ADMIN_CREDITS_MUTATION_ROUTE,
        actorUid: admin.uid,
        actorEmail: admin.email ?? null,
        targetUid: uid,
        action: body.action,
      },
      error,
    });
    console.warn("[admin-users-mutation]", {
      action: `assessment-credits:${body.action}`,
      targetUid: uid,
      actingAdminUid: admin.uid,
      routeHit: ADMIN_CREDITS_MUTATION_ROUTE,
      backendMutationResult: "failed",
      failureReason: error instanceof Error ? error.message : "ASSESSMENT_CREDIT_UPDATE_FAILED",
    });

    const mapped = mapAdminAssessmentCreditMutationError(error);
    return applyNoStore(
      applyAssessmentCreditTraceIdHeader(
        apiError(mapped.code, mapped.message, mapped.status),
        creditTraceId,
      ),
    );
  }

  let adminLogStatus = "succeeded";
  let adminLogErrorCode: string | null = null;

  /* Admin audit logging is observability-only follow-up. Keep it best-effort after the
     repository commit so operators never receive a false mutation failure after balance truth
     has already been durably updated for the target user. */
  try {
    await appendAdminLog({
      actorUid: admin.uid,
      actorRole: admin.role,
      targetUid: uid,
      ownerUid: uid,
      ownerRole: user.role,
      action: `assessment-credits:${body.action}`,
      resourceType: "assessment-credits",
      resourceId: uid,
      route: "/api/admin/users/[uid]/credits",
      metadata: {
        action: body.action,
        amount: typeof body.amount === "number" ? body.amount : null,
        access: body.access ?? null,
        dailyLimitOverride:
          typeof body.dailyLimitOverride === "number"
            ? body.dailyLimitOverride
            : null,
        grantId: body.grantId ?? null,
        expiresAt: body.expiresAt ?? null,
        reason: body.reason ?? null,
        note: body.note ?? null,
      },
    });
  } catch (error) {
    adminLogStatus = "failed";
    adminLogErrorCode = readPlatformErrorCode(error);
    logAssessmentCreditDiagnostic({
      event: "assessment_credit_admin_api_admin_log_failed",
      level: "warn",
      traceId: creditTraceId,
      details: {
        route: ADMIN_CREDITS_MUTATION_ROUTE,
        actorUid: admin.uid,
        actorEmail: admin.email ?? null,
        targetUid: uid,
        action: body.action,
        adminLogErrorCode,
      },
      error,
    });
    console.warn("[admin-users-mutation] admin audit log failed after committed mutation", {
      action: `assessment-credits:${body.action}`,
      targetUid: uid,
      actingAdminUid: admin.uid,
      routeHit: ADMIN_CREDITS_MUTATION_ROUTE,
      adminLogErrorCode,
    });
  }

  let broadcastStatus: string | null = null;
  let broadcastErrorCode: string | null = null;

  /* Broadcast only the repository-returned post-commit summary for the mutated owner UID.
     This route stays server-authoritative by reusing the exact effective summary model already
     returned to admins and `/api/assessment/credits`, rather than computing a client-side delta. */
  try {
    const liveUpdate = await publishAssessmentCreditLiveUpdate({
      ownerUid: uid,
      credits: state.credits,
      reason: `admin-api:${body.action}`,
      traceId: creditTraceId,
    });
    broadcastStatus = liveUpdate.broadcast.status;
    broadcastErrorCode = liveUpdate.broadcast.errorCode;
    logAssessmentCreditDiagnostic({
      event: "assessment_credit_admin_api_publish_result",
      traceId: creditTraceId,
      details: {
        route: ADMIN_CREDITS_MUTATION_ROUTE,
        actorUid: admin.uid,
        actorEmail: admin.email ?? null,
        targetUid: uid,
        action: body.action,
        broadcastStatus,
        broadcastErrorCode,
        eventId: liveUpdate.eventId,
      },
    });
  } catch (error) {
    broadcastStatus = "error";
    broadcastErrorCode = readPlatformErrorCode(error);
    logAssessmentCreditDiagnostic({
      event: "assessment_credit_admin_api_publish_failed",
      level: "warn",
      traceId: creditTraceId,
      details: {
        route: ADMIN_CREDITS_MUTATION_ROUTE,
        actorUid: admin.uid,
        actorEmail: admin.email ?? null,
        targetUid: uid,
        action: body.action,
        broadcastErrorCode,
      },
      error,
    });
    console.warn("[admin-users-mutation] live update publish failed", {
      action: `assessment-credits:${body.action}`,
      targetUid: uid,
      actingAdminUid: admin.uid,
      routeHit: ADMIN_CREDITS_MUTATION_ROUTE,
      error: error instanceof Error ? error.name : "UNKNOWN",
    });
  }

  logAssessmentCreditDiagnostic({
    event: "assessment_credit_admin_api_succeeded",
    traceId: creditTraceId,
    details: {
      route: ADMIN_CREDITS_MUTATION_ROUTE,
      actorUid: admin.uid,
      actorEmail: admin.email ?? null,
      targetUid: uid,
      action: body.action,
      adminLogStatus,
      adminLogErrorCode,
      broadcastStatus,
      broadcastErrorCode,
      remainingCount: state.credits.remainingCount,
    },
  });

  console.info("[admin-users-mutation]", {
    action: `assessment-credits:${body.action}`,
    targetUid: uid,
    actingAdminUid: admin.uid,
    routeHit: ADMIN_CREDITS_MUTATION_ROUTE,
    backendMutationResult: "success",
    adminLogStatus,
    adminLogErrorCode,
    broadcastStatus,
    broadcastErrorCode,
    remainingCount: state.credits.remainingCount,
  });

  return applyNoStore(
    applyAssessmentCreditTraceIdHeader(
      apiSuccess<AdminUserAssessmentCreditsResponse>({
        user,
        state,
      }),
      creditTraceId,
    ),
  );
}
