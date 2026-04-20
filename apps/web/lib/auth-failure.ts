import { APP_ROUTES } from "@zootopia/shared-config";

export type AuthFlowKind = "user" | "admin";

export type AuthFailureStage =
  | "AUTH_STAGE_A_CREDENTIALS_SUBMITTED"
  | "AUTH_STAGE_B_SUPABASE_ATTEMPT"
  | "AUTH_STAGE_C_PROVIDER_RESPONSE"
  | "AUTH_STAGE_D_AUTHJS_SESSION_CREATION"
  | "AUTH_STAGE_E_SESSION_HYDRATION";

export type AuthFailureCode =
  | "AUTH_INVALID_CREDENTIALS"
  | "AUTH_EMAIL_NOT_CONFIRMED"
  | "AUTH_ACCOUNT_ALREADY_EXISTS"
  | "AUTH_ACCOUNT_SUSPENDED"
  | "AUTH_ACTIVE_USER_CAPACITY_FULL"
  | "AUTH_ACTIVE_USER_ADMISSION_UNAVAILABLE"
  | "AUTH_PROVIDER_MISCONFIGURED"
  | "AUTH_ENV_MISCONFIGURED"
  | "AUTH_SESSION_CREATION_FAILED"
  | "AUTH_SESSION_REFRESH_REQUIRED"
  | "AUTH_RATE_LIMITED"
  | "AUTH_ACCESS_DENIED"
  | "AUTH_NETWORK_FAILURE"
  | "AUTH_UNKNOWN_UPSTREAM_FAILURE";

export type AuthFailureUxAction =
  | "show_error"
  | "redirect_confirm_email"
  | "retry"
  | "refresh_session";

export type AuthFailureCategory =
  | "validation"
  | "authentication"
  | "authorization"
  | "lifecycle_state"
  | "capacity_or_rate_limit"
  | "provider_or_upstream"
  | "misconfiguration"
  | "network"
  | "unknown";

export type AuthFailureSeverity = "info" | "warning" | "error" | "critical";

export type AuthErrorCatalogEntry = {
  code: string;
  category: AuthFailureCategory;
  severity: AuthFailureSeverity;
  userMessage: string;
  developerMeaning: string;
  expectedBehavior: string;
  affectedFlows: readonly string[];
};

export type NormalizedAuthFailure = {
  normalizedCode: AuthFailureCode;
  flow: AuthFlowKind;
  stage: AuthFailureStage;
  routePath: string;
  rawCode: string | null;
  rawStatus: number | null;
  safeProviderMessage: string | null;
  sessionCreationAttempted: boolean;
  confirmationStatusImplicated: boolean;
  envValidationFailed: boolean;
};

/* Central auth error catalog.
   This is the single source of truth for auth-domain classification (validation vs
   authentication vs authorization vs lifecycle) across UI messaging, API route handling,
   and future observability/reporting work. Future agents should add new auth-domain error
   codes here first, then wire call sites, instead of scattering local string switches. */
