export type PlatformErrorCategory =
  | "authentication"
  | "authorization"
  | "validation"
  | "not-found"
  | "conflict"
  | "availability"
  | "persistence";

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
  assessmentAuthenticationRequired: {
    code: "UNAUTHENTICATED",
    category: "authentication",
    message: "Sign in is required for assessments.",
    status: 401,
  },
  adminAccessRequired: {
    code: "FORBIDDEN",
    category: "authorization",
    message: "Admin access is required.",
    status: 403,
  },
  invalidJson: {
    code: "INVALID_JSON",
    category: "validation",
    message: "Request body must be valid JSON.",
    status: 400,
  },
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
  assessmentAccessDisabled: {
    code: "ASSESSMENT_ACCESS_DISABLED",
    category: "authorization",
    message: "Assessment generation is disabled for this account.",
    status: 403,
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
  assessmentFinalizationFailed: {
    code: "ASSESSMENT_FINALIZATION_FAILED",
    category: "persistence",
    message: ASSESSMENT_FINALIZATION_GENERIC_MESSAGE,
    status: 500,
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
