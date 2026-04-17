"use client";

import { APP_ROUTES } from "@zootopia/shared-config";
import type {
  AdminAssessmentCreditMutationRecord,
  AssessmentCreditDetailsResponse,
  AssessmentCreditGrantAdminView,
  Locale,
} from "@zootopia/shared-types";
import { useQueryClient } from "@tanstack/react-query";
import { Clock3, RefreshCcw, ShieldCheck, WalletCards } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import {
  formatAssessmentCreditCount,
  resolveAssessmentCreditDisplayModel,
} from "@/lib/assessment-credit-display";
import {
  invalidateAssessmentCreditQueries,
  useAssessmentCreditDetailsQuery,
  useAssessmentCreditSummaryQuery,
} from "@/lib/assessment-credit-query";
import type { AppMessages } from "@/lib/messages";

type AssessmentCreditDetailsPanelProps = {
  locale: Locale;
  messages: AppMessages;
};

type CreditBreakdownRow = {
  id: string;
  sourceLabel: string;
  currentAvailable: number | null;
  originalAmount: number | null;
  consumed: number | null;
  statusLabel: string;
  createdAt: string | null;
  expiresAt: string | null;
  createdByLabel: string;
  reason: string | null;
  note: string | null;
};

function getAssessmentCreditDetailsCopy(locale: Locale) {
  return locale === "ar"
    ? {
        accessStatusLabel: "حالة الوصول",
        promptEntitlementLabel: "أهلية البرومبت",
        computedAtLabel: "تم الحساب عند",
        enabledLabel: "مفعل",
        disabledLabel: "معطل",
        sourceBreakdownTitle: "تفصيل مصادر الكريدت",
        sourceBreakdownSubtitle:
          "المصادر الفعلية التي يعتمد عليها الرصيد القابل للاستخدام حالياً لهذا الحساب.",
        sourceBreakdownUnavailable:
          "تعذر تحميل تفاصيل مصادر الكريدت حالياً. يظل الملخص المعتمد في الأعلى هو المصدر الصحيح.",
        sourceBreakdownEmpty:
          "لا توجد حالياً مصادر يدوية أو منح نشطة. الرصيد المتبقي يأتي فقط من النافذة اليومية الحالية أو لا يوجد رصيد متاح.",
        historyTitle: "سجل التغييرات",
        historySubtitle: "أحدث التغييرات المعتمدة على رصيد هذا الحساب.",
        historyUnavailable:
          "تعذر تحميل سجل تغييرات الكريدت حالياً. جرّب التحديث بعد قليل.",
        historyEmpty: "لا توجد تغييرات محفوظة على الكريدت حتى الآن.",
        sourceLabel: "المصدر",
        currentAvailableLabel: "المتاح الآن",
        originalAmountLabel: "الأصل",
        consumedLabel: "المستهلك",
        statusLabel: "الحالة",
        createdAtLabel: "تاريخ الإنشاء",
        expiresAtLabel: "تاريخ الانتهاء",
        createdByLabel: "أنشأه",
        reasonLabel: "السبب",
        noteLabel: "ملاحظة",
        timeLabel: "الوقت",
        operationLabel: "العملية",
        actorLabel: "الفاعل",
        beforeLabel: "قبل",
        afterLabel: "بعد",
        correlationLabel: "معرّف التتبع",
        expiryLabel: "الانتهاء",
        dailySource: "النافذة اليومية",
        manualSource: "الرصيد اليدوي / الإداري",
        grantSource: "منحة",
        activeStatus: "نشط",
        exhaustedStatus: "مستنفد",
        expiredStatus: "منتهي",
        revokedStatus: "ملغي",
        adminExemptStatus: "إعفاء مشرف",
        systemLabel: "النظام",
        unknownLabel: "غير متاح",
        dailySourceReason:
          "الرصيد المتكرر ضمن نافذة الاستخدام اليومية الحالية.",
        manualSourceReason:
          "رصيد إضافي ثابت يدار من قبل المشرفين ويبقى حتى يُستهلك أو يتغير.",
        totalShortLabel: "الإجمالي",
        manualShortLabel: "اليدوي",
        grantsShortLabel: "المنح",
        actionAddManual: "إضافة رصيد يدوي",
        actionSubtractManual: "خصم رصيد يدوي",
        actionSetManual: "تعيين الرصيد اليدوي",
        actionGrantCredits: "إنشاء منحة",
        actionRevokeGrant: "إلغاء منحة",
        actionSetAccess: "تعيين حالة الوصول",
        actionSetOverride: "تعيين حد يومي خاص",
        actionClearOverride: "إزالة الحد اليومي الخاص",
        sourceTypeManual: "يدوي",
        sourceTypeGrant: "منحة",
        sourceTypeAccess: "وصول",
        sourceTypeDailyOverride: "حد يومي",
        sourceTypeGrantLifecycle: "دورة حياة المنحة",
      }
    : {
        accessStatusLabel: "access status",
        promptEntitlementLabel: "prompt entitlement",
        computedAtLabel: "computed at",
        enabledLabel: "enabled",
        disabledLabel: "disabled",
        sourceBreakdownTitle: "Source Breakdown",
        sourceBreakdownSubtitle:
          "The live server-resolved sources behind your usable assessment balance.",
        sourceBreakdownUnavailable:
          "Detailed credit-source data is temporarily unavailable. The canonical summary above is still the trusted balance truth.",
        sourceBreakdownEmpty:
          "No manual or grant sources are active right now. Your remaining balance is coming only from the current daily window, or no credits are available.",
        historyTitle: "Mutation History",
        historySubtitle: "Recent server-committed credit changes for this account.",
        historyUnavailable:
          "Detailed credit history is temporarily unavailable. Try refreshing in a moment.",
        historyEmpty: "No credit mutations are available yet.",
        sourceLabel: "Source",
        currentAvailableLabel: "Available Now",
        originalAmountLabel: "Original",
        consumedLabel: "Consumed",
        statusLabel: "Status",
        createdAtLabel: "Created At",
        expiresAtLabel: "Expires At",
        createdByLabel: "Created By",
        reasonLabel: "Reason",
        noteLabel: "Note",
        timeLabel: "Time",
        operationLabel: "Operation",
        actorLabel: "Actor",
        beforeLabel: "Before",
        afterLabel: "After",
        correlationLabel: "Correlation",
        expiryLabel: "Expiry",
        dailySource: "Daily window",
        manualSource: "Manual / admin",
        grantSource: "Grant",
        activeStatus: "active",
        exhaustedStatus: "exhausted",
        expiredStatus: "expired",
        revokedStatus: "revoked",
        adminExemptStatus: "admin exempt",
        systemLabel: "system",
        unknownLabel: "Unavailable",
        dailySourceReason:
          "Recurring allowance available inside the current daily reset window.",
        manualSourceReason:
          "Durable admin-managed balance that remains until it is consumed or changed.",
        totalShortLabel: "total",
        manualShortLabel: "manual",
        grantsShortLabel: "grants",
        actionAddManual: "Add manual credits",
        actionSubtractManual: "Subtract manual credits",
        actionSetManual: "Set manual credits",
        actionGrantCredits: "Create grant",
        actionRevokeGrant: "Revoke grant",
        actionSetAccess: "Set assessment access",
        actionSetOverride: "Set daily override",
        actionClearOverride: "Clear daily override",
        sourceTypeManual: "manual",
        sourceTypeGrant: "grant",
        sourceTypeAccess: "access",
        sourceTypeDailyOverride: "daily override",
        sourceTypeGrantLifecycle: "grant lifecycle",
      };
}

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

