/* ==========================================================================
   PLATFORM ERROR TAXONOMY
   Central cross-domain error registry for all server-side error codes.
   --------------------------------------------------------------------------
   Domains covered:
     - authentication / session
     - authorization / owner-scope / admin
     - profile / account lifecycle
     - assessment generation (idempotency, credits, finalization)
     - platform-global aggregation / capacity lock
     - per-user credit accounting (daily, grants, mutations)
     - document domain
     - upload domain
     - email verification / resend
     - storage / owner-scope violations
     - admin governance (mutations, deletions)
   --------------------------------------------------------------------------
   Rules:
     - Every public API error code MUST have an entry here.
     - Route handlers import helpers from this file; they must not define
       raw error objects inline.
     - `code` values are stable internal identifiers — never rename them.
     - `message` values are calmed, non-technical user-facing copy.
     - `status` follows HTTP semantics strictly.
   ========================================================================== */

export type PlatformErrorCategory =
  | "authentication"
  | "authorization"
  | "validation"
  | "not-found"
  | "conflict"
  | "availability"
  | "persistence"
  | "rate-limit"
  | "capacity";

export type PlatformApiError = {
  code: string;
  category: PlatformErrorCategory;
  message: string;
  status: number;
};

export type ClassifiedAssessmentFinalizationFailure = PlatformApiError & {
  internalCode: string;
  internalCategory: string;
};

const ASSESSMENT_FINALIZATION_GENERIC_MESSAGE =
  "The assessment finished, but it could not be finalized safely. No daily credit was used.";

type PlatformErrorDefinition = PlatformApiError;

