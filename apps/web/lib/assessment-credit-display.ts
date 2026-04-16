import type {
  AssessmentDailyCreditsSummary,
  Locale,
} from "@zootopia/shared-types";

export type AssessmentCreditDisplayState =
  | "admin_exempt"
  | "access_disabled"
  | "daily_only"
  | "mixed"
  | "extra_only"
  | "none";

export type AssessmentCreditDisplayModel = {
  state: AssessmentCreditDisplayState;
  totalAvailable: number | null;
  dailyAvailable: number | null;
  extraAvailable: number;
  hasManualCredits: boolean;
  hasGrantCredits: boolean;
};

/* This helper intentionally derives presentation-only state from the canonical server summary.
   Future agents: keep credit math authoritative on the backend and only classify the summary
   here for header/studio messaging; do not introduce a second client-side balance calculator. */
export function resolveAssessmentCreditDisplayModel(
  summary: AssessmentDailyCreditsSummary,
): AssessmentCreditDisplayModel {
  const totalAvailable =
    typeof summary.remainingCount === "number" && Number.isFinite(summary.remainingCount)
      ? Math.max(0, Math.round(summary.remainingCount))
      : null;
  const dailyAvailable = summary.applies
    ? Math.max(0, Math.round(summary.dailyRemainingCount ?? 0))
    : null;
  const extraAvailable = Math.max(0, Math.round(summary.extraCreditsAvailable ?? 0));
  const hasManualCredits = summary.manualCreditsAvailable > 0;
  const hasGrantCredits = summary.grantCreditsAvailable > 0;

  if (summary.isAdminExempt || !summary.applies) {
    return {
      state: "admin_exempt",
      totalAvailable,
      dailyAvailable: null,
      extraAvailable,
      hasManualCredits,
      hasGrantCredits,
    };
  }

  if (summary.assessmentAccess === "disabled") {
    return {
      state: "access_disabled",
      totalAvailable: 0,
      dailyAvailable,
      extraAvailable,
      hasManualCredits,
      hasGrantCredits,
    };
  }

  if ((dailyAvailable ?? 0) > 0 && extraAvailable > 0) {
    return {
      state: "mixed",
      totalAvailable: totalAvailable ?? dailyAvailable ?? 0,
      dailyAvailable,
      extraAvailable,
      hasManualCredits,
      hasGrantCredits,
    };
  }

  if ((dailyAvailable ?? 0) > 0) {
    return {
      state: "daily_only",
      totalAvailable: totalAvailable ?? dailyAvailable ?? 0,
      dailyAvailable,
      extraAvailable,
      hasManualCredits,
      hasGrantCredits,
    };
  }

  if (extraAvailable > 0) {
    return {
      state: "extra_only",
      totalAvailable: totalAvailable ?? extraAvailable,
      dailyAvailable,
      extraAvailable,
      hasManualCredits,
      hasGrantCredits,
    };
  }

  return {
    state: "none",
    totalAvailable: totalAvailable ?? 0,
    dailyAvailable,
    extraAvailable,
    hasManualCredits,
    hasGrantCredits,
  };
}

export function formatAssessmentCreditCount(
  value: number,
  locale: Locale,
) {
  return new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-US").format(value);
}
