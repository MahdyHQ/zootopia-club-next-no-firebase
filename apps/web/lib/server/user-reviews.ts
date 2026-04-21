import "server-only";

import { randomUUID } from "node:crypto";

import type { PublicUserReview, UserReview, UserRole } from "@zootopia/shared-types";

import {
  deleteZootopiaPrivateObject,
  downloadZootopiaPrivateObject,
  hasRemoteBlobStorage,
  uploadZootopiaPrivateObject,
} from "@/lib/server/supabase-blob-storage";
import {
  getZootopiaDatabase,
  requiresDurableZootopiaPersistence,
} from "@/lib/server/zootopia-postgres-adapter";
import { hasZootopiaPostgresPersistence } from "@/lib/server/zootopia-entity-store";

const USER_REVIEW_STORAGE_ROOT = "reviews";
const USER_REVIEW_MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const USER_REVIEW_MAX_NAME_LENGTH = 160;
const USER_REVIEW_MAX_TEXT_LENGTH = 4000;
const USER_REVIEW_DEFAULT_LIMIT = 96;
const USER_REVIEW_ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export type UserReviewImageInput = {
  body: Buffer;
  contentType: string;
  sizeBytes: number;
  width?: number | null;
  height?: number | null;
};

export type UserReviewMutationInput = {
  personName?: unknown;
  reviewText?: unknown;
  isPublished?: unknown;
  sortOrder?: unknown;
  photo?: UserReviewImageInput | null;
};

type UserReviewAdminActor = {
  uid: string;
  role: UserRole;
};

type UserReviewImagePayload = {
  body: Buffer;
  contentType: string;
  updatedAt: string;
};

type UserReviewDbRow = {
  id: string;
  person_name: string;
  review_text: string;
  photo_storage_path: string;
  photo_mime_type: string;
  photo_size_bytes: number;
  photo_width: number | null;
  photo_height: number | null;
  is_published: boolean;
  sort_order: number;
  created_by_uid: string | null;
  updated_by_uid: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  published_at: Date | string | null;
};

type UserReviewMemoryStore = {
  reviews: Map<string, UserReview>;
  images: Map<string, { body: Buffer; contentType: string; updatedAt: string }>;
};

declare global {
  // Non-production fallback for local DB-less smoke checks. Production refuses this path.
  var __zootopia_user_reviews_memory_store__: UserReviewMemoryStore | undefined;
}

export class UserReviewError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
    public readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "UserReviewError";
  }
}

function getMemoryStore() {
  globalThis.__zootopia_user_reviews_memory_store__ ??= {
    reviews: new Map<string, UserReview>(),
    images: new Map<string, { body: Buffer; contentType: string; updatedAt: string }>(),
  };

  return globalThis.__zootopia_user_reviews_memory_store__;
}

function shouldUseDatabase() {
  return hasZootopiaPostgresPersistence();
}

function assertDurableReviewPersistenceAvailable() {
  if (shouldUseDatabase()) {
    return;
  }

  if (requiresDurableZootopiaPersistence()) {
    throw new UserReviewError(
      "REVIEWS_PERSISTENCE_UNAVAILABLE",
      "Durable review persistence is not configured.",
      503,
    );
  }
}

function normalizeReviewString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes") {
      return true;
    }
    if (normalized === "false" || normalized === "0" || normalized === "no") {
      return false;
    }
  }

  return fallback;
}

function normalizeSortOrder(value: unknown, fallback = 0) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number.parseInt(value, 10)
        : fallback;

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(-100000, Math.min(100000, Math.trunc(parsed)));
}

function normalizePositiveDimension(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : null;
}

function normalizeContentType(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "image/jpg") {
    return "image/jpeg";
  }

  return normalized;
}