const PLATFORM_ERROR_REGISTRY = {
  // ── Authentication / session ───────────────────────────────────────────────
  unauthenticated: {
    code: "UNAUTHENTICATED",
    category: "authentication",
    message: "Sign in is required.",
    status: 401,
  },
  /** Backward-compat alias kept for assessment routes that use this specific message. */
  assessmentAuthenticationRequired: {
    code: "UNAUTHENTICATED",
    category: "authentication",
    message: "Sign in is required for assessments.",
    status: 401,
  },

  // ── Authorization / owner-scope ────────────────────────────────────────────
  adminAccessRequired: {
    code: "FORBIDDEN",
    category: "authorization",
    message: "Admin access is required.",
    status: 403,
  },
  /** Storage path does not match the authenticated owner — never expose path details to client. */
  ownerStorageScopeMismatch: {
    code: "OWNER_STORAGE_SCOPE_MISMATCH",
    category: "authorization",
    message: "Access denied.",
    status: 403,
  },
  /** Record owner UID does not match the session UID. */
  ownerUidMismatch: {
    code: "OWNER_UID_MISMATCH",
    category: "authorization",
    message: "Access denied.",
    status: 403,
  },

  // ── Profile / account lifecycle ────────────────────────────────────────────
  profileIncomplete: {
    code: "PROFILE_INCOMPLETE",
    category: "authorization",
    message: "Complete your profile in Settings before using this feature.",
    status: 403,
  },
  passwordPolicyFailed: {
    code: "PASSWORD_POLICY_FAILED",
    category: "validation",
    message: "The new password does not meet security requirements.",
    status: 400,
  },
  passwordChangeRateLimited: {
    code: "PASSWORD_CHANGE_RATE_LIMITED",
    category: "rate-limit",
    message: "Too many password change attempts. Please try again later.",
    status: 429,
  },
  passwordChangeReauthRequired: {
    code: "PASSWORD_CHANGE_REAUTH_REQUIRED",
    category: "authentication",
    message: "Please sign in again to change your password.",
    status: 401,
  },
  passwordChangeReusedPassword: {
    code: "PASSWORD_CHANGE_REUSED_PASSWORD",
    category: "validation",
    message: "The new password must be different from the current one.",
    status: 400,
  },
  passwordChangeUpdateFailed: {
    code: "PASSWORD_CHANGE_UPDATE_FAILED",
    category: "persistence",
    message: "Password could not be updated right now. Please try again.",
    status: 500,
  },

  // ── Validation (generic) ───────────────────────────────────────────────────
  invalidJson: {
    code: "INVALID_JSON",
    category: "validation",
    message: "Request body must be valid JSON.",
    status: 400,
  },

  // ── User lookup ────────────────────────────────────────────────────────────
  userNotFound: {
    code: "USER_NOT_FOUND",
    category: "not-found",
    message: "The selected user was not found.",
    status: 404,
  },
  userLookupUnavailable: {
    code: "USER_LOOKUP_UNAVAILABLE",
    category: "availability",
    message: "The selected user could not be resolved right now.",
    status: 503,
  },
  userUidRequired: {
    code: "USER_UID_REQUIRED",
    category: "validation",
    message: "A user ID is required.",
    status: 400,
  },

  // ── Document domain ────────────────────────────────────────────────────────
  documentNotFound: {
    code: "DOCUMENT_NOT_FOUND",
    category: "not-found",
    message: "The selected document was not found.",
    status: 404,
  },
  documentNotReady: {
    code: "DOCUMENT_NOT_READY",
    category: "availability",
    message: "The document is not ready yet. Please try again shortly.",
    status: 503,
  },
  documentContextUnavailable: {
    code: "DOCUMENT_CONTEXT_UNAVAILABLE",
    category: "availability",
    message: "The document content could not be loaded right now.",
    status: 503,
  },

  // ── Upload domain ──────────────────────────────────────────────────────────
  uploadRequestInvalid: {
    code: "UPLOAD_REQUEST_INVALID",
    category: "validation",
    message: "The upload request is invalid.",
    status: 400,
  },
  uploadRequestTooLarge: {
    code: "UPLOAD_REQUEST_TOO_LARGE",
    category: "validation",
    message: "The uploaded file exceeds the allowed size limit.",
    status: 413,
  },

  // ── Email verification / resend ────────────────────────────────────────────
  verificationResendCooldownActive: {
    code: "VERIFICATION_RESEND_COOLDOWN_ACTIVE",
    category: "rate-limit",
    message: "A verification email was already sent. Please wait before requesting another.",
    status: 429,
  },
  verificationResendAccountWindowExhausted: {
    code: "VERIFICATION_RESEND_ACCOUNT_WINDOW_EXHAUSTED",
    category: "rate-limit",
    message: "Too many verification emails sent for this account. Please try again later.",
    status: 429,
  },
  verificationResendIpWindowExhausted: {
    code: "VERIFICATION_RESEND_IP_WINDOW_EXHAUSTED",
    category: "rate-limit",
    message: "Too many verification requests from this location. Please try again later.",
    status: 429,
  },
  verificationResendProviderRateLimited: {
    code: "VERIFICATION_RESEND_PROVIDER_RATE_LIMITED",
    category: "rate-limit",
    message: "Email service is temporarily rate-limited. Please try again shortly.",
    status: 429,
  },
  verificationResendProviderDailyLimitLikely: {
    code: "VERIFICATION_RESEND_PROVIDER_DAILY_LIMIT_LIKELY",
    category: "availability",
    message: "Email service daily capacity reached. Please try again tomorrow.",
    status: 503,
  },
  verificationResendProviderMonthlyLimitLikely: {
    code: "VERIFICATION_RESEND_PROVIDER_MONTHLY_LIMIT_LIKELY",
    category: "availability",
    message: "Email service monthly capacity reached. Please contact support.",
    status: 503,
  },
  verificationResendProviderIdentityUnverified: {
    code: "VERIFICATION_RESEND_PROVIDER_IDENTITY_UNVERIFIED",
    category: "availability",
    message: "Email delivery is unavailable right now.",
    status: 503,
  },
  verificationResendProviderRejected: {
    code: "VERIFICATION_RESEND_PROVIDER_REJECTED",
    category: "availability",
    message: "Verification email could not be sent.",
    status: 503,
  },
  verificationResendProviderNetworkFailure: {
    code: "VERIFICATION_RESEND_PROVIDER_NETWORK_FAILURE",
    category: "availability",
    message: "Email service is temporarily unavailable.",
    status: 503,
  },
  verificationResendUnavailable: {
    code: "VERIFICATION_RESEND_UNAVAILABLE",
    category: "availability",
    message: "Verification email service is currently unavailable.",
    status: 503,
  },

  // ── Assessment generation ──────────────────────────────────────────────────
  assessmentAccessDisabled: {
    code: "ASSESSMENT_ACCESS_DISABLED",
    category: "authorization",
    message: "Assessment generation is disabled for this account.",
    status: 403,
  },
  assessmentAccessDeniedAdminHardBlock: {
    code: "ASSESSMENT_ACCESS_DENIED_ADMIN_HARD_BLOCK",
    category: "authorization",
    message: "Assessment access has been explicitly revoked for this admin account.",
    status: 403,
  },
  assessmentUserLaneRequired: {
    code: "ASSESSMENT_USER_LANE_REQUIRED",
    category: "authorization",
    message: "This assessment request requires a normal user account.",
    status: 403,
  },
  invalidAssessmentRequest: {
    code: "INVALID_ASSESSMENT_REQUEST",
    category: "validation",
    message: "The assessment request is invalid.",
    status: 400,
  },
  assessmentIdempotencyKeyRequired: {
    code: "ASSESSMENT_IDEMPOTENCY_KEY_REQUIRED",
    category: "validation",
    message: "An idempotency key is required for assessment requests.",
    status: 400,
  },
  assessmentIdempotencyKeyInvalid: {
    code: "ASSESSMENT_IDEMPOTENCY_KEY_INVALID",
    category: "validation",
    message: "The provided idempotency key is not valid.",
    status: 400,
  },
  assessmentIdempotencyKeyReused: {
    code: "ASSESSMENT_IDEMPOTENCY_KEY_REUSED",
    category: "conflict",
    message: "This assessment has already been submitted.",
    status: 409,
  },
  assessmentRequestInProgress: {
    code: "ASSESSMENT_REQUEST_IN_PROGRESS",
    category: "conflict",
    message: "An assessment is already being generated. Please wait.",
    status: 409,
  },
  assessmentGenerationFailed: {
    code: "ASSESSMENT_GENERATION_FAILED",
    category: "availability",
    message: "Assessment generation failed. Please try again.",
    status: 503,
  },
  assessmentPromptEntitlementInvalid: {
    code: "ASSESSMENT_PROMPT_ENTITLEMENT_INVALID",
    category: "validation",
    message: "The prompt entitlement value is invalid.",
    status: 400,
  },

  // ── Platform-global capacity / lock ────────────────────────────────────────
  /** Fired when the platform-wide daily generation limit is reached. Server-enforced. */
  platformDailyCapacityExhausted: {
    code: "PLATFORM_DAILY_CAPACITY_EXHAUSTED",
    category: "capacity",
    message: "Platform daily capacity has been reached. Please try again tomorrow.",
    status: 429,
  },

  // ── Per-user assessment credit accounting ──────────────────────────────────
  assessmentCreditStateUnavailable: {
    code: "ASSESSMENT_CREDIT_STATE_UNAVAILABLE",
    category: "availability",
    message: "Unable to load assessment credit state for this user.",
    status: 503,
  },
  assessmentCreditSummaryUnavailable: {
    code: "ASSESSMENT_CREDIT_SUMMARY_UNAVAILABLE",
    category: "availability",
    message: "Unable to load assessment credits right now.",
    status: 503,
  },
  assessmentDailyCreditsExhausted: {
    code: "ASSESSMENT_DAILY_CREDITS_EXHAUSTED",
    category: "capacity",
    message: "Daily assessment credits are exhausted. They will renew tomorrow.",
    status: 429,
  },
  assessmentCreditGrantNotFound: {
    code: "ASSESSMENT_CREDIT_GRANT_NOT_FOUND",
    category: "not-found",
    message: "The selected grant was not found.",
    status: 404,
  },
  assessmentCreditGrantAlreadyRevoked: {
    code: "ASSESSMENT_CREDIT_GRANT_ALREADY_REVOKED",
    category: "conflict",
    message: "This grant has already been revoked.",
    status: 409,
  },
  assessmentCreditGrantOwnerMismatch: {
    code: "ASSESSMENT_CREDIT_GRANT_OWNER_MISMATCH",
    category: "validation",
    message: "The selected grant does not belong to this user.",
    status: 400,
  },
  assessmentCreditSelfMutationForbidden: {
    code: "ASSESSMENT_CREDIT_SELF_MUTATION_FORBIDDEN",
    category: "authorization",
    message: "Admins cannot mutate their own assessment credit balances.",
    status: 403,
  },
  assessmentCreditInvalidRequest: {
    code: "ASSESSMENT_CREDIT_INVALID_REQUEST",
    category: "validation",
    message: "The credit mutation request is invalid.",
    status: 400,
  },
  assessmentCreditUpdateFailed: {
    code: "ASSESSMENT_CREDIT_UPDATE_FAILED",
    category: "persistence",
    message: "Unable to update assessment credits right now.",
    status: 400,
  },

  // ── Assessment finalization ────────────────────────────────────────────────
  assessmentFinalizationFailed: {
    code: "ASSESSMENT_FINALIZATION_FAILED",
    category: "persistence",
    message: ASSESSMENT_FINALIZATION_GENERIC_MESSAGE,
    status: 500,
  },

  // ── Admin governance ───────────────────────────────────────────────────────
  adminUserDeleteFailed: {
    code: "ADMIN_USER_DELETE_FAILED",
    category: "persistence",
    message: "Unable to delete this user right now.",
    status: 500,
  },
  adminSelfDeleteForbidden: {
    code: "ADMIN_SELF_DELETE_FORBIDDEN",
    category: "authorization",
    message: "Admins cannot delete their own account.",
    status: 403,
  },
  allowlistedAdminDeleteForbidden: {
    code: "ALLOWLISTED_ADMIN_DELETE_FORBIDDEN",
    category: "authorization",
    message: "This admin account is protected and cannot be deleted.",
    status: 403,
  },
} satisfies Record<string, PlatformErrorDefinition>;

