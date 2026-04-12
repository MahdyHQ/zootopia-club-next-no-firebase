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
  | "AUTH_ACCOUNT_SUSPENDED"
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

  AUTH_ACCOUNT_SUSPENDED: "AUTH_ACCOUNT_SUSPENDED",
  USER_SUSPENDED: "AUTH_ACCOUNT_SUSPENDED",
  "AUTH/USER-DISABLED": "AUTH_ACCOUNT_SUSPENDED",
  USER_BANNED: "AUTH_ACCOUNT_SUSPENDED",

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
  "AUTH_ACCOUNT_SUSPENDED",
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
