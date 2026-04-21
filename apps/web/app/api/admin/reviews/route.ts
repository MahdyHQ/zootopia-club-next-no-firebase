import type {
  AdminUserReviewMutationResponse,
  AdminUserReviewsResponse,
} from "@zootopia/shared-types";

import { apiError, apiSuccess, applyNoStore } from "@/lib/server/api";
import { appendAdminLog } from "@/lib/server/repository";
import { getAdminSessionUser } from "@/lib/server/session";
import { parseUserReviewFormData } from "@/lib/server/user-review-form-data";
import {
  createUserReviewAsAdmin,
  listUserReviewsForAdmin,
  UserReviewError,
} from "@/lib/server/user-reviews";

export const runtime = "nodejs";
/* Review management is privileged mutable content. Keep route output no-store so admin
   publication state and actor-scoped operations never leak through cached JSON snapshots. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

function toReviewApiError(error: unknown, fallbackCode: string, fallbackMessage: string) {
  if (error instanceof UserReviewError) {
    return applyNoStore(apiError(error.code, error.message, error.status, error.fieldErrors));
  }

  return applyNoStore(apiError(fallbackCode, fallbackMessage, 503));
}

export async function GET() {
  const admin = await getAdminSessionUser();
  if (!admin) {
    return applyNoStore(apiError("FORBIDDEN", "Admin access is required.", 403));
  }

  try {
    return applyNoStore(
      apiSuccess<AdminUserReviewsResponse>({
        reviews: await listUserReviewsForAdmin(),
      }),
    );
  } catch (error) {
    console.error("[api-admin-reviews] failed to list reviews", {
      adminUid: admin.uid,
      error: error instanceof Error ? error.name : "UNKNOWN",
    });
    return toReviewApiError(
      error,
      "ADMIN_REVIEWS_UNAVAILABLE",
      "Reviews are temporarily unavailable.",
    );
  }
}

export async function POST(request: Request) {
  const admin = await getAdminSessionUser();
  if (!admin) {
    return applyNoStore(apiError("FORBIDDEN", "Admin access is required.", 403));
  }

  try {
    const payload = await parseUserReviewFormData(request);
    const review = await createUserReviewAsAdmin({
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
      action: "user-review-created",
      resourceType: "userReview",
      resourceId: review.id,
      route: "/api/admin/reviews",
      metadata: {
        isPublished: review.isPublished,
        sortOrder: review.sortOrder,
      },
    }).catch((error) => {
      console.warn("[api-admin-reviews] create audit log failed", {
        adminUid: admin.uid,
        reviewId: review.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return applyNoStore(
      apiSuccess<AdminUserReviewMutationResponse>(
        {
          review,
          reviews: await listUserReviewsForAdmin(),
        },
        201,
      ),
    );
  } catch (error) {
    console.error("[api-admin-reviews] failed to create review", {
      adminUid: admin.uid,
      error: error instanceof Error ? error.name : "UNKNOWN",
    });
    return toReviewApiError(error, "ADMIN_REVIEW_CREATE_FAILED", "Review could not be saved.");
  }
}