type PlatformErrorRegistryKey = keyof typeof PLATFORM_ERROR_REGISTRY;

function resolvePlatformError(
  key: PlatformErrorRegistryKey,
  overrides: Partial<PlatformApiError> = {},
): PlatformApiError {
  const base = PLATFORM_ERROR_REGISTRY[key];

  return {
    ...base,
    ...overrides,
    code: overrides.code ?? base.code,
    category: overrides.category ?? base.category,
    message: overrides.message ?? base.message,
    status: overrides.status ?? base.status,
  };
}

export function readPlatformErrorCode(error: unknown, fallbackCode: string | null = null) {
  if (error && typeof error === "object") {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code.trim().length > 0) {
      return code.trim();
    }
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }

  return fallbackCode;
}

export function getAssessmentAuthenticationRequiredError() {
  return resolvePlatformError("assessmentAuthenticationRequired");
}

export function getAdminAccessRequiredError() {
  return resolvePlatformError("adminAccessRequired");
}

export function getInvalidJsonPlatformError() {
  return resolvePlatformError("invalidJson");
}

export function getUserNotFoundPlatformError() {
  return resolvePlatformError("userNotFound");
}

export function getUserLookupUnavailablePlatformError() {
  return resolvePlatformError("userLookupUnavailable");
}

