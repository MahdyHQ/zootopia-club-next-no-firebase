import type { AdminUserReviewMutationResponse } from "@zootopia/shared-types";

import { apiError, apiSuccess, applyNoStore } from "@/lib/server/api";
import { appendAdminLog } from "@/lib/server/repository";
import { getAdminSessionUser } from "@/lib/server/session";
import { parseUserReviewFormData } from "@/lib/server/user-review-form-data";
import {
  deleteUserReviewAsAdmin,
  listUserReviewsForAdmin,
  updateUserReviewAsAdmin,
  UserReviewError,
} from "@/lib/server/user-reviews";

export const runtime = "nodejs";
/* Individual review mutations touch both database rows and private-bucket photos.
   Keep this route dynamic/no-store so admin state always comes from live Auth.js truth. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

function toReviewApiError(error: unknown, fallbackCode: string, fallbackMessage: string) {
  if (error instanceof UserReviewError) {
    return applyNoStore(apiError(error.code, error.message, error.status, error.fieldErrors));
  }

  return applyNoStore(apiError(fallbackCode, fallbackMessage, 503));
}

async function readReviewId(context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  return String(params.id ?? "").trim();
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const admin = await getAdminSessionUser();
  if (!admin) {
    return applyNoStore(apiError("FORBIDDEN", "Admin access is required.", 403));
  }

  const reviewId = await readReviewId(context);
  if (!reviewId) {
    return applyNoStore(apiError("REVIEW_ID_REQUIRED", "Review id is required.", 400));
  }

  try {
    const payload = await parseUserReviewFormData(request);
    const review = await updateUserReviewAsAdmin(reviewId, {
      ...payload,
      actor: {
        uid: admin.uid,
        role: admin.role,
      },
    });

    await appendAdminLog({
      actorUid: admin.uid,
      actorRole: admin.role,
      ownerUid: admin.uid,
      ownerRole: admin.role,
      action: "user-review-updated",
      resourceType: "userReview",
      resourceId: review.id,
      route: `/api/admin/reviews/${review.id}`,
      metadata: {
        isPublished: review.isPublished,
        sortOrder: review.sortOrder,
      },
    }).catch((error) => {
      console.warn("[api-admin-review] update audit log failed", {
        adminUid: admin.uid,
        reviewId: review.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return applyNoStore(
      apiSuccess<AdminUserReviewMutationResponse>({
        review,
        reviews: await listUserReviewsForAdmin(),
      }),
    );
  } catch (error) {
    console.error("[api-admin-review] failed to update review", {
      adminUid: admin.uid,
      reviewId,
      error: error instanceof Error ? error.name : "UNKNOWN",
    });
    return toReviewApiError(error, "ADMIN_REVIEW_UPDATE_FAILED", "Review could not be updated.");
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const admin = await getAdminSessionUser();
  if (!admin) {
    return applyNoStore(apiError("FORBIDDEN", "Admin access is required.", 403));
  }

  const reviewId = await readReviewId(context);
  if (!reviewId) {
    return applyNoStore(apiError("REVIEW_ID_REQUIRED", "Review id is required.", 400));
  }

  try {
    const review = await deleteUserReviewAsAdmin(reviewId);
    await appendAdminLog({
      actorUid: admin.uid,
      actorRole: admin.role,
      ownerUid: admin.uid,
      ownerRole: admin.role,
      action: "user-review-deleted",
      resourceType: "userReview",
      resourceId: review.id,
      route: `/api/admin/reviews/${review.id}`,
      metadata: {
        wasPublished: review.isPublished,
        sortOrder: review.sortOrder,
      },
    }).catch((error) => {
      console.warn("[api-admin-review] delete audit log failed", {
        adminUid: admin.uid,
        reviewId: review.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return applyNoStore(
      apiSuccess<AdminUserReviewMutationResponse>({
        review,
        reviews: await listUserReviewsForAdmin(),
      }),
    );
  } catch (error) {
    console.error("[api-admin-review] failed to delete review", {
      adminUid: admin.uid,
      reviewId,
      error: error instanceof Error ? error.name : "UNKNOWN",
    });
    return toReviewApiError(error, "ADMIN_REVIEW_DELETE_FAILED", "Review could not be deleted.");
  }
}
