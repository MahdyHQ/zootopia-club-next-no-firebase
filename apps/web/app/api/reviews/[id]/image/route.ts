import { NextResponse } from "next/server";

import { getPublishedUserReviewImage, UserReviewError } from "@/lib/server/user-reviews";

export const runtime = "nodejs";
/* This public image route intentionally serves only published review photos from private
   storage. It does not expose raw bucket paths, and its short public cache keeps admin
   unpublish/delete actions from leaving long-lived testimonial photo responses behind. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function readReviewId(context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  return String(params.id ?? "").trim();
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const reviewId = await readReviewId(context);
  if (!reviewId) {
    return NextResponse.json({ ok: false, error: "Review id is required." }, { status: 400 });
  }

  try {
    const image = await getPublishedUserReviewImage(reviewId);
    if (!image) {
      return NextResponse.json({ ok: false, error: "Review photo not found." }, { status: 404 });
    }

    const body = image.body.buffer.slice(
      image.body.byteOffset,
      image.body.byteOffset + image.body.byteLength,
    ) as ArrayBuffer;

    return new Response(body, {
      status: 200,
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=300, must-revalidate",
        "Content-Type": image.contentType,
        "Last-Modified": new Date(image.updatedAt).toUTCString(),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof UserReviewError && error.status < 500) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }

    console.error("[api-review-image] failed to serve review image", {
      reviewId,
      error: error instanceof Error ? error.name : "UNKNOWN",
    });

    return NextResponse.json(
      { ok: false, error: "Review photo is temporarily unavailable." },
      { status: 503 },
    );
  }
}
