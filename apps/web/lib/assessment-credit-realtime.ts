import type { AssessmentDailyCreditsSummary } from "@zootopia/shared-types";

export const ASSESSMENT_CREDIT_REALTIME_EVENT =
  "assessment-credit-invalidated";

/* Realtime messages remain owner-scoped transport envelopes only. The UI still re-fetches
   `/api/assessment/credits` before applying visible state so server-owned summary truth stays
   authoritative even if a client receives an unexpected or duplicated broadcast. */
export type AssessmentCreditRealtimePayload = {
  credits: AssessmentDailyCreditsSummary;
  eventId: string;
  emittedAt: string;
  traceId: string | null;
};
