import type { AssessmentDailyCreditsSummary } from "@zootopia/shared-types";

export const ASSESSMENT_CREDIT_REFRESH_EVENT =
  "zootopia:assessment-credit-refresh";
export const ASSESSMENT_CREDIT_SUMMARY_UPDATED_EVENT =
  "zootopia:assessment-credit-summary-updated";

export type AssessmentCreditSummaryUpdateSource = "fetch" | "sse";

export type AssessmentCreditSummaryUpdatedDetail = {
  credits: AssessmentDailyCreditsSummary;
  source?: AssessmentCreditSummaryUpdateSource;
  requestId?: string | null;
  eventId?: string | null;
  emittedAt?: string | null;
  receivedAt?: string;
};

export function dispatchAssessmentCreditRefresh() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(ASSESSMENT_CREDIT_REFRESH_EVENT));
}

/* The protected shell owns the warm credit-refresh lane (focus / visibility / interval).
   Broadcasting the latest server-owned summary from that shell keeps Assessment Studio's
   local balance card in sync after external admin grants without adding a second polling client.
   Future agents: preserve this as a display-sync bridge only, not as an authority source. */
export function dispatchAssessmentCreditSummaryUpdated(
  detail: AssessmentCreditSummaryUpdatedDetail,
) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<AssessmentCreditSummaryUpdatedDetail>(
      ASSESSMENT_CREDIT_SUMMARY_UPDATED_EVENT,
      {
        detail: {
          ...detail,
          receivedAt: detail.receivedAt ?? new Date().toISOString(),
        },
      },
    ),
  );
}