const AUTH_ERROR_CATALOG: Record<string, AuthErrorCatalogEntry> = {
  AUTH_INVALID_INPUT: {
    code: "AUTH_INVALID_INPUT",
    category: "validation",
    severity: "warning",
    userMessage: "Some submitted values are invalid. Please review and retry.",
    developerMeaning: "Auth request payload failed schema/format validation before authentication.",
    expectedBehavior: "Return 400 with field-level hints when possible.",
    affectedFlows: ["signup", "login", "admin_login", "forgot_password", "reset_password", "change_password"],
  },
  AUTH_INVALID_CREDENTIALS: {
    code: "AUTH_INVALID_CREDENTIALS",
    category: "authentication",
    severity: "warning",
    userMessage: "Email or password is incorrect.",
    developerMeaning: "Credential verification failed with provider/auth adapter.",
    expectedBehavior: "Return 401 without leaking whether account exists.",
    affectedFlows: ["login", "admin_login"],
  },
  AUTH_EMAIL_NOT_CONFIRMED: {
    code: "AUTH_EMAIL_NOT_CONFIRMED",
    category: "lifecycle_state",
    severity: "warning",
    userMessage: "This account must confirm email before login can continue.",
    developerMeaning: "Identity exists but provider marks email verification pending.",
    expectedBehavior: "Send user to confirm-email recovery lane.",
    affectedFlows: ["signup", "login", "admin_login", "confirm_email", "resend_confirmation"],
  },
  AUTH_ACCOUNT_ALREADY_EXISTS: {
    code: "AUTH_ACCOUNT_ALREADY_EXISTS",
    category: "lifecycle_state",
    severity: "warning",
    userMessage: "An account with this email already exists.",
    developerMeaning: "Signup attempted against an existing identity.",
    expectedBehavior: "Guide user toward sign-in or confirm-email.",
    affectedFlows: ["signup"],
  },
  AUTH_ACCOUNT_SUSPENDED: {
    code: "AUTH_ACCOUNT_SUSPENDED",
    category: "authorization",
    severity: "error",
    userMessage: "This account is suspended.",
    developerMeaning: "Session bootstrap found blocked/suspended account status.",
    expectedBehavior: "Fail closed and deny session creation.",
    affectedFlows: ["login", "admin_login", "session_bootstrap"],
  },
  AUTH_UNAUTHENTICATED: {
    code: "AUTH_UNAUTHENTICATED",
    category: "authentication",
    severity: "warning",
    userMessage: "Please sign in first.",
    developerMeaning: "Protected route hit without a valid authenticated session.",
    expectedBehavior: "Return 401 or redirect to login.",
    affectedFlows: ["session_bootstrap", "logout", "owner_scope", "admin_boundary"],
  },
  AUTH_UNAUTHORIZED: {
    code: "AUTH_UNAUTHORIZED",
    category: "authorization",
    severity: "error",
    userMessage: "You are not authorized for this action.",
    developerMeaning: "Identity is authenticated but lacks required permission for the route/resource.",
    expectedBehavior: "Fail closed and audit if sensitive.",
    affectedFlows: ["owner_scope", "admin_boundary"],
  },
  AUTH_FORBIDDEN: {
    code: "AUTH_FORBIDDEN",
    category: "authorization",
    severity: "error",
    userMessage: "Access to this resource is forbidden.",
    developerMeaning: "Explicit policy denied access despite known identity.",
    expectedBehavior: "Return 403 with no privileged detail leakage.",
    affectedFlows: ["owner_scope", "admin_boundary"],
  },
  AUTH_OWNER_SCOPE_VIOLATION: {
    code: "AUTH_OWNER_SCOPE_VIOLATION",
    category: "authorization",
    severity: "critical",
    userMessage: "This request does not match your account scope.",
    developerMeaning: "Cross-owner path/record mismatch detected (ownerUid or storage namespace mismatch).",
    expectedBehavior: "Fail closed, log trace, never fallback to client identifiers.",
    affectedFlows: ["owner_scope", "session_bootstrap"],
  },
  AUTH_ADMIN_NOT_ALLOWLISTED: {
    code: "AUTH_ADMIN_NOT_ALLOWLISTED",
    category: "authorization",
    severity: "error",
    userMessage: "This account is not approved for admin login.",
    developerMeaning: "Admin identifier or email is not on allowlist.",
    expectedBehavior: "Deny admin session and keep user lane separate.",
    affectedFlows: ["admin_login", "admin_boundary"],
  },
  AUTH_ADMIN_CLAIM_REQUIRED: {
    code: "AUTH_ADMIN_CLAIM_REQUIRED",
    category: "authorization",
    severity: "error",
    userMessage: "Admin claim is missing for this allowlisted account.",
    developerMeaning: "Allowlisted admin identity does not carry required Supabase app-metadata admin claim.",
    expectedBehavior: "Deny admin session until claim is provisioned and refreshed.",
    affectedFlows: ["admin_login", "admin_boundary"],
  },
  AUTH_ACTIVE_USER_CAPACITY_FULL: {
    code: "AUTH_ACTIVE_USER_CAPACITY_FULL",
    category: "capacity_or_rate_limit",
    severity: "warning",
    userMessage: "Capacity is full right now. Please retry shortly.",
    developerMeaning: "Active normal-user governance denied admission at cap.",
    expectedBehavior: "Deny new session until slot is available.",
    affectedFlows: ["login", "signup", "session_bootstrap"],
  },
  AUTH_ACTIVE_USER_ADMISSION_UNAVAILABLE: {
    code: "AUTH_ACTIVE_USER_ADMISSION_UNAVAILABLE",
    category: "capacity_or_rate_limit",
    severity: "warning",
    userMessage: "Admission service is temporarily unavailable.",
    developerMeaning: "Capacity governance persistence/check path temporarily degraded.",
    expectedBehavior: "Fail closed for protected admission decisions.",
    affectedFlows: ["login", "signup"],
  },
  AUTH_RATE_LIMITED: {
    code: "AUTH_RATE_LIMITED",
    category: "capacity_or_rate_limit",
    severity: "warning",
    userMessage: "Too many requests. Please retry shortly.",
    developerMeaning: "Rate limiter rejected request (account/IP/provider lane).",
    expectedBehavior: "Return 429 with retry hints.",
    affectedFlows: ["signup", "login", "admin_login", "confirm_email", "resend_confirmation", "forgot_password"],
  },
  AUTH_SESSION_CREATION_FAILED: {
    code: "AUTH_SESSION_CREATION_FAILED",
    category: "lifecycle_state",
    severity: "error",
    userMessage: "Could not establish a secure session.",
    developerMeaning: "Auth.js handoff/bootstrap failed after provider auth step.",
    expectedBehavior: "Block navigation to protected routes, allow retry.",
    affectedFlows: ["login", "admin_login", "session_bootstrap"],
  },
  AUTH_SESSION_REFRESH_REQUIRED: {
    code: "AUTH_SESSION_REFRESH_REQUIRED",
    category: "lifecycle_state",
    severity: "warning",
    userMessage: "Please refresh or sign in again to continue.",
    developerMeaning: "Token freshness/rehydration window expired or token invalidated.",
    expectedBehavior: "Prompt session refresh/re-auth.",
    affectedFlows: ["login", "admin_login", "session_bootstrap", "reset_password"],
  },
  AUTH_PROVIDER_MISCONFIGURED: {
    code: "AUTH_PROVIDER_MISCONFIGURED",
    category: "misconfiguration",
    severity: "critical",
    userMessage: "Authentication provider is not configured correctly right now.",
    developerMeaning: "Supabase/Auth provider setup mismatch or disabled provider lane.",
    expectedBehavior: "Fail closed and surface operational support path.",
    affectedFlows: ["signup", "login", "admin_login", "confirm_email", "forgot_password", "reset_password"],
  },
  AUTH_ENV_MISCONFIGURED: {
    code: "AUTH_ENV_MISCONFIGURED",
    category: "misconfiguration",
    severity: "critical",
    userMessage: "Authentication runtime is not configured correctly.",
    developerMeaning: "Server env/runtime prerequisites missing (keys, allowlist, admin runtime).",
    expectedBehavior: "Fail closed and alert operators.",
    affectedFlows: ["signup", "login", "admin_login", "confirm_email", "forgot_password", "session_bootstrap"],
  },
  AUTH_PROVIDER_LIFECYCLE_MISMATCH: {
    code: "AUTH_PROVIDER_LIFECYCLE_MISMATCH",
    category: "lifecycle_state",
    severity: "error",
    userMessage: "Authentication session state is out of sync. Please retry.",
    developerMeaning: "Supabase/Auth.js lifecycle disagreement (token/session/user-state mismatch).",
    expectedBehavior: "Force refresh/re-auth and keep Auth.js as final trust boundary.",
    affectedFlows: ["login", "admin_login", "confirm_email", "session_bootstrap", "rehydration"],
  },
  AUTH_NETWORK_FAILURE: {
    code: "AUTH_NETWORK_FAILURE",
    category: "network",
    severity: "error",
    userMessage: "Network issue interrupted authentication.",
    developerMeaning: "Transient upstream connectivity failure to auth provider or persistence dependency.",
    expectedBehavior: "Return transient failure and allow retry.",
    affectedFlows: ["all_auth_flows"],
  },
  AUTH_UNKNOWN_UPSTREAM_FAILURE: {
    code: "AUTH_UNKNOWN_UPSTREAM_FAILURE",
    category: "unknown",
    severity: "error",
    userMessage: "Authentication could not be completed right now.",
    developerMeaning: "Unhandled or ambiguous provider/runtime auth failure.",
    expectedBehavior: "Use safe generic messaging and log normalized diagnostics.",
    affectedFlows: ["all_auth_flows"],
  },
};

