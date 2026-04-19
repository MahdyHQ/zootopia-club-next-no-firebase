/* Legacy env keys and cookie names still say "global credit page" because that contract is
   already deployed, but the protected surface is the owner-scoped assessment credits page at
   `/credits`. New server imports should use this module so file/function names match reality
   without breaking the existing env/cookie compatibility layer. */
export {
  buildGlobalCreditPageUnlockCookieValueForUser as buildAssessmentCreditPageUnlockCookieValueForUser,
  getGlobalCreditPageLockRuntimeState as getAssessmentCreditPageLockRuntimeState,
  getGlobalCreditPageUnlockCookieName as getAssessmentCreditPageUnlockCookieName,
  getGlobalCreditPageUnlockCookieOptions as getAssessmentCreditPageUnlockCookieOptions,
  getGlobalCreditPageAccessStateForUser as getAssessmentCreditPageAccessStateForUser,
  isGlobalCreditPagePasswordValid as isAssessmentCreditPagePasswordValid,
} from "@/lib/server/global-credit-page-lock";

export type {
  GlobalCreditPageAccessState as AssessmentCreditPageAccessState,
} from "@/lib/server/global-credit-page-lock";
