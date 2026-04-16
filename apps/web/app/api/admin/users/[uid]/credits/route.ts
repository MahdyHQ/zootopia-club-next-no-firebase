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
  appendAdminLog,
  applyAdminAssessmentCreditMutation,
  getAdminAssessmentCreditStateForUser,
  getUserByUid,
} from "@/lib/server/repository";
import { getAdminSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";
const ADMIN_CREDITS_MUTATION_ROUTE = "/api/admin/users/[uid]/credits";

function mapCreditMutationError(error: unknown) {
  const code = error instanceof Error ? error.message : "ASSESSMENT_CREDIT_UPDATE_FAILED";

  switch (code) {
    case "USER_NOT_FOUND":
      return {
        code,
        message: "The selected user was not found.",
        status: 404,
      };
    case "ASSESSMENT_CREDIT_GRANT_NOT_FOUND":
      return {
        code,
        message: "The selected grant was not found.",
        status: 404,
      };
    case "ASSESSMENT_CREDIT_GRANT_ALREADY_REVOKED":
      return {
        code,
        message: "This grant has already been revoked.",
        status: 409,
      };
    case "ASSESSMENT_CREDIT_GRANT_OWNER_MISMATCH":
      return {
        code,
        message: "The selected grant does not belong to this user.",
        status: 400,
      };
    case "ASSESSMENT_CREDIT_SELF_MUTATION_FORBIDDEN":
      return {
        code,
        message: "Admins cannot mutate their own assessment credit balances.",
        status: 403,
      };
    case "ASSESSMENT_CREDIT_ACTION_UNSUPPORTED":
    case "ASSESSMENT_CREDIT_AMOUNT_INVALID":
    case "ASSESSMENT_CREDIT_ACCESS_INVALID":
    case "ASSESSMENT_DAILY_OVERRIDE_INVALID":
    case "ASSESSMENT_CREDIT_GRANT_EXPIRY_INVALID":
    case "ASSESSMENT_CREDIT_GRANT_ID_REQUIRED":
      return {
        code,
        message: "The credit mutation request is invalid.",
        status: 400,
      };
    default:
      return {
        code: "ASSESSMENT_CREDIT_UPDATE_FAILED",
        message:
          error instanceof Error
            ? error.message
            : "Unable to update assessment credits right now.",
        status: 400,
      };
  }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ uid: string }> },
) {
  /* This route exposes admin-only credit/account visibility for one owner. Keep authorization
     server-side so only claim-verified admins can inspect or mutate account credit state. */
  const admin = await getAdminSessionUser();
  if (!admin) {
    return applyNoStore(apiError("FORBIDDEN", "Admin access is required.", 403));
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
    return applyNoStore(
      apiError(
        "USER_LOOKUP_UNAVAILABLE",
        "The selected user could not be resolved right now.",
        503,
      ),
    );
  }

  if (!user) {
    return applyNoStore(apiError("USER_NOT_FOUND", "The selected user was not found.", 404));
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
    return applyNoStore(
      apiError(
        "ASSESSMENT_CREDIT_STATE_UNAVAILABLE",
        "Unable to load assessment credit state for this user.",
        503,
      ),
    );
  }

  if (!state) {
    return applyNoStore(
      apiError(
        "ASSESSMENT_CREDIT_STATE_UNAVAILABLE",
        "Unable to load assessment credit state for this user.",
        500,
      ),
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
  const admin = await getAdminSessionUser();
  if (!admin) {
    return applyNoStore(apiError("FORBIDDEN", "Admin access is required.", 403));
  }

  const { uid } = await context.params;
  if (uid === admin.uid) {
    return applyNoStore(
      apiError(
        "ASSESSMENT_CREDIT_SELF_MUTATION_FORBIDDEN",
        "Admins cannot mutate their own assessment credit balances.",
        403,
      ),
    );
  }

  let body: AdminAssessmentCreditMutationInput;
  try {
    body = (await request.json()) as AdminAssessmentCreditMutationInput;
  } catch {
    return applyNoStore(apiError("INVALID_JSON", "Request body must be valid JSON.", 400));
  }

  const creditTraceId = createAssessmentCreditTraceId();
  let user: Awaited<ReturnType<typeof getUserByUid>>;

  logAssessmentCreditDiagnostic({
    event: "assessment_credit_admin_api_requested",
    traceId: creditTraceId,
    details: {
      route: ADMIN_CREDITS_MUTATION_ROUTE,
      actorUid: admin.uid,
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
        targetUid: uid,
        action: body.action,
      },
      error,
    });
    return applyNoStore(
      apiError(
        "USER_LOOKUP_UNAVAILABLE",
        "The selected user could not be resolved right now.",
        503,
      ),
    );
  }

  if (!user) {
    return applyNoStore(apiError("USER_NOT_FOUND", "The selected user was not found.", 404));
  }

  logAssessmentCreditDiagnostic({
    event: "assessment_credit_admin_api_target_resolved",
    traceId: creditTraceId,
    details: {
      route: ADMIN_CREDITS_MUTATION_ROUTE,
      actorUid: admin.uid,
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

  try {
    const state = await applyAdminAssessmentCreditMutation({
      ownerUid: uid,
      admin: {
        uid: admin.uid,
        role: admin.role,
      },
      mutation: body,
      diagnostics: {
        traceId: creditTraceId,
        source: "admin-api-route",
      },
    });

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

    let deliveredCount = 0;

    /* Broadcast only the repository-returned post-commit summary for the mutated owner UID.
       This route stays server-authoritative by reusing the exact effective summary model already
       returned to admins and `/api/assessment/credits`, rather than computing a client-side delta. */
    try {
      const liveUpdate = publishAssessmentCreditLiveUpdate({
        ownerUid: uid,
        credits: state.credits,
        reason: `admin-api:${body.action}`,
        traceId: creditTraceId,
      });
      const listenerCount = liveUpdate.listenerCount;
      deliveredCount = liveUpdate.deliveredCount;
      logAssessmentCreditDiagnostic({
        event: "assessment_credit_admin_api_publish_result",
        traceId: creditTraceId,
        details: {
          route: ADMIN_CREDITS_MUTATION_ROUTE,
          actorUid: admin.uid,
          targetUid: uid,
          action: body.action,
          listenerCount,
          deliveredCount,
          eventId: liveUpdate.eventId,
        },
      });
    } catch (error) {
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
        targetUid: uid,
        action: body.action,
        deliveredCount,
        remainingCount: state.credits.remainingCount,
      },
    });

    console.info("[admin-users-mutation]", {
      action: `assessment-credits:${body.action}`,
      targetUid: uid,
      actingAdminUid: admin.uid,
      routeHit: ADMIN_CREDITS_MUTATION_ROUTE,
      backendMutationResult: "success",
      deliveredCount,
      remainingCount: state.credits.remainingCount,
    });

    return applyNoStore(
      apiSuccess<AdminUserAssessmentCreditsResponse>({
        user,
        state,
      }),
    );
  } catch (error) {
    logAssessmentCreditDiagnostic({
      event: "assessment_credit_admin_api_failed",
      level: "error",
      traceId: creditTraceId,
      details: {
        route: ADMIN_CREDITS_MUTATION_ROUTE,
        actorUid: admin.uid,
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

    const mapped = mapCreditMutationError(error);
    return applyNoStore(apiError(mapped.code, mapped.message, mapped.status));
  }
}