const RAW_CODE_TO_NORMALIZED: Record<string, AuthFailureCode> = {
  AUTH_INVALID_CREDENTIALS: "AUTH_INVALID_CREDENTIALS",
  INVALID_CREDENTIALS: "AUTH_INVALID_CREDENTIALS",
  "AUTH/INVALID-LOGIN-CREDENTIALS": "AUTH_INVALID_CREDENTIALS",
  "AUTH/WRONG-PASSWORD": "AUTH_INVALID_CREDENTIALS",
  "AUTH/INVALID-CREDENTIAL": "AUTH_INVALID_CREDENTIALS",
  "INVALID_LOGIN_CREDENTIALS": "AUTH_INVALID_CREDENTIALS",

  AUTH_EMAIL_NOT_CONFIRMED: "AUTH_EMAIL_NOT_CONFIRMED",
  EMAIL_NOT_CONFIRMED: "AUTH_EMAIL_NOT_CONFIRMED",
  EMAIL_NOT_VERIFIED: "AUTH_EMAIL_NOT_CONFIRMED",
  EMAIL_NOT_CONFIRMED_ERROR: "AUTH_EMAIL_NOT_CONFIRMED",

  AUTH_ACCOUNT_ALREADY_EXISTS: "AUTH_ACCOUNT_ALREADY_EXISTS",
  USER_ALREADY_EXISTS: "AUTH_ACCOUNT_ALREADY_EXISTS",
  USER_ALREADY_REGISTERED: "AUTH_ACCOUNT_ALREADY_EXISTS",
  EMAIL_EXISTS: "AUTH_ACCOUNT_ALREADY_EXISTS",

  AUTH_ACCOUNT_SUSPENDED: "AUTH_ACCOUNT_SUSPENDED",
  USER_SUSPENDED: "AUTH_ACCOUNT_SUSPENDED",
  "AUTH/USER-DISABLED": "AUTH_ACCOUNT_SUSPENDED",
  USER_BANNED: "AUTH_ACCOUNT_SUSPENDED",

  AUTH_ACTIVE_USER_CAPACITY_FULL: "AUTH_ACTIVE_USER_CAPACITY_FULL",

  AUTH_PROVIDER_MISCONFIGURED: "AUTH_PROVIDER_MISCONFIGURED",
  EMAIL_PASSWORD_REQUIRED: "AUTH_PROVIDER_MISCONFIGURED",
  EMAIL_PROVIDER_DISABLED: "AUTH_PROVIDER_MISCONFIGURED",
  PROVIDER_DISABLED: "AUTH_PROVIDER_MISCONFIGURED",
  OTP_DISABLED: "AUTH_PROVIDER_MISCONFIGURED",
  VERIFICATION_RESEND_PROVIDER_IDENTITY_UNVERIFIED: "AUTH_PROVIDER_MISCONFIGURED",
  MISSING_API_KEY: "AUTH_PROVIDER_MISCONFIGURED",
  INVALID_API_KEY: "AUTH_PROVIDER_MISCONFIGURED",
  RESTRICTED_API_KEY: "AUTH_PROVIDER_MISCONFIGURED",
  INVALID_FROM_ADDRESS: "AUTH_PROVIDER_MISCONFIGURED",

  AUTH_ENV_MISCONFIGURED: "AUTH_ENV_MISCONFIGURED",
  SUPABASE_ADMIN_UNAVAILABLE: "AUTH_ENV_MISCONFIGURED",
  ADMIN_ALLOWLIST_UNCONFIGURED: "AUTH_ENV_MISCONFIGURED",
  SUPABASE_WEB_CONFIG_MISSING: "AUTH_ENV_MISCONFIGURED",
  CONFIGURATION: "AUTH_ENV_MISCONFIGURED",
  CALLBACKROUTEERROR: "AUTH_ENV_MISCONFIGURED",
  "AUTH/APP-NOT-AUTHORIZED": "AUTH_ENV_MISCONFIGURED",
  "AUTH/INVALID-API-KEY": "AUTH_ENV_MISCONFIGURED",
  "AUTH/INVALID-APP-CREDENTIAL": "AUTH_ENV_MISCONFIGURED",
  "AUTH/UNAUTHORIZED-DOMAIN": "AUTH_ENV_MISCONFIGURED",
  AUTH_RUNTIME_UNAVAILABLE: "AUTH_ENV_MISCONFIGURED",
  VERIFICATION_RESEND_UNAVAILABLE: "AUTH_ENV_MISCONFIGURED",

  AUTH_SESSION_CREATION_FAILED: "AUTH_SESSION_CREATION_FAILED",
  BOOTSTRAP_FAILED: "AUTH_SESSION_CREATION_FAILED",
  ADMIN_BOOTSTRAP_FAILED: "AUTH_SESSION_CREATION_FAILED",
  BOOTSTRAP_TIMEOUT: "AUTH_SESSION_CREATION_FAILED",
  BOOTSTRAP_RESPONSE_INVALID: "AUTH_SESSION_CREATION_FAILED",
  ADMIN_BOOTSTRAP_RESPONSE_INVALID: "AUTH_SESSION_CREATION_FAILED",

  AUTH_SESSION_REFRESH_REQUIRED: "AUTH_SESSION_REFRESH_REQUIRED",
  SESSION_NOT_ESTABLISHED: "AUTH_SESSION_REFRESH_REQUIRED",
  RECENT_SIGN_IN_REQUIRED: "AUTH_SESSION_REFRESH_REQUIRED",
  ID_TOKEN_INVALID: "AUTH_SESSION_REFRESH_REQUIRED",
  ID_TOKEN_REVOKED: "AUTH_SESSION_REFRESH_REQUIRED",
  REDIRECT_RESULT_MISSING: "AUTH_SESSION_REFRESH_REQUIRED",
  ADMIN_TOKEN_REFRESH_REQUIRED: "AUTH_SESSION_REFRESH_REQUIRED",
  OTP_EXPIRED: "AUTH_SESSION_REFRESH_REQUIRED",
  FLOW_STATE_EXPIRED: "AUTH_SESSION_REFRESH_REQUIRED",
  FLOW_STATE_NOT_FOUND: "AUTH_SESSION_REFRESH_REQUIRED",
  SESSION_EXPIRED: "AUTH_SESSION_REFRESH_REQUIRED",
  SESSION_NOT_FOUND: "AUTH_SESSION_REFRESH_REQUIRED",

  AUTH_RATE_LIMITED: "AUTH_RATE_LIMITED",
  AUTH_ACTIVE_USER_ADMISSION_UNAVAILABLE: "AUTH_ACTIVE_USER_ADMISSION_UNAVAILABLE",
  "AUTH/TOO-MANY-REQUESTS": "AUTH_RATE_LIMITED",
  OVER_REQUEST_RATE_LIMIT: "AUTH_RATE_LIMITED",
  OVER_EMAIL_SEND_RATE_LIMIT: "AUTH_RATE_LIMITED",
  OVER_SMS_SEND_RATE_LIMIT: "AUTH_RATE_LIMITED",
  RATE_LIMIT_EXCEEDED: "AUTH_RATE_LIMITED",
  DAILY_QUOTA_EXCEEDED: "AUTH_RATE_LIMITED",
  MONTHLY_QUOTA_EXCEEDED: "AUTH_RATE_LIMITED",
  VERIFICATION_RESEND_COOLDOWN_ACTIVE: "AUTH_RATE_LIMITED",
  VERIFICATION_RESEND_ACCOUNT_WINDOW_EXHAUSTED: "AUTH_RATE_LIMITED",
  VERIFICATION_RESEND_IP_WINDOW_EXHAUSTED: "AUTH_RATE_LIMITED",
  VERIFICATION_RESEND_PROVIDER_RATE_LIMITED: "AUTH_RATE_LIMITED",
  VERIFICATION_RESEND_PROVIDER_DAILY_LIMIT_LIKELY: "AUTH_RATE_LIMITED",
  VERIFICATION_RESEND_PROVIDER_MONTHLY_LIMIT_LIKELY: "AUTH_RATE_LIMITED",

  VERIFICATION_RESEND_PROVIDER_NETWORK_FAILURE: "AUTH_NETWORK_FAILURE",
  VERIFICATION_RESEND_PROVIDER_REJECTED: "AUTH_UNKNOWN_UPSTREAM_FAILURE",

  ADMIN_ACCOUNT_UNAUTHORIZED: "AUTH_ACCESS_DENIED",
  ADMIN_CLAIM_REQUIRED: "AUTH_ACCESS_DENIED",
  ADMIN_CLAIM_DENIED: "AUTH_ACCESS_DENIED",
  ADMIN_LOGIN_REQUIRED: "AUTH_ACCESS_DENIED",
  GOOGLE_SIGN_IN_REQUIRED: "AUTH_ACCESS_DENIED",
  ADMIN_LOGIN_PASSWORD_UNCONFIGURED: "AUTH_ENV_MISCONFIGURED",
  ADMIN_USERNAME_NOT_FOUND: "AUTH_ACCESS_DENIED",
  ADMIN_LOGIN_PASSWORD_INVALID: "AUTH_ACCESS_DENIED",
  ADMIN_LOGIN_PASSWORD_REQUIRED: "AUTH_ACCESS_DENIED",
  OWNER_STORAGE_SCOPE_MISMATCH: "AUTH_ACCESS_DENIED",
  OWNER_UID_MISMATCH: "AUTH_ACCESS_DENIED",
  FORBIDDEN: "AUTH_ACCESS_DENIED",
  UNAUTHENTICATED: "AUTH_SESSION_REFRESH_REQUIRED",
  PASSWORD_CHANGE_REAUTH_REQUIRED: "AUTH_SESSION_REFRESH_REQUIRED",
};

