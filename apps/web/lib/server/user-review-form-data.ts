import "server-only";

import type { UserReviewMutationInput } from "@/lib/server/user-reviews";
import {
  USER_REVIEW_MAX_IMAGE_BYTES,
  UserReviewError,
} from "@/lib/server/user-reviews";

function readOptionalFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
}

function readOptionalNumberField(formData: FormData, key: string) {
  const value = readOptionalFormString(formData, key);
  if (value === undefined || !value.trim()) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readOptionalReviewPhoto(formData: FormData) {
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size <= 0) {
    return null;
  }

  return file;
}

export async function parseUserReviewFormData(
  request: Request,
): Promise<UserReviewMutationInput> {
  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    throw new UserReviewError(
      "REVIEW_FORM_INVALID",
      "The review form payload could not be read.",
      400,
    );
  }

  const file = readOptionalReviewPhoto(formData);
  if (file && file.size > USER_REVIEW_MAX_IMAGE_BYTES) {
    throw new UserReviewError(
      "REVIEW_PHOTO_SIZE_INVALID",
      "Review photos must be 3 MB or smaller after optimization.",
      400,
      { photo: "Choose an optimized image up to 3 MB." },
    );
  }

  const photo = file
    ? {
        body: Buffer.from(await file.arrayBuffer()),
        contentType: file.type,
        sizeBytes: file.size,
        /* Admin review images are optimized in the browser before upload, but the
           backend still records dimensions only as metadata; storage and DB writes
           remain server-authoritative and do not trust the client for access control. */
        width: readOptionalNumberField(formData, "photoWidth") ?? null,
        height: readOptionalNumberField(formData, "photoHeight") ?? null,
      }
    : null;

  return {
    personName: readOptionalFormString(formData, "personName"),
    reviewText: readOptionalFormString(formData, "reviewText"),
    isPublished: readOptionalFormString(formData, "isPublished"),
    sortOrder: readOptionalFormString(formData, "sortOrder"),
    photo,
  };
}
