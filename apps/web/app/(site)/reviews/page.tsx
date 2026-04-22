import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { APP_ROUTES } from "@zootopia/shared-config";
import { MessagesSquare, Quote, Sparkles, ArrowUpRight, ShieldCheck, Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getRequestUiContext } from "@/lib/server/request-context";
import { listPublishedUserReviews } from "@/lib/server/user-reviews";
import { getSiteContent } from "@/lib/site-content";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const uiContext = await getRequestUiContext();
  const siteContent = getSiteContent(uiContext.locale);

  return {
    title: siteContent.reviews.metadataTitle,
    description: siteContent.reviews.metadataDescription,
  };
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ReviewsPage() {
  const uiContext = await getRequestUiContext();
  const siteContent = getSiteContent(uiContext.locale);
  const isArabic = uiContext.locale === "ar";
  /* Reviews are Arabic-first by design, but we still respect explicit English locale selection.
     Keep this route-level dir guard so card flow/order stays genuinely RTL for Arabic users. */
  const reviewsDirection = isArabic ? "rtl" : "ltr";
  let reviews: Awaited<ReturnType<typeof listPublishedUserReviews>> = [];

  try {
    reviews = await listPublishedUserReviews();
  } catch (error) {
    console.warn("[reviews-page] failed to load published reviews; rendering public fallback", {
      error: error instanceof Error ? error.name : "UNKNOWN",
    });
  }

  const numberFormatter = new Intl.NumberFormat(uiContext.locale === "ar" ? "ar-EG" : "en-US");

  return (
    <div dir={reviewsDirection} className="space-y-6">
      <section className="surface-card relative overflow-hidden px-5 py-8 sm:px-7 sm:py-10 lg:px-10">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(16,185,129,0.13),transparent_35%),linear-gradient(315deg,rgba(242,198,106,0.16),transparent_48%)] dark:bg-[linear-gradient(135deg,rgba(16,185,129,0.18),transparent_35%),linear-gradient(315deg,rgba(34,211,238,0.1),transparent_52%)]" />
        <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.42fr)] lg:items-end">
          <div className="max-w-4xl space-y-5">
            <span
              className={cn(
                "inline-flex w-fit items-center gap-2 rounded-full border border-emerald-300/35 bg-emerald-400/10 px-4 py-2 text-xs font-black text-emerald-700 dark:text-emerald-200",
                isArabic ? "tracking-normal" : "uppercase tracking-[0.18em]",
              )}
            >
              <MessagesSquare className="h-4 w-4" />
              {siteContent.reviews.eyebrow}
            </span>
            <div className="space-y-4">
              <h1 className="font-[family-name:var(--font-display)] text-4xl font-black leading-tight tracking-tight text-foreground sm:text-5xl lg:text-6xl">
                {siteContent.reviews.title}
              </h1>
              <p className="max-w-3xl text-base leading-8 text-foreground-muted sm:text-lg">
                {siteContent.reviews.subtitle}
              </p>
            </div>
          </div>

          <aside className="rounded-[1.7rem] border border-emerald-300/25 bg-background-strong/72 p-5 shadow-[0_18px_46px_rgba(15,23,42,0.1)] backdrop-blur-xl dark:border-emerald-200/15 dark:bg-zinc-950/45">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-foreground-muted">
                  {siteContent.reviews.countLabel}
                </p>
                <p className="mt-2 text-4xl font-black tracking-tight text-foreground">
                  {numberFormatter.format(reviews.length)}
                </p>
              </div>
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/30 bg-cyan-400/12 text-cyan-700 dark:text-cyan-200">
                <Sparkles className="h-6 w-6" />
              </span>
            </div>
            <p className="mt-4 text-sm leading-7 text-foreground-muted">
              {siteContent.reviews.footerBody}
            </p>
          </aside>
        </div>
      </section>

      {reviews.length > 0 ? (
        /* Testimonials are mapped through one repeatable premium card shell so large datasets
           keep consistent spacing, rhythm, and alignment from mobile to wide desktop. */
        <section className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,19rem),1fr))] xl:gap-6">
          {reviews.map((review, index) => (
            <article
              key={review.id}
              className="group relative flex min-h-[18rem] flex-col rounded-[1.8rem] border border-border/70 bg-background-elevated/78 p-5 shadow-[0_16px_38px_rgba(15,23,42,0.08)] backdrop-blur-xl transition-all hover:-translate-y-1 hover:border-emerald-400/30 hover:shadow-[0_20px_48px_rgba(16,185,129,0.12)] dark:bg-zinc-950/45"
            >
              <header className="mb-4 flex items-start gap-3">
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border border-emerald-300/35 bg-white/80 shadow-[0_8px_20px_rgba(15,23,42,0.08)] dark:border-emerald-200/20 dark:bg-zinc-900/80">
                  {/* Review avatars use object-contain inside a circular frame to preserve the
                     full portrait/photo as much as possible and avoid aggressive face cropping. */}
                  <Image
                    src={review.photoUrl}
                    alt={review.personName}
                    fill
                    sizes="64px"
                    className="object-contain p-1.5"
                    priority={index < 6}
                    unoptimized
                  />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <h2
                      dir="auto"
                      className="break-words font-[family-name:var(--font-display)] text-lg font-black tracking-tight text-foreground [overflow-wrap:anywhere]"
                    >
                      {review.personName}
                    </h2>
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/35 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-black text-emerald-700 dark:text-emerald-200">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      {siteContent.reviews.publishedBadge}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-gold">
                    <Star className="h-3.5 w-3.5 fill-current" />
                    <Star className="h-3.5 w-3.5 fill-current" />
                    <Star className="h-3.5 w-3.5 fill-current" />
                    <Star className="h-3.5 w-3.5 fill-current" />
                    <Star className="h-3.5 w-3.5 fill-current" />
                  </div>
                </div>
              </header>

              <div className="relative flex-1 rounded-[1.25rem] border border-border/70 bg-background-strong/88 p-4 dark:border-white/10 dark:bg-zinc-950/68">
                <span className="absolute end-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full border border-emerald-300/30 bg-emerald-400/10 text-emerald-700 dark:text-emerald-200">
                  <Quote className="h-4 w-4" />
                </span>
                <p
                  dir="auto"
                  className="whitespace-pre-line break-words pe-9 text-base font-medium leading-8 text-foreground [overflow-wrap:anywhere]"
                >
                  {review.reviewText}
                </p>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className="surface-card px-6 py-10 text-center sm:px-8">
          <div className="mx-auto flex max-w-2xl flex-col items-center gap-4">
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-300/30 bg-emerald-400/12 text-emerald-700 dark:text-emerald-200">
              <MessagesSquare className="h-6 w-6" />
            </span>
            <div className="space-y-2">
              <h2 className="text-2xl font-black tracking-tight text-foreground">
                {siteContent.reviews.emptyTitle}
              </h2>
              <p className="text-sm leading-7 text-foreground-muted">
                {siteContent.reviews.emptyBody}
              </p>
            </div>
          </div>
        </section>
      )}

      <section className="surface-card overflow-hidden px-6 py-7 sm:px-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="max-w-3xl space-y-2">
            <p className="section-label text-emerald-700 dark:text-emerald-200">
              {siteContent.reviews.footerTitle}
            </p>
            <p className="text-sm leading-7 text-foreground-muted sm:text-base">
              {siteContent.reviews.footerBody}
            </p>
          </div>
          <Button asChild className="rounded-full">
            <Link href={APP_ROUTES.contact}>
              {siteContent.reviews.footerCta}
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