const PROVIDER_MISCONFIGURED_PATTERNS = [
  "email logins are disabled",
  "provider is disabled",
  "unsupported grant type",
  "unsupported_grant_type",
  "password login is disabled",
];

const AUTH_FAILURE_CODE_VALUES: AuthFailureCode[] = [
  "AUTH_INVALID_CREDENTIALS",
  "AUTH_EMAIL_NOT_CONFIRMED",
  "AUTH_ACCOUNT_ALREADY_EXISTS",
  "AUTH_ACCOUNT_SUSPENDED",
  "AUTH_ACTIVE_USER_CAPACITY_FULL",
  "AUTH_ACTIVE_USER_ADMISSION_UNAVAILABLE",
  "AUTH_PROVIDER_MISCONFIGURED",
  "AUTH_ENV_MISCONFIGURED",
  "AUTH_SESSION_CREATION_FAILED",
  "AUTH_SESSION_REFRESH_REQUIRED",
  "AUTH_RATE_LIMITED",
  "AUTH_ACCESS_DENIED",
  "AUTH_NETWORK_FAILURE",
  "AUTH_UNKNOWN_UPSTREAM_FAILURE",
];

const AUTH_FAILURE_STAGE_VALUES: AuthFailureStage[] = [
  "AUTH_STAGE_A_CREDENTIALS_SUBMITTED",
  "AUTH_STAGE_B_SUPABASE_ATTEMPT",
  "AUTH_STAGE_C_PROVIDER_RESPONSE",
  "AUTH_STAGE_D_AUTHJS_SESSION_CREATION",
  "AUTH_STAGE_E_SESSION_HYDRATION",
];

