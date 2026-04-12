import "server-only";

export type AuthEmailDeliveryDiagnosticClass =
  | "provider_daily_quota_likely"
  | "provider_monthly_quota_likely"
  | "provider_rate_limited"
  | "provider_sender_identity_unverified"
  | "provider_configuration_or_auth"
  | "provider_network_or_timeout"
  | "provider_unknown_rejection";

export type AuthEmailDeliveryDiagnosticConfidence = "high" | "medium" | "low";

export type AuthEmailDeliveryDiagnostic = {
  diagnosticClass: AuthEmailDeliveryDiagnosticClass;
  confidence: AuthEmailDeliveryDiagnosticConfidence;
  providerCode: string | null;
  providerStatus: number | null;
  safeProviderMessage: string | null;
};

const RATE_LIMIT_PROVIDER_CODES = new Set([
  "RATE_LIMIT_EXCEEDED",
  "OVER_REQUEST_RATE_LIMIT",
  "OVER_EMAIL_SEND_RATE_LIMIT",
  "OVER_SMS_SEND_RATE_LIMIT",
]);

const PROVIDER_CONFIG_CODES = new Set([
  "MISSING_API_KEY",
  "INVALID_API_KEY",
  "RESTRICTED_API_KEY",
  "INVALID_FROM_ADDRESS",
  "INVALID_ACCESS",
  "INVALID_REGION",
  "MISSING_REQUIRED_FIELD",
  "PROVIDER_DISABLED",
  "EMAIL_PROVIDER_DISABLED",
  "OTP_DISABLED",
  "AUTH_PROVIDER_MISCONFIGURED",
  "AUTH_ENV_MISCONFIGURED",
]);

function toToken(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return value.trim().toUpperCase();
}

function readProviderCode(error: unknown) {
  if (typeof error !== "object" || !error || !("code" in error)) {
    return null;
  }

  const value = (error as { code?: unknown }).code;
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readProviderStatus(error: unknown) {
  if (typeof error !== "object" || !error || !("status" in error)) {
    return null;
  }

  const value = (error as { status?: unknown }).status;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readProviderMessage(error: unknown) {
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

  return scrubbedEmail.length <= 220
    ? scrubbedEmail
    : `${scrubbedEmail.slice(0, 217)}...`;
}

function hasAnyMessageFragment(message: string, fragments: readonly string[]) {
  return fragments.some((fragment) => message.includes(fragment));
}

/* Keep classification intentionally conservative: only claim quota-specific diagnoses when
   provider codes/messages are explicit. Everything else falls back to broader categories. */
export function classifyAuthEmailDeliveryFailure(error: unknown): AuthEmailDeliveryDiagnostic {
  const providerCode = readProviderCode(error);
  const providerStatus = readProviderStatus(error);
  const safeProviderMessage = sanitizeProviderMessage(readProviderMessage(error));
  const providerCodeToken = toToken(providerCode);
  const message = (safeProviderMessage ?? "").toLowerCase();

  if (
    providerCodeToken === "DAILY_QUOTA_EXCEEDED"
    || hasAnyMessageFragment(message, ["daily email quota", "daily quota exceeded"])
  ) {
    return {
      diagnosticClass: "provider_daily_quota_likely",
      confidence: "high",
      providerCode,
      providerStatus,
      safeProviderMessage,
    };
  }

  if (
    providerCodeToken === "MONTHLY_QUOTA_EXCEEDED"
    || hasAnyMessageFragment(message, ["monthly email quota", "monthly quota exceeded"])
  ) {
    return {
      diagnosticClass: "provider_monthly_quota_likely",
      confidence: "high",
      providerCode,
      providerStatus,
      safeProviderMessage,
    };
  }

  if (
    (providerCodeToken !== null && RATE_LIMIT_PROVIDER_CODES.has(providerCodeToken))
    || hasAnyMessageFragment(message, ["too many requests", "rate limit", "rate limited"])
  ) {
    return {
      diagnosticClass: "provider_rate_limited",
      confidence: providerCodeToken !== null && RATE_LIMIT_PROVIDER_CODES.has(providerCodeToken)
        ? "high"
        : "medium",
      providerCode,
      providerStatus,
      safeProviderMessage,
    };
  }

  if (
    hasAnyMessageFragment(message, [
      "you can only send testing emails to your own email address",
      "domain is not verified",
      "verify your domain",
      "resend.dev",
      "email address not authorized",
      "domain mismatch",
      "use your verified domain",
    ])
  ) {
    return {
      diagnosticClass: "provider_sender_identity_unverified",
      confidence: "high",
      providerCode,
      providerStatus,
      safeProviderMessage,
    };
  }

  if (
    (providerCodeToken !== null && PROVIDER_CONFIG_CODES.has(providerCodeToken))
    || hasAnyMessageFragment(message, [
      "invalid api key",
      "missing api key",
      "restricted api key",
      "invalid from",
      "provider is disabled",
      "email logins are disabled",
      "not configured",
      "misconfigured",
      "configuration",
      "smtp",
    ])
  ) {
    return {
      diagnosticClass: "provider_configuration_or_auth",
      confidence: providerCodeToken !== null && PROVIDER_CONFIG_CODES.has(providerCodeToken)
        ? "high"
        : "medium",
      providerCode,
      providerStatus,
      safeProviderMessage,
    };
  }

  if (
    error instanceof TypeError
    || (providerCodeToken !== null
      && (
        providerCodeToken.includes("NETWORK")
        || providerCodeToken.includes("TIMEOUT")
        || providerCodeToken.includes("ECONN")
        || providerCodeToken.includes("ENOTFOUND")
        || providerCodeToken.includes("EAI_AGAIN")
      ))
    || hasAnyMessageFragment(message, [
      "network",
      "fetch failed",
      "failed to fetch",
      "timeout",
      "timed out",
      "econn",
      "enotfound",
      "eai_again",
    ])
  ) {
    return {
      diagnosticClass: "provider_network_or_timeout",
      confidence: "high",
      providerCode,
      providerStatus,
      safeProviderMessage,
    };
  }

  return {
    diagnosticClass: "provider_unknown_rejection",
    confidence: providerStatus !== null && providerStatus >= 500 ? "medium" : "low",
    providerCode,
    providerStatus,
    safeProviderMessage,
  };
}