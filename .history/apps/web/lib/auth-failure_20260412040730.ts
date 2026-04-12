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

  AUTH_PROVIDER_MISCONFIGURED: "AUTH_PROVIDER_MISCONFIGURED",
  EMAIL_PASSWORD_REQUIRED: "AUTH_PROVIDER_MISCONFIGURED",

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

  AUTH_RATE_LIMITED: "AUTH_RATE_LIMITED",
  "AUTH/TOO-MANY-REQUESTS": "AUTH_RATE_LIMITED",
  OVER_REQUEST_RATE_LIMIT: "AUTH_RATE_LIMITED",

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
  const rawCode = readRawCode(input.error);
  const rawStatus = readRawStatus(input.error);
  const message = readRawMessage(input.error);
  const normalizedCode = resolveNormalizedCode({
    rawCode,
    message,
    error: input.error,
  });

  return {
    normalizedCode,
    flow: input.flow,
    stage: input.stage,
    routePath: input.routePath ?? (input.flow === "admin" ? APP_ROUTES.adminLogin : APP_ROUTES.login),
    rawCode,
    rawStatus,
    safeProviderMessage: sanitizeProviderMessage(message),
    sessionCreationAttempted: Boolean(input.sessionCreationAttempted),
    confirmationStatusImplicated: normalizedCode === "AUTH_EMAIL_NOT_CONFIRMED",
    envValidationFailed: normalizedCode === "AUTH_ENV_MISCONFIGURED",
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

  if (input.failure.normalizedCode === "AUTH_UNKNOWN_UPSTREAM_FAILURE") {
    console.error("[auth-diagnosis]", payload);
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