export function getAssessmentCreditStateUnavailablePlatformError(
  status = PLATFORM_ERROR_REGISTRY.assessmentCreditStateUnavailable.status,
) {
  return resolvePlatformError("assessmentCreditStateUnavailable", { status });
}

export function getAssessmentCreditSummaryUnavailablePlatformError() {
  return resolvePlatformError("assessmentCreditSummaryUnavailable");
}

/* Central platform mapper for admin credit mutation failures. Keep this authoritative so
   route handlers and server actions stay aligned on API code/message/status semantics. */
export function mapAdminAssessmentCreditMutationError(error: unknown): PlatformApiError {
  const code = readPlatformErrorCode(error, "ASSESSMENT_CREDIT_UPDATE_FAILED");

  switch (code) {
    case "USER_NOT_FOUND":
      return resolvePlatformError("userNotFound");
    case "ASSESSMENT_CREDIT_GRANT_NOT_FOUND":
      return resolvePlatformError("assessmentCreditGrantNotFound");
    case "ASSESSMENT_CREDIT_GRANT_ALREADY_REVOKED":
      return resolvePlatformError("assessmentCreditGrantAlreadyRevoked");
    case "ASSESSMENT_CREDIT_GRANT_OWNER_MISMATCH":
      return resolvePlatformError("assessmentCreditGrantOwnerMismatch");
    case "ASSESSMENT_CREDIT_SELF_MUTATION_FORBIDDEN":
      return resolvePlatformError("assessmentCreditSelfMutationForbidden");
    case "ASSESSMENT_CREDIT_ACTION_UNSUPPORTED":
    case "ASSESSMENT_CREDIT_AMOUNT_INVALID":
    case "ASSESSMENT_CREDIT_ACCESS_INVALID":
    case "ASSESSMENT_DAILY_OVERRIDE_INVALID":
    case "ASSESSMENT_CREDIT_GRANT_EXPIRY_INVALID":
    case "ASSESSMENT_CREDIT_GRANT_ID_REQUIRED":
      return resolvePlatformError("assessmentCreditInvalidRequest", { code });
    default:
      return resolvePlatformError("assessmentCreditUpdateFailed");
  }
}

