"use client";

import { APP_ROUTES } from "@zootopia/shared-config";
import type { Locale } from "@zootopia/shared-types";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCcw, WalletCards } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import {
  formatAssessmentCreditCount,
  resolveAssessmentCreditDisplayModel,
} from "@/lib/assessment-credit-display";
import {
  invalidateAssessmentCreditSummaryQuery,
  useAssessmentCreditSummaryQuery,
} from "@/lib/assessment-credit-query";
import type { AppMessages } from "@/lib/messages";

type AssessmentCreditDetailsPanelProps = {
  locale: Locale;
  messages: AppMessages;
};

function formatAssessmentCreditResetAt(input: {
  locale: Locale;
  resetsAt: string | null;
}) {
  if (!input.resetsAt) {
    return "-";
  }

  const parsedDate = new Date(input.resetsAt);
  if (Number.isNaN(parsedDate.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat(input.locale === "ar" ? "ar-EG" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsedDate);
}

export function AssessmentCreditDetailsPanel({
  locale,
  messages,
}: AssessmentCreditDetailsPanelProps) {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  /* This page intentionally reuses the same shared TanStack query key as the protected header and
     Assessment Studio. Do not add a parallel fetch/cache path here, or credit UI can drift again. */
  const creditSummaryQuery = useAssessmentCreditSummaryQuery({
    source: "assessment-credit-details",
  });
  const creditSummary = creditSummaryQuery.data ?? null;
  const creditDisplay = creditSummary
    ? resolveAssessmentCreditDisplayModel(creditSummary)
    : null;

  const resetAtLabel = useMemo(
    () =>
      formatAssessmentCreditResetAt({
        locale,
        resetsAt: creditSummary?.resetsAt ?? null,
      }),
    [creditSummary?.resetsAt, locale],
  );

  const summaryNarrative = !creditDisplay
    ? messages.loading
    : creditDisplay.state === "admin_exempt"
      ? messages.assessmentDailyCreditsAdminExemptBody
      : creditDisplay.state === "access_disabled"
        ? messages.assessmentAccessDisabledBody
        : (creditDisplay.totalAvailable ?? 0) > 0
          ? messages.assessmentDailyCreditsRenewsTomorrow
          : messages.assessmentDailyCreditsExhaustedBody;

  const totalAvailableLabel = !creditDisplay || creditDisplay.state === "admin_exempt"
    ? messages.roleAdmin
    : formatAssessmentCreditCount(creditDisplay.totalAvailable ?? 0, locale);

  const dailyAvailableLabel = !creditDisplay
    ? messages.loading
    : formatAssessmentCreditCount(creditDisplay.dailyAvailable ?? 0, locale);

  const extraAvailableLabel = !creditDisplay
    ? messages.loading
    : formatAssessmentCreditCount(creditDisplay.extraAvailable ?? 0, locale);

  const manualAvailableLabel = !creditSummary
    ? messages.loading
    : formatAssessmentCreditCount(creditSummary.manualCreditsAvailable, locale);

  const grantAvailableLabel = !creditSummary
    ? messages.loading
    : formatAssessmentCreditCount(creditSummary.grantCreditsAvailable, locale);

  async function handleRefresh() {
    setIsRefreshing(true);

    try {
      await invalidateAssessmentCreditSummaryQuery(queryClient, {
        source: "assessment-credit-details",
        reason: "manual-refresh",
      });
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <section className="surface-strong space-y-6 rounded-[2rem] p-5 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="space-y-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-200">
            <WalletCards className="h-3.5 w-3.5" />
            {messages.assessmentCreditsPageTitle}
          </span>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {messages.assessmentCreditsPageSubtitle}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-background-elevated/70 px-3 py-2 text-xs font-semibold text-foreground transition hover:border-emerald-500/30 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:text-emerald-200"
          >
            <RefreshCcw className={`h-3.5 w-3.5${isRefreshing ? " animate-spin" : ""}`} />
            {messages.assessmentCreditsRefreshAction}
          </button>
          <Link
            href={APP_ROUTES.assessment}
            className="inline-flex items-center rounded-xl border border-border bg-background-elevated/70 px-3 py-2 text-xs font-semibold text-foreground transition hover:border-emerald-500/30 hover:text-emerald-700 dark:hover:text-emerald-200"
          >
            {messages.assessmentCreditsBackToAssessmentAction}
          </Link>
        </div>
      </div>

      {creditSummaryQuery.error ? (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-200">
          {messages.assessmentCreditsSummaryUnavailable}
        </div>
      ) : null}

      <div className="rounded-[1.4rem] border border-emerald-500/12 bg-[linear-gradient(145deg,rgba(16,185,129,0.08),rgba(14,165,233,0.05))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] dark:bg-[linear-gradient(145deg,rgba(16,185,129,0.12),rgba(14,165,233,0.08))]">
        <p className="text-sm leading-7 text-foreground-muted">{summaryNarrative}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <article className="rounded-2xl border border-border bg-background-elevated/70 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-foreground-muted">
            {messages.assessmentCreditsTotalAvailableLabel}
          </p>
          <p className="mt-2 text-2xl font-bold text-foreground">{totalAvailableLabel}</p>
        </article>

        <article className="rounded-2xl border border-border bg-background-elevated/70 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-foreground-muted">
            {messages.assessmentCreditsDailyAvailableLabel}
          </p>
          <p className="mt-2 text-2xl font-bold text-foreground">{dailyAvailableLabel}</p>
        </article>

        <article className="rounded-2xl border border-border bg-background-elevated/70 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-foreground-muted">
            {messages.assessmentCreditsExtraAvailableLabel}
          </p>
          <p className="mt-2 text-2xl font-bold text-foreground">{extraAvailableLabel}</p>
        </article>

        <article className="rounded-2xl border border-border bg-background-elevated/70 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-foreground-muted">
            {messages.assessmentDailyCreditsUsedLabel}
          </p>
          <p className="mt-2 text-2xl font-bold text-foreground">
            {creditSummary
              ? formatAssessmentCreditCount(creditSummary.usedCount, locale)
              : messages.loading}
          </p>
        </article>

        <article className="rounded-2xl border border-border bg-background-elevated/70 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-foreground-muted">
            {messages.assessmentCreditsManualAvailableLabel}
          </p>
          <p className="mt-2 text-2xl font-bold text-foreground">{manualAvailableLabel}</p>
        </article>

        <article className="rounded-2xl border border-border bg-background-elevated/70 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-foreground-muted">
            {messages.assessmentCreditsGrantAvailableLabel}
          </p>
          <p className="mt-2 text-2xl font-bold text-foreground">{grantAvailableLabel}</p>
        </article>
      </div>

      <div className="rounded-xl border border-border bg-background-elevated/70 px-4 py-3 text-sm text-foreground-muted">
        <span className="font-semibold text-foreground">{messages.assessmentCreditsResetsAtLabel}</span>{" "}
        {resetAtLabel}
      </div>
    </section>
  );
}