function formatDateTime(locale: Locale, value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsedDate);
}

function formatActorIdentity(input: {
  fallbackLabel: string;
  uid?: string | null;
  email?: string | null;
  role?: string | null;
}) {
  const primary = input.email?.trim() || input.uid?.trim() || input.fallbackLabel;
  return input.role ? `${primary} • ${input.role}` : primary;
}

function formatSnapshotSummary(input: {
  record: AdminAssessmentCreditMutationRecord["before"];
  locale: Locale;
  totalShortLabel: string;
  manualShortLabel: string;
  grantsShortLabel: string;
}) {
  const totalLabel = typeof input.record.remainingCount === "number"
    ? formatAssessmentCreditCount(input.record.remainingCount, input.locale)
    : "∞";

  return [
    `${totalLabel} ${input.totalShortLabel}`,
    `${formatAssessmentCreditCount(input.record.manualCredits, input.locale)} ${input.manualShortLabel}`,
    `${formatAssessmentCreditCount(input.record.grantCreditsAvailable, input.locale)} ${input.grantsShortLabel}`,
  ].join(" • ");
}

function resolveGrantStatusLabel(input: {
  grant: AssessmentCreditGrantAdminView;
  copy: ReturnType<typeof getAssessmentCreditDetailsCopy>;
}) {
  switch (input.grant.effectiveStatus) {
    case "revoked":
      return input.copy.revokedStatus;
    case "expired":
      return input.copy.expiredStatus;
    case "exhausted":
      return input.copy.exhaustedStatus;
    default:
      return input.copy.activeStatus;
  }
}

