import { APP_ROUTES } from "@zootopia/shared-config";
import { ChevronLeft, MessagesSquare, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { UserReviewAdminWorkspace } from "@/components/admin/user-review-admin-workspace";
import { Button } from "@/components/ui/button";
import { getRequestUiContext } from "@/lib/server/request-context";
import { requireAdminUser } from "@/lib/server/session";
import { listUserReviewsForAdmin } from "@/lib/server/user-reviews";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminReviewsPage() {
  /* This page is the human admin workspace for public testimonial content.
     Keep this page-level guard even though the parent admin layout also guards access:
     review publication controls must always fail closed before any management data is read. */
  await requireAdminUser();
  const uiContext = await getRequestUiContext();
  let reviews: Awaited<ReturnType<typeof listUserReviewsForAdmin>> = [];
  let reviewsDegraded = false;

  try {
    reviews = await listUserReviewsForAdmin();
  } catch (error) {
    reviewsDegraded = true;
    console.warn("[admin-reviews-page] failed to load reviews; rendering safe admin fallback", {
      error: error instanceof Error ? error.name : "UNKNOWN",
    });
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <section className="relative overflow-hidden rounded-[2rem] border border-white/20 bg-white/70 p-6 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/45 sm:p-8">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(16,185,129,0.12),transparent_38%),linear-gradient(315deg,rgba(34,211,238,0.1),transparent_54%)]" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
              <ShieldCheck className="h-3.5 w-3.5" />
              {uiContext.messages.navAdminReviews}
            </span>
            <h1 className="mt-4 flex items-center gap-3 font-[family-name:var(--font-display)] text-3xl font-black tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-4xl">
              <MessagesSquare className="h-8 w-8 text-cyan-500" />
              {uiContext.messages.adminReviewsTitle}
            </h1>
            <p className="mt-3 text-sm leading-7 text-zinc-600 dark:text-zinc-300 sm:text-base">
              {uiContext.messages.adminReviewsSubtitle}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="rounded-full bg-white/50 dark:bg-zinc-900/50">
              <Link href={APP_ROUTES.admin}>
                <ChevronLeft className="h-4 w-4" />
                {uiContext.messages.adminReviewsBackToAdmin}
              </Link>
            </Button>
            <Button asChild className="rounded-full">
              <Link href={APP_ROUTES.reviews}>{uiContext.messages.adminReviewsOpenPublicPage}</Link>
            </Button>
          </div>
        </div>
      </section>

      {reviewsDegraded ? (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm font-medium text-amber-700 dark:text-amber-200">
          {uiContext.messages.adminReviewsFailed}
        </div>
      ) : null}

      <UserReviewAdminWorkspace
        initialReviews={reviews}
        locale={uiContext.locale}
        messages={uiContext.messages}
      />
    </div>
  );
}