const AUTH_FLOW_KIND_VALUES: AuthFlowKind[] = ["user", "admin"];

type AuthFailureSnapshot = Partial<NormalizedAuthFailure>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asOptionalString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asOptionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asOptionalBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function asAuthFailureCode(value: unknown): AuthFailureCode | null {
  return typeof value === "string" && AUTH_FAILURE_CODE_VALUES.includes(value as AuthFailureCode)
    ? (value as AuthFailureCode)
    : null;
}

function asAuthFailureStage(value: unknown): AuthFailureStage | null {
  return typeof value === "string" && AUTH_FAILURE_STAGE_VALUES.includes(value as AuthFailureStage)
    ? (value as AuthFailureStage)
    : null;
}

function asAuthFlowKind(value: unknown): AuthFlowKind | null {
  return typeof value === "string" && AUTH_FLOW_KIND_VALUES.includes(value as AuthFlowKind)
    ? (value as AuthFlowKind)
    : null;
}

function readAuthFailureSnapshot(error: unknown): AuthFailureSnapshot | null {
  if (!isRecord(error) || !isRecord(error.details)) {
    return null;
  }

  // Preserve the earliest stage-aware classification when upstream callers already attached
  // a normalized failure payload (for example during Supabase/Auth.js handoff rethrows).
  const detailRoot = isRecord(error.details.failure) ? error.details.failure : error.details;

  const snapshot: AuthFailureSnapshot = {};
  const normalizedCode = asAuthFailureCode(detailRoot.normalizedCode);
  const flow = asAuthFlowKind(detailRoot.flow);
  const stage = asAuthFailureStage(detailRoot.stage);
  const routePath = asOptionalString(detailRoot.routePath);
  const rawCode = asOptionalString(detailRoot.rawCode);
  const rawStatus = asOptionalNumber(detailRoot.rawStatus);
  const safeProviderMessage = asOptionalString(detailRoot.safeProviderMessage);
  const sessionCreationAttempted = asOptionalBoolean(detailRoot.sessionCreationAttempted);
  const confirmationStatusImplicated = asOptionalBoolean(detailRoot.confirmationStatusImplicated);
  const envValidationFailed = asOptionalBoolean(detailRoot.envValidationFailed);

  if (normalizedCode) {
    snapshot.normalizedCode = normalizedCode;
  }

  if (flow) {
    snapshot.flow = flow;
  }

  if (stage) {
    snapshot.stage = stage;
  }

  if (routePath) {
    snapshot.routePath = routePath;
  }

  if (rawCode) {
    snapshot.rawCode = rawCode;
  }

  if (rawStatus !== null) {
    snapshot.rawStatus = rawStatus;
  }

  if (safeProviderMessage) {
    snapshot.safeProviderMessage = safeProviderMessage;
  }

  if (sessionCreationAttempted !== null) {
    snapshot.sessionCreationAttempted = sessionCreationAttempted;
  }

  if (confirmationStatusImplicated !== null) {
    snapshot.confirmationStatusImplicated = confirmationStatusImplicated;
  }

  if (envValidationFailed !== null) {
    snapshot.envValidationFailed = envValidationFailed;
  }

  return Object.keys(snapshot).length > 0 ? snapshot : null;
}