function validateTextFields(input: {
  personName: string;
  reviewText: string;
}) {
  const fieldErrors: Record<string, string> = {};

  if (!input.personName) {
    fieldErrors.personName = "Person name is required.";
  } else if (input.personName.length > USER_REVIEW_MAX_NAME_LENGTH) {
    fieldErrors.personName = `Person name must be ${USER_REVIEW_MAX_NAME_LENGTH} characters or fewer.`;
  }

  if (!input.reviewText) {
    fieldErrors.reviewText = "Review text is required.";
  } else if (input.reviewText.length > USER_REVIEW_MAX_TEXT_LENGTH) {
    fieldErrors.reviewText = `Review text must be ${USER_REVIEW_MAX_TEXT_LENGTH} characters or fewer.`;
  }

  if (Object.keys(fieldErrors).length > 0) {
    throw new UserReviewError(
      "REVIEW_VALIDATION_FAILED",
      "Review fields are invalid.",
      400,
      fieldErrors,
    );
  }
}

function validateImageInput(photo: UserReviewImageInput | null | undefined) {
  if (!photo) {
    throw new UserReviewError(
      "REVIEW_PHOTO_REQUIRED",
      "A review photo is required.",
      400,
      { photo: "A review photo is required." },
    );
  }

  const contentType = normalizeContentType(photo.contentType);
  const sizeBytes = Math.trunc(photo.sizeBytes);

  if (!USER_REVIEW_ALLOWED_IMAGE_TYPES.has(contentType)) {
    throw new UserReviewError(
      "REVIEW_PHOTO_TYPE_INVALID",
      "Review photos must be JPEG, PNG, or WEBP images.",
      400,
      { photo: "Choose a JPEG, PNG, or WEBP image." },
    );
  }

  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > USER_REVIEW_MAX_IMAGE_BYTES) {
    throw new UserReviewError(
      "REVIEW_PHOTO_SIZE_INVALID",
      "Review photos must be 3 MB or smaller after optimization.",
      400,
      { photo: "Choose an optimized image up to 3 MB." },
    );
  }

  if (!Buffer.isBuffer(photo.body) || photo.body.byteLength !== sizeBytes) {
    throw new UserReviewError(
      "REVIEW_PHOTO_BODY_INVALID",
      "The uploaded review photo could not be validated.",
      400,
      { photo: "Upload the review photo again." },
    );
  }

  return {
    body: photo.body,
    contentType,
    sizeBytes,
    width: normalizePositiveDimension(photo.width),
    height: normalizePositiveDimension(photo.height),
  };
}

function getPhotoExtension(contentType: string) {
  if (contentType === "image/png") {
    return "png";
  }

  if (contentType === "image/webp") {
    return "webp";
  }

  return "jpg";
}

function buildUserReviewPhotoStoragePath(input: {
  reviewId: string;
  contentType: string;
}) {
  return `${USER_REVIEW_STORAGE_ROOT}/${input.reviewId}/photo.${getPhotoExtension(input.contentType)}`;
}

function assertUserReviewPhotoStoragePath(path: string, reviewId?: string) {
  const normalized = path.replace(/\\/g, "/");
  const pattern = reviewId
    ? new RegExp(`^${USER_REVIEW_STORAGE_ROOT}/${reviewId}/photo\\.(jpg|png|webp)$`)
    : /^reviews\/[0-9a-fA-F-]+\/photo\.(jpg|png|webp)$/;

  if (!pattern.test(normalized)) {
    throw new UserReviewError(
      "REVIEW_PHOTO_PATH_INVALID",
      "The stored review photo path is outside the dedicated reviews namespace.",
      500,
    );
  }

  return normalized;
}

function toIsoString(value: Date | string | null) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapRowToUserReview(row: UserReviewDbRow): UserReview {
  return {
    id: row.id,
    personName: row.person_name,
    reviewText: row.review_text,
    photoStoragePath: row.photo_storage_path,
    photoMimeType: row.photo_mime_type,
    photoSizeBytes: Number(row.photo_size_bytes),
    photoWidth: row.photo_width ?? null,
    photoHeight: row.photo_height ?? null,
    isPublished: Boolean(row.is_published),
    sortOrder: Number(row.sort_order),
    createdByUid: row.created_by_uid ?? null,
    updatedByUid: row.updated_by_uid ?? null,
    createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
    updatedAt: toIsoString(row.updated_at) ?? new Date().toISOString(),
    publishedAt: toIsoString(row.published_at),
  };
}

