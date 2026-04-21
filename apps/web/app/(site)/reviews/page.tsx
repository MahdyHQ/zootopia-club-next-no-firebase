import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { APP_ROUTES } from "@zootopia/shared-config";
import { MessagesSquare, Quote, Sparkles, ArrowUpRight, ShieldCheck } from "lucide-react";

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
    <div className="space-y-6">
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
        /* Reviews use a fluid auto-fit grid with a generous min column width so cards
           stay readable on phones and scale into a calm gallery on large screens. */
        <section className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,20rem),1fr))] xl:gap-6">
          {reviews.map((review, index) => (
            <article
              key={review.id}
              className="group relative flex min-h-[25rem] flex-col overflow-hidden rounded-[2rem] border border-border/70 bg-background-elevated/72 p-4 shadow-[0_18px_45px_rgba(15,23,42,0.08)] backdrop-blur-2xl transition-all hover:-translate-y-1 hover:border-emerald-400/30 hover:shadow-[0_22px_55px_rgba(16,185,129,0.12)] dark:bg-zinc-950/42"
            >
              <div className="relative min-h-48 overflow-hidden rounded-[1.55rem] border border-white/30 bg-background-strong dark:border-white/10">
                <Image
                  src={review.photoUrl}
                  alt={review.personName}
                  fill
                  sizes="(min-width: 1280px) 28vw, (min-width: 768px) 45vw, 92vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.035]"
                  priority={index < 3}
                  unoptimized
                />
                <span className="absolute start-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-white/45 bg-white/82 px-3 py-1 text-xs font-black text-emerald-700 shadow-sm backdrop-blur dark:border-white/15 dark:bg-zinc-950/72 dark:text-emerald-200">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {siteContent.reviews.publishedBadge}
                </span>
              </div>

              <div className="relative -mt-8 flex flex-1 flex-col px-1">
                <div className="relative flex flex-1 flex-col rounded-[1.6rem] border border-border/80 bg-background-strong/92 p-5 shadow-[0_16px_42px_rgba(15,23,42,0.1)] backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/82">
                  <span className="absolute -top-5 end-6 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-300/35 bg-emerald-400/14 text-emerald-700 shadow-sm dark:text-emerald-200">
                    <Quote className="h-5 w-5" />
                  </span>
                  <p
                    dir="auto"
                    className="flex-1 whitespace-pre-line break-words pt-2 text-base font-medium leading-8 text-foreground [overflow-wrap:anywhere]"
                  >
                    {review.reviewText}
                  </p>
                  <div className="mt-5 border-t border-border/70 pt-4">
                    <h2
                      dir="auto"
                      className="break-words font-[family-name:var(--font-display)] text-xl font-black tracking-tight text-foreground [overflow-wrap:anywhere]"
                    >
                      {review.personName}
                    </h2>
                  </div>
                </div>
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