/* Server actions in admin user detail encode mutation outcomes in URL query params. Keep this
   mapper colocated with API mapping so admin credits UI and API route stay in lockstep as new
   repository error codes are introduced. */
export function mapAdminAssessmentCreditMutationErrorToQueryCode(error: unknown) {
  const code = readPlatformErrorCode(error, "ASSESSMENT_CREDIT_UPDATE_FAILED");

  switch (code) {
    case "USER_NOT_FOUND":
      return "credits_user_not_found";
    case "ASSESSMENT_CREDIT_GRANT_NOT_FOUND":
      return "credits_grant_not_found";
    case "ASSESSMENT_CREDIT_GRANT_ALREADY_REVOKED":
      return "credits_grant_already_revoked";
    case "ASSESSMENT_CREDIT_GRANT_OWNER_MISMATCH":
      return "credits_grant_owner_mismatch";
    case "ASSESSMENT_CREDIT_SELF_MUTATION_FORBIDDEN":
      return "credits_self_mutation_forbidden";
    case "ASSESSMENT_CREDIT_AMOUNT_INVALID":
      return "credits_amount_invalid";
    case "ASSESSMENT_DAILY_OVERRIDE_INVALID":
      return "credits_daily_override_invalid";
    case "ASSESSMENT_CREDIT_GRANT_EXPIRY_INVALID":
      return "credits_grant_expiry_invalid";
    case "ASSESSMENT_CREDIT_GRANT_ID_REQUIRED":
      return "credits_grant_id_required";
    case "ASSESSMENT_CREDIT_ACTION_UNSUPPORTED":
    case "ASSESSMENT_CREDIT_ACCESS_INVALID":
      return "credits_invalid_request";
    default:
      return "credits_update_failed";
  }
}

/* Central platform mapper for assessment finalization failures after model execution.
   Keep this classification stable because the route/UI rely on these public codes while
   diagnostics rely on internalCode/internalCategory for root-cause tracing. */
export function classifyAssessmentFinalizationFailure(
  error: unknown,
): ClassifiedAssessmentFinalizationFailure {
  const internalCode = readPlatformErrorCode(
    error,
    "UNKNOWN_ASSESSMENT_FINALIZATION_ERROR",
  ) ?? "UNKNOWN_ASSESSMENT_FINALIZATION_ERROR";

  switch (internalCode) {
    case "ASSESSMENT_ACCESS_DISABLED":
      return {
        ...resolvePlatformError("assessmentAccessDisabled"),
        internalCode,
        internalCategory: "access-control",
      };
    case "ASSESSMENT_DAILY_CREDIT_RESERVATION_MISSING":
      return {
        ...resolvePlatformError("assessmentFinalizationFailed", {
          category: "conflict",
          status: 409,
        }),
        internalCode,
        internalCategory: "credit-reservation-missing",
      };
    case "ASSESSMENT_DAILY_CREDIT_LIMIT_CONFLICT":
      return {
        ...resolvePlatformError("assessmentFinalizationFailed", {
          category: "conflict",
          status: 409,
        }),
        internalCode,
        internalCategory: "credit-conflict",
      };
    case "ASSESSMENT_DAILY_CREDIT_RESERVATION_REQUIRED":
      return {
        ...resolvePlatformError("assessmentFinalizationFailed"),
        internalCode,
        internalCategory: "credit-reservation-required",
      };
    case "ASSESSMENT_OWNER_MISMATCH":
      return {
        ...resolvePlatformError("assessmentFinalizationFailed", {
          category: "authorization",
          status: 403,
        }),
        internalCode,
        internalCategory: "ownership-mismatch",
      };
    case "ZOOTOPIA_DURABLE_PERSISTENCE_REQUIRED":
      return {
        ...resolvePlatformError("assessmentFinalizationFailed", {
          category: "availability",
          status: 503,
        }),
        internalCode,
        internalCategory: "durable-persistence-unavailable",
      };
    default:
      return {
        ...resolvePlatformError("assessmentFinalizationFailed"),
        internalCode,
        internalCategory: "unknown-finalization-failure",
      };
  }
}

