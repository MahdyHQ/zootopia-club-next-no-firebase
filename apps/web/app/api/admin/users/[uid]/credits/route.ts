import type {
  AdminAssessmentCreditMutationInput,
  AdminUserAssessmentCreditsResponse,
} from "@zootopia/shared-types";

import { apiError, apiSuccess, applyNoStore } from "@/lib/server/api";
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
  const user = await getUserByUid(uid);
  if (!user) {
    return applyNoStore(apiError("USER_NOT_FOUND", "The selected user was not found.", 404));
  }

  const state = await getAdminAssessmentCreditStateForUser(uid, {
    ownerRole: user.role,
  });
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
    });
    const user = await getUserByUid(uid);
    if (!user) {
      return applyNoStore(apiError("USER_NOT_FOUND", "The selected user was not found.", 404));
    }

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
      },
    });

    console.info("[admin-users-mutation]", {
      action: `assessment-credits:${body.action}`,
      targetUid: uid,
      actingAdminUid: admin.uid,
      routeHit: ADMIN_CREDITS_MUTATION_ROUTE,
      backendMutationResult: "success",
    });

    return applyNoStore(
      apiSuccess<AdminUserAssessmentCreditsResponse>({
        user,
        state,
      }),
    );
  } catch (error) {
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