function toToken(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return value.trim().toUpperCase();
}

function readRawCode(error: unknown) {
  if (typeof error !== "object" || !error || !("code" in error)) {
    return null;
  }

  const value = (error as { code?: unknown }).code;
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readRawStatus(error: unknown) {
  if (typeof error !== "object" || !error || !("status" in error)) {
    return null;
  }

  const value = (error as { status?: unknown }).status;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readRawMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }

  if (typeof error === "object" && error && "message" in error) {
    const value = (error as { message?: unknown }).message;
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function sanitizeProviderMessage(message: string | null) {
  if (!message) {
    return null;
  }

  const scrubbedEmail = message.replace(
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
    "[redacted-email]",
  );

  return scrubbedEmail.length <= 180
    ? scrubbedEmail
    : `${scrubbedEmail.slice(0, 177)}...`;
}

function isNetworkFailure(error: unknown, rawCode: string | null, message: string | null) {
  if (error instanceof TypeError) {
    return true;
  }

  const token = toToken(rawCode) ?? "";
  if (token.includes("NETWORK") || token.includes("TIMEOUT")) {
    return true;
  }

  const normalizedMessage = (message ?? "").toLowerCase();
  return (
    normalizedMessage.includes("network")
    || normalizedMessage.includes("fetch failed")
    || normalizedMessage.includes("timeout")
    || normalizedMessage.includes("failed to fetch")
  );
}

function inferByMessage(message: string | null) {
  if (!message) {
    return null;
  }

  const normalized = message.toLowerCase();

  if (normalized.includes("email not confirmed") || normalized.includes("email not verified")) {
    return "AUTH_EMAIL_NOT_CONFIRMED" satisfies AuthFailureCode;
  }

  if (
    normalized.includes("already registered")
    || normalized.includes("already exists")
    || normalized.includes("already been registered")
  ) {
    return "AUTH_ACCOUNT_ALREADY_EXISTS" satisfies AuthFailureCode;
  }

  if (PROVIDER_MISCONFIGURED_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return "AUTH_PROVIDER_MISCONFIGURED" satisfies AuthFailureCode;
  }

  if (
    normalized.includes("runtime")
    || normalized.includes("not configured")
    || normalized.includes("missing")
    || normalized.includes("invalid api key")
    || normalized.includes("allowlist")
  ) {
    return "AUTH_ENV_MISCONFIGURED" satisfies AuthFailureCode;
  }

  return null;
}

function resolveNormalizedCode(input: {
  rawCode: string | null;
  message: string | null;
  error: unknown;
}) {
  const codeToken = toToken(input.rawCode);
  if (codeToken && codeToken in RAW_CODE_TO_NORMALIZED) {
    return RAW_CODE_TO_NORMALIZED[codeToken];
  }

  if (isNetworkFailure(input.error, input.rawCode, input.message)) {
    return "AUTH_NETWORK_FAILURE" satisfies AuthFailureCode;
  }

  const inferred = inferByMessage(input.message);
  if (inferred) {
    return inferred;
  }

  return "AUTH_UNKNOWN_UPSTREAM_FAILURE" satisfies AuthFailureCode;
}

export function normalizeAuthFailure(input: {
  error: unknown;
  flow: AuthFlowKind;
  stage: AuthFailureStage;
  routePath?: string;
  sessionCreationAttempted?: boolean;
}): NormalizedAuthFailure {
  const snapshot = readAuthFailureSnapshot(input.error);
  const rawCode = snapshot?.rawCode ?? readRawCode(input.error);
  const rawStatus = snapshot?.rawStatus ?? readRawStatus(input.error);
  const message = readRawMessage(input.error);
  const normalizedCode =
    snapshot?.normalizedCode
    ?? resolveNormalizedCode({
      rawCode,
      message,
      error: input.error,
    });
  const flow = snapshot?.flow ?? input.flow;
  const stage = snapshot?.stage ?? input.stage;
  const routePath =
    snapshot?.routePath
    ?? input.routePath
    ?? (flow === "admin" ? APP_ROUTES.adminLogin : APP_ROUTES.login);
  const safeProviderMessage = snapshot?.safeProviderMessage ?? sanitizeProviderMessage(message);
  const sessionCreationAttempted =
    snapshot?.sessionCreationAttempted
    ?? Boolean(input.sessionCreationAttempted);
  const confirmationStatusImplicated =
    snapshot?.confirmationStatusImplicated
    ?? normalizedCode === "AUTH_EMAIL_NOT_CONFIRMED";
  const envValidationFailed =
    snapshot?.envValidationFailed
    ?? normalizedCode === "AUTH_ENV_MISCONFIGURED";

  return {
    normalizedCode,
    flow,
    stage,
    routePath,
    rawCode,
    rawStatus,
    safeProviderMessage,
    sessionCreationAttempted,
    confirmationStatusImplicated,
    envValidationFailed,
  };
}

export function isEmailConfirmationFailure(failure: NormalizedAuthFailure) {
  return failure.normalizedCode === "AUTH_EMAIL_NOT_CONFIRMED";
}

function mapNormalizedCodeToCatalogKey(code: AuthFailureCode): string {
  if (code === "AUTH_ACCESS_DENIED") {
    return "AUTH_UNAUTHORIZED";
  }

  return code;
}

function mapRawCodeToCatalogKey(rawCode: string | null): string | null {
  const token = toToken(rawCode);
  if (!token) {
    return null;
  }

  if (token === "FORBIDDEN") {
    return "AUTH_FORBIDDEN";
  }

  if (token === "UNAUTHENTICATED") {
    return "AUTH_UNAUTHENTICATED";
  }

  if (token === "OWNER_STORAGE_SCOPE_MISMATCH" || token === "OWNER_UID_MISMATCH") {
    return "AUTH_OWNER_SCOPE_VIOLATION";
  }

  if (token === "ADMIN_ACCOUNT_UNAUTHORIZED" || token === "ADMIN_USERNAME_NOT_FOUND") {
    return "AUTH_ADMIN_NOT_ALLOWLISTED";
  }

  if (token === "ADMIN_CLAIM_REQUIRED" || token === "ADMIN_CLAIM_DENIED") {
    return "AUTH_ADMIN_CLAIM_REQUIRED";
  }

  if (token === "PASSWORD_CHANGE_REAUTH_REQUIRED") {
    return "AUTH_PROVIDER_LIFECYCLE_MISMATCH";
  }

  return null;
}

export function getAuthErrorCatalogEntry(input: {
  normalizedCode?: AuthFailureCode | null;
  rawCode?: string | null;
}) {
  const rawCatalogKey = mapRawCodeToCatalogKey(input.rawCode ?? null);
  if (rawCatalogKey && rawCatalogKey in AUTH_ERROR_CATALOG) {
    return AUTH_ERROR_CATALOG[rawCatalogKey];
  }

  const normalizedCode = input.normalizedCode ?? null;
  if (!normalizedCode) {
    return AUTH_ERROR_CATALOG.AUTH_UNKNOWN_UPSTREAM_FAILURE;
  }

  const normalizedCatalogKey = mapNormalizedCodeToCatalogKey(normalizedCode);
  return AUTH_ERROR_CATALOG[normalizedCatalogKey] ?? AUTH_ERROR_CATALOG.AUTH_UNKNOWN_UPSTREAM_FAILURE;
}

export function describeAuthFailure(failure: NormalizedAuthFailure) {
  return getAuthErrorCatalogEntry({
    normalizedCode: failure.normalizedCode,
    rawCode: failure.rawCode,
  });
}

export function buildConfirmEmailRoute(input: {
  email: string;
  flow: "sign_in" | "sign_up" | "admin";
  fromRoute?: string;
}) {
  const params = new URLSearchParams();
  params.set("email", input.email);
  params.set("flow", input.flow);

  if (input.fromRoute) {
    params.set("from", input.fromRoute);
  }

  return `${APP_ROUTES.confirmEmail}?${params.toString()}`;
}

export function logAuthDiagnosis(input: {
  failure: NormalizedAuthFailure;
  uxAction: AuthFailureUxAction;
  redirectedToConfirmation?: boolean;
}) {
  const payload = {
    flow: input.failure.flow,
    routePath: input.failure.routePath,
    stage: input.failure.stage,
    normalizedCode: input.failure.normalizedCode,
    rawProviderStatus: input.failure.rawStatus,
    rawProviderCode: input.failure.rawCode,
    safeProviderMessage: input.failure.safeProviderMessage,
    sessionCreationAttempted: input.failure.sessionCreationAttempted,
    confirmationStatusImplicated: input.failure.confirmationStatusImplicated,
    envValidationFailed: input.failure.envValidationFailed,
    redirectedToConfirmation: Boolean(input.redirectedToConfirmation),
    finalUxAction: input.uxAction,
    timestamp: new Date().toISOString(),
  };

  /* Auth diagnosis logs run from interactive client flows. Treat unknown failures as warnings,
     not console errors, so staged telemetry (for example submit/retry markers) does not trigger
     Next.js development error overlays while still preserving actionable diagnostics in the console. */
  if (input.failure.normalizedCode === "AUTH_UNKNOWN_UPSTREAM_FAILURE") {
    if (input.uxAction === "retry") {
      console.info("[auth-diagnosis]", payload);
      return;
    }

    console.warn("[auth-diagnosis]", payload);
    return;
  }

  if (
    input.failure.normalizedCode === "AUTH_ENV_MISCONFIGURED"
    || input.failure.normalizedCode === "AUTH_PROVIDER_MISCONFIGURED"
    || input.failure.normalizedCode === "AUTH_SESSION_CREATION_FAILED"
  ) {
    console.warn("[auth-diagnosis]", payload);
    return;
  }

  console.info("[auth-diagnosis]", payload);
}
