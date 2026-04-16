export const ASSESSMENT_CREDIT_REALTIME_EVENT =
  "assessment-credit-invalidated";

export const ASSESSMENT_CREDIT_PRIVATE_TOPIC_PREFIX =
  "assessment-credit";
const ASSESSMENT_CREDIT_PRIVATE_TOPIC_OWNER_SEGMENT = "owner";

/* Topic ownership is expressed as a stable owner-keyed namespace so Supabase Realtime RLS can
   enforce per-user private channel access. Do not expose arbitrary topic construction in browser
   code; the server must continue deriving the exact owner topic from authenticated session truth. */
export function buildAssessmentCreditPrivateTopic(ownerUid: string) {
  const normalizedOwnerUid = String(ownerUid ?? "").trim();
  if (!normalizedOwnerUid) {
    return null;
  }

  return `${ASSESSMENT_CREDIT_PRIVATE_TOPIC_PREFIX}:${ASSESSMENT_CREDIT_PRIVATE_TOPIC_OWNER_SEGMENT}:${normalizedOwnerUid}`;
}

/* Realtime messages remain owner-scoped transport envelopes only. The UI still re-fetches
   `/api/assessment/credits` before applying visible state so server-owned summary truth stays
   authoritative even if a client receives an unexpected or duplicated broadcast. */
export type AssessmentCreditRealtimePayload = {
  eventId: string;
  emittedAt: string;
  traceId: string | null;
};