function resolveHistoryActionLabel(input: {
  action: AdminAssessmentCreditMutationRecord["action"];
  copy: ReturnType<typeof getAssessmentCreditDetailsCopy>;
}) {
  switch (input.action) {
    case "add_manual_credits":
      return input.copy.actionAddManual;
    case "subtract_manual_credits":
      return input.copy.actionSubtractManual;
    case "set_manual_credits":
      return input.copy.actionSetManual;
    case "grant_credits":
      return input.copy.actionGrantCredits;
    case "revoke_grant":
      return input.copy.actionRevokeGrant;
    case "set_access":
      return input.copy.actionSetAccess;
    case "set_daily_override":
      return input.copy.actionSetOverride;
    case "clear_daily_override":
      return input.copy.actionClearOverride;
    default:
      return input.action;
  }
}

function resolveHistorySourceType(input: {
  action: AdminAssessmentCreditMutationRecord["action"];
  copy: ReturnType<typeof getAssessmentCreditDetailsCopy>;
}) {
  switch (input.action) {
    case "add_manual_credits":
    case "subtract_manual_credits":
    case "set_manual_credits":
      return input.copy.sourceTypeManual;
    case "grant_credits":
    case "revoke_grant":
      return input.copy.sourceTypeGrantLifecycle;
    case "set_access":
      return input.copy.sourceTypeAccess;
    case "set_daily_override":
    case "clear_daily_override":
      return input.copy.sourceTypeDailyOverride;
    default:
      return input.copy.unknownLabel;
  }
}

function buildBreakdownRows(input: {
  details: AssessmentCreditDetailsResponse;
  locale: Locale;
  copy: ReturnType<typeof getAssessmentCreditDetailsCopy>;
}) {
  const { account, credits, grants } = input.details;
  const accessStatusLabel = credits.assessmentAccess === "disabled"
    ? input.copy.disabledLabel
    : credits.isAdminExempt
      ? input.copy.adminExemptStatus
      : (credits.dailyRemainingCount ?? 0) > 0
        ? input.copy.activeStatus
        : input.copy.exhaustedStatus;
  const manualStatusLabel = account.manualCredits > 0
    ? input.copy.activeStatus
    : credits.assessmentAccess === "disabled"
      ? input.copy.disabledLabel
      : input.copy.exhaustedStatus;

  return [
    {
      id: "daily",
      sourceLabel: input.copy.dailySource,
      currentAvailable: credits.dailyRemainingCount,
      originalAmount: credits.dailyLimit,
      consumed: credits.usedCount,
      statusLabel: accessStatusLabel,
      createdAt: null,
      expiresAt: credits.resetsAt,
      createdByLabel: input.copy.systemLabel,
      reason: input.copy.dailySourceReason,
      note: null,
    },
    {
      id: "manual",
      sourceLabel: input.copy.manualSource,
      currentAvailable: credits.manualCreditsAvailable,
      originalAmount: account.manualCredits,
      consumed: null,
      statusLabel: manualStatusLabel,
      createdAt: account.createdAt,
      expiresAt: null,
      createdByLabel: input.copy.systemLabel,
      reason: input.copy.manualSourceReason,
      note: null,
    },
    ...grants.map((grant) => ({
      id: grant.id,
      sourceLabel: `${input.copy.grantSource} • ${grant.id.slice(0, 8)}`,
      currentAvailable: grant.available,
      originalAmount: grant.credits,
      consumed: grant.consumed,
      statusLabel: resolveGrantStatusLabel({
        grant,
        copy: input.copy,
      }),
      createdAt: grant.createdAt,
      expiresAt: grant.expiresAt,
      createdByLabel: formatActorIdentity({
        fallbackLabel: input.copy.systemLabel,
        uid: grant.createdByUid,
        role: grant.createdByRole ?? null,
      }),
      reason: grant.reason,
      note: grant.note,
    })),
  ] satisfies CreditBreakdownRow[];
}