function compareUserReviews(a: UserReview, b: UserReview) {
  if (a.sortOrder !== b.sortOrder) {
    return b.sortOrder - a.sortOrder;
  }

  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

export function toPublicUserReview(review: UserReview): PublicUserReview {
  return {
    id: review.id,
    personName: review.personName,
    reviewText: review.reviewText,
    photoUrl: `/api/reviews/${encodeURIComponent(review.id)}/image?v=${encodeURIComponent(review.updatedAt)}`,
    photoWidth: review.photoWidth,
    photoHeight: review.photoHeight,
    sortOrder: review.sortOrder,
    createdAt: review.createdAt,
    publishedAt: review.publishedAt,
  };
}

async function uploadReviewPhoto(input: {
  reviewId: string;
  photo: ReturnType<typeof validateImageInput>;
  updatedAt: string;
}) {
  const photoStoragePath = assertUserReviewPhotoStoragePath(
    buildUserReviewPhotoStoragePath({
      reviewId: input.reviewId,
      contentType: input.photo.contentType,
    }),
    input.reviewId,
  );

  if (hasRemoteBlobStorage()) {
    await uploadZootopiaPrivateObject({
      path: photoStoragePath,
      body: input.photo.body,
      contentType: input.photo.contentType,
    });
  } else if (!shouldUseDatabase()) {
    getMemoryStore().images.set(photoStoragePath, {
      body: input.photo.body,
      contentType: input.photo.contentType,
      updatedAt: input.updatedAt,
    });
  } else {
    throw new UserReviewError(
      "REVIEWS_STORAGE_UNAVAILABLE",
      "Review image storage is not configured.",
      503,
    );
  }

  return photoStoragePath;
}

async function readReviewByIdForAdmin(reviewId: string) {
  assertDurableReviewPersistenceAvailable();

  if (!shouldUseDatabase()) {
    return getMemoryStore().reviews.get(reviewId) ?? null;
  }

  const rows = await getZootopiaDatabase().sql<UserReviewDbRow[]>`
    SELECT *
    FROM public.user_reviews
    WHERE id = ${reviewId}
    LIMIT 1
  `;

  return rows[0] ? mapRowToUserReview(rows[0]) : null;
}

async function readPublishedReviewById(reviewId: string) {
  assertDurableReviewPersistenceAvailable();

  if (!shouldUseDatabase()) {
    const review = getMemoryStore().reviews.get(reviewId);
    return review?.isPublished ? review : null;
  }

  const rows = await getZootopiaDatabase().sql<UserReviewDbRow[]>`
    SELECT *
    FROM public.user_reviews
    WHERE id = ${reviewId}
      AND is_published = true
    LIMIT 1
  `;

  return rows[0] ? mapRowToUserReview(rows[0]) : null;
}

export async function listPublishedUserReviews(limit = USER_REVIEW_DEFAULT_LIMIT) {
  assertDurableReviewPersistenceAvailable();
  const normalizedLimit = Math.max(1, Math.min(240, Math.trunc(limit)));

  if (!shouldUseDatabase()) {
    return [...getMemoryStore().reviews.values()]
      .filter((review) => review.isPublished)
      .sort(compareUserReviews)
      .slice(0, normalizedLimit)
      .map(toPublicUserReview);
  }

  const rows = await getZootopiaDatabase().sql<UserReviewDbRow[]>`
    SELECT *
    FROM public.user_reviews
    WHERE is_published = true
    ORDER BY sort_order DESC, created_at DESC
    LIMIT ${normalizedLimit}
  `;

  return rows.map(mapRowToUserReview).map(toPublicUserReview);
}

export async function listUserReviewsForAdmin(limit = 240) {
  assertDurableReviewPersistenceAvailable();
  const normalizedLimit = Math.max(1, Math.min(500, Math.trunc(limit)));

  if (!shouldUseDatabase()) {
    return [...getMemoryStore().reviews.values()]
      .sort(compareUserReviews)
      .slice(0, normalizedLimit);
  }

  const rows = await getZootopiaDatabase().sql<UserReviewDbRow[]>`
    SELECT *
    FROM public.user_reviews
    ORDER BY sort_order DESC, created_at DESC
    LIMIT ${normalizedLimit}
  `;

  return rows.map(mapRowToUserReview);
}

export async function createUserReviewAsAdmin(input: UserReviewMutationInput & {
  actor: UserReviewAdminActor;
}) {
  assertDurableReviewPersistenceAvailable();

  const personName = normalizeReviewString(input.personName);
  const reviewText = normalizeReviewString(input.reviewText);
  const isPublished = normalizeBoolean(input.isPublished, true);
  const sortOrder = normalizeSortOrder(input.sortOrder);
  const photo = validateImageInput(input.photo);
  validateTextFields({ personName, reviewText });

  const id = randomUUID();
  const nowIso = new Date().toISOString();
  const publishedAt = isPublished ? nowIso : null;
  const photoStoragePath = await uploadReviewPhoto({
    reviewId: id,
    photo,
    updatedAt: nowIso,
  });

  const review: UserReview = {
    id,
    personName,
    reviewText,
    photoStoragePath,
    photoMimeType: photo.contentType,
    photoSizeBytes: photo.sizeBytes,
    photoWidth: photo.width,
    photoHeight: photo.height,
    isPublished,
    sortOrder,
    createdByUid: input.actor.uid,
    updatedByUid: input.actor.uid,
    createdAt: nowIso,
    updatedAt: nowIso,
    publishedAt,
  };

  if (!shouldUseDatabase()) {
    getMemoryStore().reviews.set(id, review);
    return review;
  }

  try {
    const rows = await getZootopiaDatabase().sql<UserReviewDbRow[]>`
      INSERT INTO public.user_reviews (
        id,
        person_name,
        review_text,
        photo_storage_path,
        photo_mime_type,
        photo_size_bytes,
        photo_width,
        photo_height,
        is_published,
        sort_order,
        created_by_uid,
        updated_by_uid,
        created_at,
        updated_at,
        published_at
      )
      VALUES (
        ${review.id},
        ${review.personName},
        ${review.reviewText},
        ${review.photoStoragePath},
        ${review.photoMimeType},
        ${review.photoSizeBytes},
        ${review.photoWidth},
        ${review.photoHeight},
        ${review.isPublished},
        ${review.sortOrder},
        ${review.createdByUid},
        ${review.updatedByUid},
        ${review.createdAt},
        ${review.updatedAt},
        ${review.publishedAt}
      )
      RETURNING *
    `;

    return mapRowToUserReview(rows[0]!);
  } catch (error) {
    await deleteZootopiaPrivateObject(photoStoragePath);
    throw error;
  }
}

export async function updateUserReviewAsAdmin(reviewId: string, input: UserReviewMutationInput & {
  actor: UserReviewAdminActor;
}) {
  assertDurableReviewPersistenceAvailable();
  const existing = await readReviewByIdForAdmin(reviewId);
  if (!existing) {
    throw new UserReviewError("REVIEW_NOT_FOUND", "Review not found.", 404);
  }

  const personName =
    input.personName === undefined
      ? existing.personName
      : normalizeReviewString(input.personName);
  const reviewText =
    input.reviewText === undefined
      ? existing.reviewText
      : normalizeReviewString(input.reviewText);
  const isPublished = normalizeBoolean(input.isPublished, existing.isPublished);
  const sortOrder = normalizeSortOrder(input.sortOrder, existing.sortOrder);
  validateTextFields({ personName, reviewText });

  const nowIso = new Date().toISOString();
  let nextPhotoStoragePath = existing.photoStoragePath;
  let nextPhotoMimeType = existing.photoMimeType;
  let nextPhotoSizeBytes = existing.photoSizeBytes;
  let nextPhotoWidth = existing.photoWidth;
  let nextPhotoHeight = existing.photoHeight;
  let uploadedReplacementPath: string | null = null;

  if (input.photo) {
    const photo = validateImageInput(input.photo);
    nextPhotoStoragePath = await uploadReviewPhoto({
      reviewId,
      photo,
      updatedAt: nowIso,
    });
    nextPhotoMimeType = photo.contentType;
    nextPhotoSizeBytes = photo.sizeBytes;
    nextPhotoWidth = photo.width;
    nextPhotoHeight = photo.height;
    uploadedReplacementPath = nextPhotoStoragePath;
  }

  const nextReview: UserReview = {
    ...existing,
    personName,
    reviewText,
    photoStoragePath: nextPhotoStoragePath,
    photoMimeType: nextPhotoMimeType,
    photoSizeBytes: nextPhotoSizeBytes,
    photoWidth: nextPhotoWidth,
    photoHeight: nextPhotoHeight,
    isPublished,
    sortOrder,
    updatedByUid: input.actor.uid,
    updatedAt: nowIso,
    publishedAt: isPublished ? existing.publishedAt ?? nowIso : null,
  };

  if (!shouldUseDatabase()) {
    getMemoryStore().reviews.set(reviewId, nextReview);
    if (uploadedReplacementPath && uploadedReplacementPath !== existing.photoStoragePath) {
      getMemoryStore().images.delete(existing.photoStoragePath);
    }
    return nextReview;
  }

  try {
    const rows = await getZootopiaDatabase().sql<UserReviewDbRow[]>`
      UPDATE public.user_reviews
      SET
        person_name = ${nextReview.personName},
        review_text = ${nextReview.reviewText},
        photo_storage_path = ${nextReview.photoStoragePath},
        photo_mime_type = ${nextReview.photoMimeType},
        photo_size_bytes = ${nextReview.photoSizeBytes},
        photo_width = ${nextReview.photoWidth},
        photo_height = ${nextReview.photoHeight},
        is_published = ${nextReview.isPublished},
        sort_order = ${nextReview.sortOrder},
        updated_by_uid = ${nextReview.updatedByUid},
        updated_at = ${nextReview.updatedAt},
        published_at = ${nextReview.publishedAt}
      WHERE id = ${reviewId}
      RETURNING *
    `;

    const updatedReview = mapRowToUserReview(rows[0]!);
    if (uploadedReplacementPath && uploadedReplacementPath !== existing.photoStoragePath) {
      await deleteZootopiaPrivateObject(existing.photoStoragePath);
    }

    return updatedReview;
  } catch (error) {
    if (uploadedReplacementPath && uploadedReplacementPath !== existing.photoStoragePath) {
      await deleteZootopiaPrivateObject(uploadedReplacementPath);
    }
    throw error;
  }
}

export async function deleteUserReviewAsAdmin(reviewId: string) {
  assertDurableReviewPersistenceAvailable();
  const existing = await readReviewByIdForAdmin(reviewId);
  if (!existing) {
    throw new UserReviewError("REVIEW_NOT_FOUND", "Review not found.", 404);
  }

  if (!shouldUseDatabase()) {
    getMemoryStore().reviews.delete(reviewId);
    getMemoryStore().images.delete(existing.photoStoragePath);
    return existing;
  }

  await getZootopiaDatabase().sql`
    DELETE FROM public.user_reviews
    WHERE id = ${reviewId}
  `;
  await deleteZootopiaPrivateObject(existing.photoStoragePath);
  return existing;
}

export async function getPublishedUserReviewImage(reviewId: string): Promise<UserReviewImagePayload | null> {
  const review = await readPublishedReviewById(reviewId);
  if (!review) {
    return null;
  }

  const storagePath = assertUserReviewPhotoStoragePath(review.photoStoragePath, review.id);

  if (!hasRemoteBlobStorage() && !shouldUseDatabase()) {
    const memoryImage = getMemoryStore().images.get(storagePath);
    return memoryImage
      ? {
          body: memoryImage.body,
          contentType: memoryImage.contentType,
          updatedAt: memoryImage.updatedAt,
        }
      : null;
  }

  const body = await downloadZootopiaPrivateObject(storagePath);
  if (!body) {
    return null;
  }

  return {
    body,
    contentType: review.photoMimeType,
    updatedAt: review.updatedAt,
  };
}
