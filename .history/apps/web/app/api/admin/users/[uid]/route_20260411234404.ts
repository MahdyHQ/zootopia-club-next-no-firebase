import type {
  AdminDeleteUserResponse,
  AdminUserDeletionSummary,
  ApiFieldErrors,
} from "@zootopia/shared-types";

import { apiError, apiSuccess } from "@/lib/server/api";
import {
  appendAdminLog,
  deleteUserAccountAsAdmin,
  getUserByUid,
  listUsers,
} from "@/lib/server/repository";
import { getAdminSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";

const DELETE_USER_ROUTE = "/api/admin/users/[uid]";
const DELETE_USER_CONFIRMATION_PHRASE = "DELETE USER";

type DeleteUserErrorWithSummary = Error & {
  deletionSummary?: AdminUserDeletionSummary;
};

function buildDeletionFailureFieldErrors(summary: AdminUserDeletionSummary): ApiFieldErrors {
  return {
    "deletion.failurePoint": summary.failurePoint ?? "unknown",
    "deletion.failureReason": summary.failureReason ?? "unknown",
    "deletion.authAccountDeleted": String(summary.authAccountDeleted),
    "deletion.deletedDocuments": String(summary.database.deletedDocuments),
    "deletion.deletedAssessments": String(summary.database.deletedAssessmentGenerations),
    "deletion.deletedInfographics": String(summary.database.deletedInfographicGenerations),
    "deletion.deletedCreditAccounts": String(summary.database.deletedCreditAccounts),
    "deletion.deletedCreditGrants": String(summary.database.deletedCreditGrants),
    "deletion.deletedDailyCredits": String(summary.database.deletedDailyCredits),
    "deletion.deletedIdempotencyKeys": String(summary.database.deletedIdempotencyKeys),
    "deletion.deletedDocumentObjects": String(summary.storage.deletedDocumentObjects),
    "deletion.deletedAssessmentArtifacts": String(summary.storage.deletedAssessmentArtifacts),
  };
}

function mapDeleteUserError(error: unknown) {
  const typedError = error as DeleteUserErrorWithSummary;
  const code = typedError?.message || "ADMIN_USER_DELETE_FAILED";

  switch (code) {
    case "USER_UID_REQUIRED":
      return {
        code,
        message: "A target user uid is required.",
        status: 400,
      };
    case "USER_NOT_FOUND":
      return {
        code,
        message: "The selected user was not found.",
        status: 404,
      };
    case "ADMIN_SELF_DELETE_FORBIDDEN":
      return {
        code,
        message: "Admins cannot delete their own account from this route.",
        status: 400,
      };
    case "ALLOWLISTED_ADMIN_DELETE_FORBIDDEN":
      return {
        code,
        message: "Allowlisted admin accounts cannot be deleted from this route.",
        status: 403,
      };
    case "ADMIN_USER_DELETE_FAILED": {
      const summary = typedError.deletionSummary;
      return {
        code,
        message: summary
          ? `User deletion partially failed at stage: ${summary.failurePoint ?? "unknown"}.`
          : "User deletion failed before completion.",
        status: 500,
        fieldErrors: summary ? buildDeletionFailureFieldErrors(summary) : undefined,
      };
    }
    default:
      return {
        code: "ADMIN_USER_DELETE_FAILED",
        message:
          typedError instanceof Error
            ? typedError.message
            : "User deletion failed before completion.",
        status: 500,
      };
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ uid: string }> },
) {
  const admin = await getAdminSessionUser();
  if (!admin) {
    return apiError("FORBIDDEN", "Admin access is required.", 403);
  }

  const { uid } = await context.params;
  const targetUid = String(uid || "").trim();
  if (!targetUid) {
    return apiError("USER_UID_REQUIRED", "A target user uid is required.", 400);
  }

  if (targetUid === admin.uid) {
    return apiError(
      "ADMIN_SELF_DELETE_FORBIDDEN",
      "Admins cannot delete their own account from this route.",
      400,
    );
  }

  const targetUser = await getUserByUid(targetUid);
  if (!targetUser) {
    return apiError("USER_NOT_FOUND", "The selected user was not found.", 404);
  }

  let body: { confirmation?: string };
  try {
    body = (await request.json()) as { confirmation?: string };
  } catch {
    return apiError("INVALID_JSON", "Request body must be valid JSON.", 400);
  }

  const confirmation = String(body.confirmation || "").trim();
  if (!confirmation) {
    return apiError(
      "DELETE_CONFIRMATION_REQUIRED",
      `Deletion confirmation is required. Type "${DELETE_USER_CONFIRMATION_PHRASE}" exactly.`,
      400,
    );
  }

  if (confirmation !== DELETE_USER_CONFIRMATION_PHRASE) {
    return apiError(
      "DELETE_CONFIRMATION_MISMATCH",
      `Confirmation must match "${DELETE_USER_CONFIRMATION_PHRASE}" exactly.`,
      400,
    );
  }

  console.info("[admin-users-mutation]", {
    action: "delete-user",
    targetUid,
    targetEmail: targetUser.email ?? null,
    actingAdminUid: admin.uid,
    routeHit: DELETE_USER_ROUTE,
    backendMutationResult: "started",
  });

  await appendAdminLog({
    actorUid: admin.uid,
    actorRole: admin.role,
    targetUid,
    ownerUid: targetUid,
    ownerRole: targetUser.role,
    action: "admin-user-delete-attempt",
    resourceType: "user",
    resourceId: targetUid,
    route: DELETE_USER_ROUTE,
    metadata: {
      targetEmail: targetUser.email,
      confirmationPhraseRequired: DELETE_USER_CONFIRMATION_PHRASE,
    },
  });

  try {
    const summary = await deleteUserAccountAsAdmin({
      targetUid,
      actingAdmin: {
        uid: admin.uid,
        role: admin.role,
      },
      route: DELETE_USER_ROUTE,
    });

    const users = await listUsers();

    console.info("[admin-users-mutation]", {
      action: "delete-user",
      targetUid,
      targetEmail: targetUser.email ?? null,
      actingAdminUid: admin.uid,
      routeHit: DELETE_USER_ROUTE,
      backendMutationResult: summary.finalResult,
      authAccountDeleted: summary.authAccountDeleted,
      failureReason: summary.failureReason,
    });

    return apiSuccess<AdminDeleteUserResponse>({
      deletedUid: targetUid,
      users,
      summary,
    });
  } catch (error) {
    const mapped = mapDeleteUserError(error);

    console.error("[admin-users-mutation]", {
      action: "delete-user",
      targetUid,
      targetEmail: targetUser.email ?? null,
      actingAdminUid: admin.uid,
      routeHit: DELETE_USER_ROUTE,
      backendMutationResult: "failed",
      failureReason: mapped.message,
      failureCode: mapped.code,
    });

    return apiError(mapped.code, mapped.message, mapped.status, mapped.fieldErrors);
  }
}