export function AssessmentCreditDetailsPanel({
  locale,
  messages,
}: AssessmentCreditDetailsPanelProps) {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const copy = useMemo(() => getAssessmentCreditDetailsCopy(locale), [locale]);

  /* This page intentionally keeps the shared summary query as the owner of the total usable
     balance. The details query only enriches the same server truth with grant/history metadata
     so future edits do not recreate a second competing credit summary owner in the browser. */
  const creditSummaryQuery = useAssessmentCreditSummaryQuery({
    source: "assessment-credit-details-summary",
  });
  const creditDetailsQuery = useAssessmentCreditDetailsQuery({
    source: "assessment-credit-details-details",
  });
  const creditSummary = creditSummaryQuery.data ?? null;
  const creditDetails = creditDetailsQuery.data ?? null;
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

  const breakdownRows = useMemo(
    () =>
      creditDetails
        ? buildBreakdownRows({
            details: creditDetails,
            locale,
            copy,
          })
        : [],
    [copy, creditDetails, locale],
  );

  async function handleRefresh() {
    setIsRefreshing(true);

    try {
      await invalidateAssessmentCreditQueries(queryClient, {
        source: "assessment-credit-details",
        reason: "manual-refresh",
      });
    } finally {
      setIsRefreshing(false);
    }
  }

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
  const accessStatusLabel = !creditSummary
    ? messages.loading
    : creditSummary.assessmentAccess === "disabled"
      ? copy.disabledLabel
      : copy.enabledLabel;
  const promptEntitlementLabel = !creditDetails
    ? messages.loading
    : creditDetails.account.assessmentPromptEntitlement === "enabled"
      ? copy.enabledLabel
      : copy.disabledLabel;
  const computedAtLabel = formatDateTime(locale, creditDetails?.computedAt ?? null);

  return (
    <section className="surface-strong space-y-6 rounded-[2rem] p-5 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="space-y-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-200">
            <WalletCards className="h-3.5 w-3.5" />
            {messages.globalCreditsPageTitle ?? messages.assessmentCreditsPageTitle}
          </span>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {messages.globalCreditsPageSubtitle ?? messages.assessmentCreditsPageSubtitle}
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

      {creditDetailsQuery.error ? (
        <div className="rounded-xl border border-sky-500/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-700 dark:text-sky-200">
          {copy.sourceBreakdownUnavailable}
        </div>
      ) : null}

      <div className="rounded-[1.4rem] border border-emerald-500/12 bg-[linear-gradient(145deg,rgba(16,185,129,0.08),rgba(14,165,233,0.05))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] dark:bg-[linear-gradient(145deg,rgba(16,185,129,0.12),rgba(14,165,233,0.08))]">
        <p className="text-sm leading-7 text-foreground-muted">{summaryNarrative}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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

        <article className="rounded-2xl border border-border bg-background-elevated/70 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-foreground-muted">
            {copy.accessStatusLabel}
          </p>
          <p className="mt-2 text-2xl font-bold text-foreground">{accessStatusLabel}</p>
        </article>

        <article className="rounded-2xl border border-border bg-background-elevated/70 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-foreground-muted">
            {copy.promptEntitlementLabel}
          </p>
          <p className="mt-2 text-2xl font-bold text-foreground">{promptEntitlementLabel}</p>
        </article>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="rounded-xl border border-border bg-background-elevated/70 px-4 py-3 text-sm text-foreground-muted">
          <span className="font-semibold text-foreground">{messages.assessmentCreditsResetsAtLabel}</span>{" "}
          {resetAtLabel}
        </div>
        <div className="rounded-xl border border-border bg-background-elevated/70 px-4 py-3 text-sm text-foreground-muted">
          <span className="font-semibold text-foreground">{copy.computedAtLabel}</span>{" "}
          {computedAtLabel}
        </div>
      </div>

      <section className="space-y-4 rounded-[1.6rem] border border-border bg-background-elevated/60 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{copy.sourceBreakdownTitle}</h2>
            <p className="mt-1 text-sm text-foreground-muted">{copy.sourceBreakdownSubtitle}</p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground-muted">
            <ShieldCheck className="h-3.5 w-3.5" />
            {breakdownRows.length}
          </span>
        </div>

        {!creditDetails && creditDetailsQuery.isPending ? (
          <div className="rounded-2xl border border-dashed border-border bg-background/40 px-4 py-5 text-sm text-foreground-muted">
            {messages.loading}
          </div>
        ) : breakdownRows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-background/40 px-4 py-5 text-sm text-foreground-muted">
            {copy.sourceBreakdownEmpty}
          </div>
        ) : (
          <>
            <div className="grid gap-3 xl:hidden">
              {breakdownRows.map((row) => (
                <article
                  key={row.id}
                  className="rounded-2xl border border-border bg-background/50 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{row.sourceLabel}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.15em] text-foreground-muted">
                        {row.statusLabel}
                      </p>
                    </div>
                    <p className="text-lg font-bold text-foreground">
                      {typeof row.currentAvailable === "number"
                        ? formatAssessmentCreditCount(row.currentAvailable, locale)
                        : "-"}
                    </p>
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <p className="rounded-xl border border-border/70 bg-background-elevated/60 px-3 py-2 text-xs text-foreground-muted">
                      {copy.originalAmountLabel}:{" "}
                      <span className="font-semibold text-foreground">
                        {typeof row.originalAmount === "number"
                          ? formatAssessmentCreditCount(row.originalAmount, locale)
                          : "-"}
                      </span>
                    </p>
                    <p className="rounded-xl border border-border/70 bg-background-elevated/60 px-3 py-2 text-xs text-foreground-muted">
                      {copy.consumedLabel}:{" "}
                      <span className="font-semibold text-foreground">
                        {typeof row.consumed === "number"
                          ? formatAssessmentCreditCount(row.consumed, locale)
                          : "-"}
                      </span>
                    </p>
                    <p className="rounded-xl border border-border/70 bg-background-elevated/60 px-3 py-2 text-xs text-foreground-muted">
                      {copy.createdAtLabel}:{" "}
                      <span className="font-semibold text-foreground">
                        {formatDateTime(locale, row.createdAt)}
                      </span>
                    </p>
                    <p className="rounded-xl border border-border/70 bg-background-elevated/60 px-3 py-2 text-xs text-foreground-muted">
                      {copy.expiresAtLabel}:{" "}
                      <span className="font-semibold text-foreground">
                        {formatDateTime(locale, row.expiresAt)}
                      </span>
                    </p>
                  </div>

                  <div className="mt-3 space-y-2 text-xs text-foreground-muted">
                    <p>
                      <span className="font-semibold text-foreground">{copy.createdByLabel}</span>{" "}
                      {row.createdByLabel}
                    </p>
                    {row.reason ? (
                      <p>
                        <span className="font-semibold text-foreground">{copy.reasonLabel}</span>{" "}
                        {row.reason}
                      </p>
                    ) : null}
                    {row.note ? (
                      <p>
                        <span className="font-semibold text-foreground">{copy.noteLabel}</span>{" "}
                        {row.note}
                      </p>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>

            <div className="hidden overflow-x-auto xl:block">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.15em] text-foreground-muted">
                  <tr>
                    <th className="px-3 py-3">{copy.sourceLabel}</th>
                    <th className="px-3 py-3">{copy.currentAvailableLabel}</th>
                    <th className="px-3 py-3">{copy.originalAmountLabel}</th>
                    <th className="px-3 py-3">{copy.consumedLabel}</th>
                    <th className="px-3 py-3">{copy.statusLabel}</th>
                    <th className="px-3 py-3">{copy.createdAtLabel}</th>
                    <th className="px-3 py-3">{copy.expiresAtLabel}</th>
                    <th className="px-3 py-3">{copy.createdByLabel}</th>
                    <th className="px-3 py-3">{copy.reasonLabel}</th>
                    <th className="px-3 py-3">{copy.noteLabel}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {breakdownRows.map((row) => (
                    <tr key={row.id} className="align-top text-foreground-muted">
                      <td className="px-3 py-3 font-semibold text-foreground">{row.sourceLabel}</td>
                      <td className="px-3 py-3">
                        {typeof row.currentAvailable === "number"
                          ? formatAssessmentCreditCount(row.currentAvailable, locale)
                          : "-"}
                      </td>
                      <td className="px-3 py-3">
                        {typeof row.originalAmount === "number"
                          ? formatAssessmentCreditCount(row.originalAmount, locale)
                          : "-"}
                      </td>
                      <td className="px-3 py-3">
                        {typeof row.consumed === "number"
                          ? formatAssessmentCreditCount(row.consumed, locale)
                          : "-"}
                      </td>
                      <td className="px-3 py-3">{row.statusLabel}</td>
                      <td className="px-3 py-3">{formatDateTime(locale, row.createdAt)}</td>
                      <td className="px-3 py-3">{formatDateTime(locale, row.expiresAt)}</td>
                      <td className="px-3 py-3">{row.createdByLabel}</td>
                      <td className="px-3 py-3">{row.reason ?? "-"}</td>
                      <td className="px-3 py-3">{row.note ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="space-y-4 rounded-[1.6rem] border border-border bg-background-elevated/60 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{copy.historyTitle}</h2>
            <p className="mt-1 text-sm text-foreground-muted">{copy.historySubtitle}</p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground-muted">
            <Clock3 className="h-3.5 w-3.5" />
            {creditDetails?.history.length ?? 0}
          </span>
        </div>

        {!creditDetails && creditDetailsQuery.isPending ? (
          <div className="rounded-2xl border border-dashed border-border bg-background/40 px-4 py-5 text-sm text-foreground-muted">
            {messages.loading}
          </div>
        ) : creditDetailsQuery.error ? (
          <div className="rounded-2xl border border-dashed border-border bg-background/40 px-4 py-5 text-sm text-foreground-muted">
            {copy.historyUnavailable}
          </div>
        ) : !creditDetails || creditDetails.history.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-background/40 px-4 py-5 text-sm text-foreground-muted">
            {copy.historyEmpty}
          </div>
        ) : (
          <>
            <div className="grid gap-3 xl:hidden">
              {creditDetails.history.map((record) => (
                <article
                  key={record.id}
                  className="rounded-2xl border border-border bg-background/50 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {resolveHistoryActionLabel({
                          action: record.action,
                          copy,
                        })}
                      </p>
                      <p className="mt-1 text-xs uppercase tracking-[0.15em] text-foreground-muted">
                        {resolveHistorySourceType({
                          action: record.action,
                          copy,
                        })}
                      </p>
                    </div>
                    <p className="text-xs text-foreground-muted">
                      {formatDateTime(locale, record.createdAt)}
                    </p>
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <p className="rounded-xl border border-border/70 bg-background-elevated/60 px-3 py-2 text-xs text-foreground-muted">
                      {copy.actorLabel}:{" "}
                      <span className="font-semibold text-foreground">
                        {formatActorIdentity({
                          fallbackLabel: copy.systemLabel,
                          uid: record.adminUid,
                          email: record.adminEmail ?? null,
                          role: record.adminRole,
                        })}
                      </span>
                    </p>
                    <p className="rounded-xl border border-border/70 bg-background-elevated/60 px-3 py-2 text-xs text-foreground-muted">
                      {copy.expiryLabel}:{" "}
                      <span className="font-semibold text-foreground">
                        {formatDateTime(locale, record.expiresAt)}
                      </span>
                    </p>
                    <p className="rounded-xl border border-border/70 bg-background-elevated/60 px-3 py-2 text-xs text-foreground-muted">
                      {copy.beforeLabel}:{" "}
                      <span className="font-semibold text-foreground">
                        {formatSnapshotSummary({
                          record: record.before,
                          locale,
                          totalShortLabel: copy.totalShortLabel,
                          manualShortLabel: copy.manualShortLabel,
                          grantsShortLabel: copy.grantsShortLabel,
                        })}
                      </span>
                    </p>
                    <p className="rounded-xl border border-border/70 bg-background-elevated/60 px-3 py-2 text-xs text-foreground-muted">
                      {copy.afterLabel}:{" "}
                      <span className="font-semibold text-foreground">
                        {formatSnapshotSummary({
                          record: record.after,
                          locale,
                          totalShortLabel: copy.totalShortLabel,
                          manualShortLabel: copy.manualShortLabel,
                          grantsShortLabel: copy.grantsShortLabel,
                        })}
                      </span>
                    </p>
                  </div>

                  <div className="mt-3 space-y-2 text-xs text-foreground-muted">
                    {typeof record.amount === "number" ? (
                      <p>
                        <span className="font-semibold text-foreground">
                          {copy.originalAmountLabel}
                        </span>{" "}
                        {formatAssessmentCreditCount(record.amount, locale)}
                      </p>
                    ) : null}
                    {record.reason ? (
                      <p>
                        <span className="font-semibold text-foreground">{copy.reasonLabel}</span>{" "}
                        {record.reason}
                      </p>
                    ) : null}
                    {record.note ? (
                      <p>
                        <span className="font-semibold text-foreground">{copy.noteLabel}</span>{" "}
                        {record.note}
                      </p>
                    ) : null}
                    {record.correlationId ? (
                      <p>
                        <span className="font-semibold text-foreground">{copy.correlationLabel}</span>{" "}
                        {record.correlationId}
                      </p>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>

            <div className="hidden overflow-x-auto xl:block">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.15em] text-foreground-muted">
                  <tr>
                    <th className="px-3 py-3">{copy.timeLabel}</th>
                    <th className="px-3 py-3">{copy.operationLabel}</th>
                    <th className="px-3 py-3">{copy.actorLabel}</th>
                    <th className="px-3 py-3">{copy.beforeLabel}</th>
                    <th className="px-3 py-3">{copy.afterLabel}</th>
                    <th className="px-3 py-3">{copy.reasonLabel}</th>
                    <th className="px-3 py-3">{copy.noteLabel}</th>
                    <th className="px-3 py-3">{copy.expiryLabel}</th>
                    <th className="px-3 py-3">{copy.correlationLabel}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {creditDetails.history.map((record) => (
                    <tr key={record.id} className="align-top text-foreground-muted">
                      <td className="px-3 py-3">{formatDateTime(locale, record.createdAt)}</td>
                      <td className="px-3 py-3">
                        <div className="space-y-1">
                          <p className="font-semibold text-foreground">
                            {resolveHistoryActionLabel({
                              action: record.action,
                              copy,
                            })}
                          </p>
                          <p className="text-xs uppercase tracking-[0.14em]">
                            {resolveHistorySourceType({
                              action: record.action,
                              copy,
                            })}
                          </p>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {formatActorIdentity({
                          fallbackLabel: copy.systemLabel,
                          uid: record.adminUid,
                          email: record.adminEmail ?? null,
                          role: record.adminRole,
                        })}
                      </td>
                      <td className="px-3 py-3">
                        {formatSnapshotSummary({
                          record: record.before,
                          locale,
                          totalShortLabel: copy.totalShortLabel,
                          manualShortLabel: copy.manualShortLabel,
                          grantsShortLabel: copy.grantsShortLabel,
                        })}
                      </td>
                      <td className="px-3 py-3">
                        {formatSnapshotSummary({
                          record: record.after,
                          locale,
                          totalShortLabel: copy.totalShortLabel,
                          manualShortLabel: copy.manualShortLabel,
                          grantsShortLabel: copy.grantsShortLabel,
                        })}
                      </td>
                      <td className="px-3 py-3">{record.reason ?? "-"}</td>
                      <td className="px-3 py-3">{record.note ?? "-"}</td>
                      <td className="px-3 py-3">{formatDateTime(locale, record.expiresAt)}</td>
                      <td className="px-3 py-3">{record.correlationId ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </section>
  );
}
