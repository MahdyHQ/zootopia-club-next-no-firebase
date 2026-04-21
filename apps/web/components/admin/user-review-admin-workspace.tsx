"use client";

import type {
  AdminUserReviewMutationResponse,
  ApiResult,
  Locale,
  UserReview,
} from "@zootopia/shared-types";
import { APP_ROUTES } from "@zootopia/shared-config";
import {
  CheckCircle2,
  ImagePlus,
  Loader2,
  Pencil,
  RotateCcw,
  Trash2,
  UploadCloud,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import type { AppMessages } from "@/lib/messages";

type UserReviewAdminWorkspaceProps = {
  initialReviews: UserReview[];
  locale: Locale;
  messages: AppMessages;
};

type ReviewFormState = {
  personName: string;
  reviewText: string;
  sortOrder: string;
  isPublished: boolean;
};

const EMPTY_FORM: ReviewFormState = {
  personName: "",
  reviewText: "",
  sortOrder: "0",
  isPublished: true,
};

const REVIEW_IMAGE_MAX_SIDE = 1080;
const REVIEW_IMAGE_QUALITY = 0.84;

function getReviewImageUrl(review: UserReview) {
  return `/api/reviews/${encodeURIComponent(review.id)}/image?v=${encodeURIComponent(review.updatedAt)}`;
}

function readApiMessage<T>(result: ApiResult<T>, fallback: string) {
  return result.ok ? fallback : result.error.message || fallback;
}

async function decodeImageDimensions(file: File) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new window.Image();
    image.decoding = "async";
    image.src = objectUrl;
    await image.decode().catch(
      () =>
        new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error("IMAGE_DECODE_FAILED"));
        }),
    );

    return {
      image,
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function optimizeReviewImage(file: File) {
  /* Admin-side compression keeps testimonial photos lightweight before transfer.
     This is a UX/performance layer only: the API route still validates MIME, size,
     admin identity, and the dedicated reviews storage path before writing truth. */
  const decoded = await decodeImageDimensions(file);
  const scale = Math.min(
    1,
    REVIEW_IMAGE_MAX_SIDE / Math.max(decoded.width, decoded.height, 1),
  );
  const width = Math.max(1, Math.round(decoded.width * scale));
  const height = Math.max(1, Math.round(decoded.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) {
    return { file, width: decoded.width, height: decoded.height };
  }

  context.drawImage(decoded.image, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/webp", REVIEW_IMAGE_QUALITY);
  });

  if (!blob) {
    return { file, width, height };
  }

  const optimizedFile = new File(
    [blob],
    file.name.replace(/\.[^.]+$/, "") + ".webp",
    { type: "image/webp" },
  );
  const shouldUseOptimizedFile =
    optimizedFile.size < file.size || file.size > 3 * 1024 * 1024;

  return {
    file: shouldUseOptimizedFile ? optimizedFile : file,
    width: shouldUseOptimizedFile ? width : decoded.width,
    height: shouldUseOptimizedFile ? height : decoded.height,
  };
}

export function UserReviewAdminWorkspace({
  initialReviews,
  locale,
  messages,
}: UserReviewAdminWorkspaceProps) {
  const [reviews, setReviews] = useState<UserReview[]>(initialReviews);
  const [formState, setFormState] = useState<ReviewFormState>(EMPTY_FORM);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isMutatingId, setIsMutatingId] = useState<string | null>(null);

  const editingReview = useMemo(
    () => reviews.find((review) => review.id === editingReviewId) ?? null,
    [editingReviewId, reviews],
  );
  const isRtl = locale === "ar";

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [selectedFile]);

  function resetForm() {
    setFormState(EMPTY_FORM);
    setSelectedFile(null);
    setEditingReviewId(null);
  }

  function beginEdit(review: UserReview) {
    setEditingReviewId(review.id);
    setSelectedFile(null);
    setFormState({
      personName: review.personName,
      reviewText: review.reviewText,
      sortOrder: String(review.sortOrder),
      isPublished: review.isPublished,
    });
    setStatusMessage(null);
  }

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingReviewId && !selectedFile) {
      setStatusMessage(messages.adminReviewsPhotoRequired);
      return;
    }

    setIsSaving(true);
    setStatusMessage(selectedFile ? messages.adminReviewsImageOptimizing : messages.adminReviewsSaving);

    try {
      const formData = new FormData();
      formData.set("personName", formState.personName);
      formData.set("reviewText", formState.reviewText);
      formData.set("sortOrder", formState.sortOrder);
      formData.set("isPublished", String(formState.isPublished));

      if (selectedFile) {
        const optimized = await optimizeReviewImage(selectedFile);
        formData.set("photo", optimized.file);
        formData.set("photoWidth", String(optimized.width));
        formData.set("photoHeight", String(optimized.height));
      }

      setStatusMessage(messages.adminReviewsSaving);
      const response = await fetch(
        editingReviewId
          ? `/api/admin/reviews/${encodeURIComponent(editingReviewId)}`
          : "/api/admin/reviews",
        {
          method: editingReviewId ? "PATCH" : "POST",
          body: formData,
        },
      );
      const result = (await response.json()) as ApiResult<AdminUserReviewMutationResponse>;

      if (!response.ok || !result.ok) {
        throw new Error(readApiMessage(result, messages.adminReviewsFailed));
      }

      setReviews(result.data.reviews);
      resetForm();
      setStatusMessage(messages.adminReviewsSaved);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : messages.adminReviewsFailed);
    } finally {
      setIsSaving(false);
    }
  }

  async function mutateReview(review: UserReview, action: "toggle" | "delete") {
    if (action === "delete" && !window.confirm(messages.adminReviewsDeleteConfirm)) {
      return;
    }

    setIsMutatingId(review.id);
    setStatusMessage(null);

    try {
      const response = await fetch(`/api/admin/reviews/${encodeURIComponent(review.id)}`, {
        method: action === "delete" ? "DELETE" : "PATCH",
        body:
          action === "delete"
            ? undefined
            : (() => {
                const formData = new FormData();
                formData.set("personName", review.personName);
                formData.set("reviewText", review.reviewText);
                formData.set("sortOrder", String(review.sortOrder));
                formData.set("isPublished", String(!review.isPublished));
                return formData;
              })(),
      });
      const result = (await response.json()) as ApiResult<AdminUserReviewMutationResponse>;

      if (!response.ok || !result.ok) {
        throw new Error(readApiMessage(result, messages.adminReviewsFailed));
      }

      setReviews(result.data.reviews);
      if (editingReviewId === review.id) {
        resetForm();
      }
      setStatusMessage(
        action === "delete" ? messages.adminReviewsDeleted : messages.adminReviewsSaved,
      );
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : messages.adminReviewsFailed);
    } finally {
      setIsMutatingId(null);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <form
        onSubmit={submitReview}
        className="rounded-[2rem] border border-white/20 bg-white/68 p-5 shadow-sm backdrop-blur-2xl dark:border-white/10 dark:bg-zinc-950/45 sm:p-6"
      >
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-2xl font-black tracking-tight text-zinc-900 dark:text-zinc-100">
              {messages.adminReviewsFormTitle}
            </h2>
            <p className="mt-2 text-sm leading-7 text-zinc-600 dark:text-zinc-300">
              {messages.adminReviewsFormSubtitle}
            </p>
          </div>
          {editingReview ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={resetForm}
            >
              <RotateCcw className="h-4 w-4" />
              {messages.adminReviewsCancelEditAction}
            </Button>
          ) : null}
        </div>

        <div className="space-y-5">
          <div className="space-y-2">
            <label className="field-label" htmlFor="review-person-name">
              {messages.adminReviewsNameLabel}
            </label>
            <input
              id="review-person-name"
              className="field-control"
              value={formState.personName}
              maxLength={160}
              placeholder={messages.adminReviewsNamePlaceholder}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  personName: event.target.value,
                }))
              }
              required
            />
          </div>

          <div className="space-y-2">
            <label className="field-label" htmlFor="review-text">
              {messages.adminReviewsTextLabel}
            </label>
            <textarea
              id="review-text"
              className="field-control min-h-44 resize-y whitespace-pre-wrap leading-7"
              value={formState.reviewText}
              maxLength={4000}
              placeholder={messages.adminReviewsTextPlaceholder}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  reviewText: event.target.value,
                }))
              }
              required
            />
          </div>

          <div className="space-y-3">
            <label className="field-label" htmlFor="review-photo">
              {messages.adminReviewsPhotoLabel}
            </label>
            <label
              htmlFor="review-photo"
              className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-[1.5rem] border border-dashed border-emerald-400/35 bg-emerald-500/7 px-4 py-6 text-center transition hover:bg-emerald-500/10 dark:border-emerald-300/25 dark:bg-emerald-400/7"
            >
              {previewUrl || editingReview ? (
                <span className="relative h-28 w-28 overflow-hidden rounded-full border-4 border-white shadow-lg dark:border-zinc-900">
                  <Image
                    src={previewUrl ?? getReviewImageUrl(editingReview!)}
                    alt=""
                    fill
                    sizes="112px"
                    className="object-cover"
                    unoptimized
                  />
                </span>
              ) : (
                <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-300/35 bg-white/65 text-emerald-700 dark:border-emerald-200/20 dark:bg-zinc-950/55 dark:text-emerald-200">
                  <ImagePlus className="h-6 w-6" />
                </span>
              )}
              <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                {selectedFile?.name || messages.adminReviewsPhotoHint}
              </span>
            </label>
            <input
              id="review-photo"
              type="file"
              className="sr-only"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div className="space-y-2">
              <label className="field-label" htmlFor="review-sort-order">
                {messages.adminReviewsSortOrderLabel}
              </label>
              <input
                id="review-sort-order"
                type="number"
                className="field-control"
                value={formState.sortOrder}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    sortOrder: event.target.value,
                  }))
                }
              />
            </div>
            <label className="flex h-12 items-center gap-3 rounded-2xl border border-border/70 bg-background/70 px-4 text-sm font-bold text-zinc-700 dark:bg-zinc-950/40 dark:text-zinc-200">
              <input
                type="checkbox"
                className="h-4 w-4 accent-emerald-600"
                checked={formState.isPublished}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    isPublished: event.target.checked,
                  }))
                }
              />
              {messages.adminReviewsPublishedLabel}
            </label>
          </div>

          {statusMessage ? (
            <div className="flex items-start gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-800 dark:text-emerald-100">
              {isSaving ? (
                <Loader2 className="mt-0.5 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mt-0.5 h-4 w-4" />
              )}
              <span className="break-words">{statusMessage}</span>
            </div>
          ) : null}

          <Button type="submit" className="w-full rounded-full" disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
            {isSaving
              ? messages.adminReviewsSaving
              : editingReviewId
                ? messages.adminReviewsUpdateAction
                : messages.adminReviewsSaveAction}
          </Button>
        </div>
      </form>

      <section className="rounded-[2rem] border border-white/20 bg-white/68 p-5 shadow-sm backdrop-blur-2xl dark:border-white/10 dark:bg-zinc-950/45 sm:p-6">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-2xl font-black tracking-tight text-zinc-900 dark:text-zinc-100">
              {messages.adminReviewsListTitle}
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
              {reviews.length} {messages.navAdminReviews}
            </p>
          </div>
          <Button asChild variant="outline" size="sm" className="rounded-full">
            <Link href={APP_ROUTES.reviews}>{messages.adminReviewsOpenPublicPage}</Link>
          </Button>
        </div>

        {reviews.length === 0 ? (
          <div className="rounded-[1.5rem] border border-dashed border-zinc-300/70 bg-white/45 px-5 py-8 text-center text-sm font-medium text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/35 dark:text-zinc-400">
            {messages.adminReviewsEmpty}
          </div>
        ) : (
          <div className="space-y-4">
            {reviews.map((review) => (
              <article
                key={review.id}
                className="overflow-hidden rounded-[1.65rem] border border-white/25 bg-white/62 p-4 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/45"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-start">
                  <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-3xl border border-white/50 bg-background-strong dark:border-white/10">
                    <Image
                      src={getReviewImageUrl(review)}
                      alt={review.personName}
                      fill
                      sizes="96px"
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3
                        dir="auto"
                        className="break-words text-lg font-black text-zinc-900 [overflow-wrap:anywhere] dark:text-zinc-100"
                      >
                        {review.personName}
                      </h3>
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${
                          review.isPublished
                            ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
                            : "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-200"
                        }`}
                      >
                        {review.isPublished
                          ? messages.adminReviewsStatusPublished
                          : messages.adminReviewsStatusDraft}
                      </span>
                    </div>
                    <p
                      dir="auto"
                      className="mt-2 line-clamp-3 break-words text-sm leading-7 text-zinc-600 [overflow-wrap:anywhere] dark:text-zinc-300"
                    >
                      {review.reviewText}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-full"
                        onClick={() => beginEdit(review)}
                      >
                        <Pencil className="h-4 w-4" />
                        {messages.adminReviewsEditAction}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="rounded-full"
                        disabled={isMutatingId === review.id}
                        onClick={() => mutateReview(review, "toggle")}
                      >
                        {isMutatingId === review.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {review.isPublished
                          ? messages.adminReviewsUnpublishAction
                          : messages.adminReviewsPublishAction}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="rounded-full"
                        disabled={isMutatingId === review.id}
                        onClick={() => mutateReview(review, "delete")}
                      >
                        <Trash2 className="h-4 w-4" />
                        {messages.adminReviewsDeleteAction}
                      </Button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        <p className={`mt-5 text-xs leading-6 text-zinc-500 dark:text-zinc-400 ${isRtl ? "text-right" : ""}`}>
          {messages.adminReviewsFormSubtitle}
        </p>
      </section>
    </div>
  );
}