// ── New domain helpers ─────────────────────────────────────────────────────

/** Authentication required — generic form (not assessment-specific). */
export function getUnauthenticatedError(): PlatformApiError {
  return resolvePlatformError("unauthenticated");
}

/** Profile completion gate — user must complete Settings before using protected features. */
export function getProfileIncompletePlatformError(): PlatformApiError {
  return resolvePlatformError("profileIncomplete");
}

/** Owner-scope storage violation — path does not match session owner. */
export function getOwnerStorageScopeMismatchError(): PlatformApiError {
  return resolvePlatformError("ownerStorageScopeMismatch");
}

/** Owner UID does not match the session owner for a given record. */
export function getOwnerUidMismatchError(): PlatformApiError {
  return resolvePlatformError("ownerUidMismatch");
}

/** Platform-wide daily generation capacity has been reached — server-enforced gate. */
export function getPlatformDailyCapacityExhaustedError(): PlatformApiError {
  return resolvePlatformError("platformDailyCapacityExhausted");
}

/** Per-user daily assessment credits are fully exhausted for today. */
export function getAssessmentDailyCreditsExhaustedError(): PlatformApiError {
  return resolvePlatformError("assessmentDailyCreditsExhausted");
}

/** Requested document was not found for this owner. */
export function getDocumentNotFoundError(): PlatformApiError {
  return resolvePlatformError("documentNotFound");
}

/** Document exists but is not yet ready for use (processing in progress). */
export function getDocumentNotReadyError(): PlatformApiError {
  return resolvePlatformError("documentNotReady");
}

/** Document content could not be loaded (transient service failure). */
export function getDocumentContextUnavailableError(): PlatformApiError {
  return resolvePlatformError("documentContextUnavailable");
}

/** Upload request failed validation. */
export function getUploadRequestInvalidError(message?: string): PlatformApiError {
  return resolvePlatformError("uploadRequestInvalid", message ? { message } : {});
}

/** Upload file exceeds allowed size. */
export function getUploadRequestTooLargeError(): PlatformApiError {
  return resolvePlatformError("uploadRequestTooLarge");
}

/** Admin governance: self-delete attempt. */
export function getAdminSelfDeleteForbiddenError(): PlatformApiError {
  return resolvePlatformError("adminSelfDeleteForbidden");
}

/** Admin governance: attempt to delete a protected allowlisted admin account. */
export function getAllowlistedAdminDeleteForbiddenError(): PlatformApiError {
  return resolvePlatformError("allowlistedAdminDeleteForbidden");
}

/** Admin governance: generic user deletion failure. */
export function getAdminUserDeleteFailedError(): PlatformApiError {
  return resolvePlatformError("adminUserDeleteFailed");
}

/** User UID is required but was not provided. */
export function getUserUidRequiredError(): PlatformApiError {
  return resolvePlatformError("userUidRequired");
}

/** Assessment prompt entitlement value is invalid. */
export function getAssessmentPromptEntitlementInvalidError(): PlatformApiError {
  return resolvePlatformError("assessmentPromptEntitlementInvalid");
}

/* Central mapper for platform-lock and capacity errors from the repository layer.
   Used by the assessment route to classify credit-reservation failures. */
export function mapAssessmentCreditReservationError(error: unknown): PlatformApiError {
  const code = readPlatformErrorCode(error, "ASSESSMENT_DAILY_CREDITS_EXHAUSTED");

  switch (code) {
    case "PLATFORM_DAILY_CAPACITY_EXHAUSTED":
      return resolvePlatformError("platformDailyCapacityExhausted");
    case "ASSESSMENT_DAILY_CREDITS_EXHAUSTED":
      return resolvePlatformError("assessmentDailyCreditsExhausted");
    case "ASSESSMENT_ACCESS_DISABLED":
      return resolvePlatformError("assessmentAccessDisabled");
    default:
      return resolvePlatformError("assessmentDailyCreditsExhausted");
  }
}
