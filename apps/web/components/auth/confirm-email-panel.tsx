"use client";

import { APP_ROUTES } from "@zootopia/shared-config";
import type { EmailOtpType, SupabaseClient } from "@supabase/supabase-js";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AuthStatus } from "@/components/auth/auth-status";
import {
  createAuthFlowError,
  type AuthStatusDescriptor,
} from "@/components/auth/auth-feedback";
import {
  logAuthDiagnosis,
  normalizeAuthFailure,
  type NormalizedAuthFailure,
} from "@/lib/auth-failure";
import type { AppMessages } from "@/lib/messages";
import {
  getEphemeralSupabaseClient,
  isSupabaseWebConfigured,
  primeEphemeralSupabaseClient,
} from "@/lib/supabase/client";

export type ConfirmEmailFlow = "sign_in" | "sign_up" | "admin";

export type ConfirmEmailFinalizeParams = {
  authCode: string;
  tokenHash: string;
  verificationType: string;
  errorCode: string;
  errorDescription: string;
  accessToken: string;
  refreshToken: string;
};

type ConfirmEmailPanelProps = {
  messages: AppMessages;
  supabaseAuthReady: boolean;
  initialEmail: string;
  flow: ConfirmEmailFlow;
  fromRoute: string;
  initialFinalize: ConfirmEmailFinalizeParams;
};

const CONFIRM_EMAIL_RESEND_API_ROUTE = "/api/auth/confirm-email/resend";
const CALLBACK_URL_SENSITIVE_PARAM_KEYS = [
  "code",
  "token_hash",
  "type",
  "error",
  "error_code",
  "error_description",
  "access_token",
  "refresh_token",
  "expires_at",
  "expires_in",
  "token_type",
] as const;

// ─── Backend error code registry ─────────────────────────────────────────────
// Exhaustive list of every error code the resend API can return.
// Keeping them as typed constants prevents silent drift when backend adds new codes.

type ResendGovernanceCode =
  | "VERIFICATION_RESEND_READY"
  | "VERIFICATION_RESEND_COOLDOWN_ACTIVE"
  | "VERIFICATION_RESEND_ACCOUNT_WINDOW_EXHAUSTED"
  | "VERIFICATION_RESEND_IP_WINDOW_EXHAUSTED"
  | "VERIFICATION_RESEND_UNAVAILABLE";

type ResendProviderErrorCode =
  | "VERIFICATION_RESEND_INVALID_EMAIL"
  | "VERIFICATION_RESEND_PROVIDER_DAILY_LIMIT_LIKELY"
  | "VERIFICATION_RESEND_PROVIDER_MONTHLY_LIMIT_LIKELY"
  | "VERIFICATION_RESEND_PROVIDER_RATE_LIMITED"
  | "VERIFICATION_RESEND_PROVIDER_IDENTITY_UNVERIFIED"
  | "VERIFICATION_RESEND_PROVIDER_NETWORK_FAILURE"
  | "VERIFICATION_RESEND_PROVIDER_REJECTED"
  | "INVALID_JSON";

type ResendBackendCode = ResendGovernanceCode | ResendProviderErrorCode;

// ─── Governance snapshot types ────────────────────────────────────────────────

type VerificationResendScopeSnapshot = {
  maxAttempts: number;
  usedAttempts: number;
  remainingAttempts: number;
  resetAt: string;
};

type VerificationResendGovernanceSnapshot = {
  mode: "provider" | "disabled";
  allowed: boolean;
  governanceCode: ResendGovernanceCode;
  retryAfterSeconds: number | null;
  cooldownRemainingSeconds: number;
  nextAllowedAt: string | null;
  account: VerificationResendScopeSnapshot;
  ip: VerificationResendScopeSnapshot;
  hasAcceptedSend: boolean;
  lastAcceptedSendAt: string | null;
};

type ApiFailurePayload = {
  ok: false;
  error: {
    code: string;
    message: string;
  };
};

type ApiSuccessPayload<T> = {
  ok: true;
  data: T;
};

type ConfirmEmailResendStatusPayload = {
  governance: VerificationResendGovernanceSnapshot;
};

type ConfirmEmailResendActionPayload = {
  accepted: boolean;
  providerAccepted: boolean;
  governance: VerificationResendGovernanceSnapshot;
};

type ConfirmEmailFinalizePayload = {
  authCode: string | null;
  tokenHash: string | null;
  verificationType: string | null;
  errorCode: string | null;
  errorDescription: string | null;
  accessToken: string | null;
  refreshToken: string | null;
};

// ─── Utilities ────────────────────────────────────────────────────────────────

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function resolveReturnRoute(flow: ConfirmEmailFlow, fromRoute: string) {
  if (fromRoute === APP_ROUTES.adminLogin || flow === "admin") {
    return APP_ROUTES.adminLogin;
  }

  return APP_ROUTES.login;
}

function resolveConfirmationPurposeContent(
  flow: ConfirmEmailFlow,
  messages: AppMessages,
) {
  if (flow === "sign_up") {
    return {
      title: messages.confirmEmailPurposeSignupTitle,
      body: messages.confirmEmailPurposeSignupBody,
    };
  }

  if (flow === "admin") {
    return {
      title: messages.confirmEmailPurposeAdminTitle,
      body: messages.confirmEmailPurposeAdminBody,
    };
  }

  return {
    title: messages.confirmEmailPurposeSigninTitle,
    body: messages.confirmEmailPurposeSigninBody,
  };
}

function toOptionalString(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function normalizeVerificationType(value: string | null) {
  if (!value) {
    return null;
  }

  const token = value.trim().toLowerCase();

  if (
    token === "email"
    || token === "signup"
    || token === "magiclink"
    || token === "invite"
    || token === "recovery"
    || token === "email_change"
  ) {
    return token;
  }

  return null;
}

function isSupabaseEmailConfirmed(user: unknown) {
  if (!user || typeof user !== "object") {
    return false;
  }

  const userRecord = user as Record<string, unknown>;
  const confirmedAt =
    typeof userRecord.email_confirmed_at === "string"
      ? toOptionalString(userRecord.email_confirmed_at)
      : null;

  if (confirmedAt) {
    return true;
  }

  const explicitConfirmation =
    (typeof userRecord.email_confirmed === "boolean" ? userRecord.email_confirmed : null)
    ?? (typeof userRecord.email_verified === "boolean" ? userRecord.email_verified : null)
    ?? (typeof userRecord.emailVerified === "boolean" ? userRecord.emailVerified : null);

  return explicitConfirmation === true;
}

function readHashFinalizePayload(hash: string): ConfirmEmailFinalizePayload {
  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(normalizedHash);

  return {
    authCode: toOptionalString(params.get("code")),
    tokenHash: toOptionalString(params.get("token_hash")),
    verificationType: normalizeVerificationType(toOptionalString(params.get("type"))),
    errorCode: toOptionalString(params.get("error_code")) ?? toOptionalString(params.get("error")),
    errorDescription: toOptionalString(params.get("error_description")),
    accessToken: toOptionalString(params.get("access_token")),
    refreshToken: toOptionalString(params.get("refresh_token")),
  };
}

function mergeFinalizePayload(
  initialFinalize: ConfirmEmailFinalizeParams,
  hashPayload: ConfirmEmailFinalizePayload,
): ConfirmEmailFinalizePayload {
  return {
    authCode: toOptionalString(initialFinalize.authCode) ?? hashPayload.authCode,
    tokenHash: toOptionalString(initialFinalize.tokenHash) ?? hashPayload.tokenHash,
    verificationType:
      normalizeVerificationType(toOptionalString(initialFinalize.verificationType))
      ?? hashPayload.verificationType,
    errorCode: toOptionalString(initialFinalize.errorCode) ?? hashPayload.errorCode,
    errorDescription: toOptionalString(initialFinalize.errorDescription) ?? hashPayload.errorDescription,
    accessToken: toOptionalString(initialFinalize.accessToken) ?? hashPayload.accessToken,
    refreshToken: toOptionalString(initialFinalize.refreshToken) ?? hashPayload.refreshToken,
  };
}

function hasFinalizePayload(payload: ConfirmEmailFinalizePayload) {
  return Boolean(
    payload.errorCode
    || payload.authCode
    || (payload.tokenHash && payload.verificationType)
    || (payload.accessToken && payload.refreshToken),
  );
}

function cleanupConfirmationCallbackUrl() {
  const url = new URL(window.location.href);

  for (const key of CALLBACK_URL_SENSITIVE_PARAM_KEYS) {
    url.searchParams.delete(key);
  }

  const hashParams = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
  for (const key of CALLBACK_URL_SENSITIVE_PARAM_KEYS) {
    hashParams.delete(key);
  }

  const nextHash = hashParams.toString();
  const nextUrl = `${url.pathname}${url.search}${nextHash ? `#${nextHash}` : ""}`;
  window.history.replaceState({}, "", nextUrl);
}

// ─── Email confirmation finalization ─────────────────────────────────────────

async function finalizeEmailConfirmation(input: {
  supabase: SupabaseClient;
  payload: ConfirmEmailFinalizePayload;
}) {
  if (input.payload.errorCode) {
    throw createAuthFlowError(input.payload.errorCode, input.payload.errorDescription ?? undefined);
  }

  if (input.payload.tokenHash && input.payload.verificationType) {
    const { error } = await input.supabase.auth.verifyOtp({
      token_hash: input.payload.tokenHash,
      type: input.payload.verificationType as EmailOtpType,
    });

    if (error) {
      throw error;
    }

    return "token_hash" as const;
  }

  if (input.payload.authCode) {
    const { error } = await input.supabase.auth.exchangeCodeForSession(input.payload.authCode);

    if (error) {
      throw error;
    }

    return "auth_code" as const;
  }

  if (input.payload.accessToken && input.payload.refreshToken) {
    const { error } = await input.supabase.auth.setSession({
      access_token: input.payload.accessToken,
      refresh_token: input.payload.refreshToken,
    });

    if (error) {
      throw error;
    }

    return "session_tokens" as const;
  }

  throw createAuthFlowError(
    "AUTH_UNKNOWN_UPSTREAM_FAILURE",
    "Confirmation callback did not include required verification parameters.",
  );
}

function buildPostConfirmationRedirectUrl(input: {
  returnRoute: string;
  email: string;
  isSignupFlow: boolean;
}) {
  const params = new URLSearchParams();
  params.set("confirmed", "1");

  if (input.email.trim().length > 0) {
    params.set("email", input.email.trim());
  }

  if (input.isSignupFlow) {
    /* Preserve a lightweight onboarding marker so login can explain capacity waits
       as post-registration admission, not as account-creation failure. */
    params.set("onboarding", "signup");
  }

  return `${input.returnRoute}?${params.toString()}`;
}

// ─── Error mapping ────────────────────────────────────────────────────────────
//
// DESIGN RULE: every backend error code from /api/auth/confirm-email/resend
// must have an explicit branch here. No code should silently fall through to
// the generic handler when a more specific message exists. Keep this list in
// sync with the backend's error code registry whenever new codes are added.

function mapConfirmEmailFailure(
  failure: NormalizedAuthFailure,
  messages: AppMessages,
): AuthStatusDescriptor {
  const rawCode = (failure.rawCode ?? "").trim().toUpperCase() as ResendBackendCode | string;

  // ── Governance / rate-limit codes ──────────────────────────────────────────
  // These arrive both as POST 429 rejections and as error throws from the
  // GET governance poll when suppressStatus is false.

  if (rawCode === "VERIFICATION_RESEND_COOLDOWN_ACTIVE") {
    return {
      tone: "warning",
      icon: "warning",
      title: messages.confirmEmailRateLimitedTitle,
      body: messages.confirmEmailRateLimitedBody,
    };
  }

  if (rawCode === "VERIFICATION_RESEND_ACCOUNT_WINDOW_EXHAUSTED") {
    return {
      tone: "warning",
      icon: "warning",
      title: messages.confirmEmailRateLimitedTitle,
      body: messages.confirmEmailRateLimitedAccountBody,
    };
  }

  if (rawCode === "VERIFICATION_RESEND_IP_WINDOW_EXHAUSTED") {
    return {
      tone: "warning",
      icon: "warning",
      title: messages.confirmEmailRateLimitedTitle,
      body: messages.confirmEmailRateLimitedIpBody,
    };
  }

  if (rawCode === "VERIFICATION_RESEND_UNAVAILABLE") {
    return {
      tone: "danger",
      icon: "config",
      title: messages.confirmEmailStatusServerTitle,
      body: messages.confirmEmailStatusServerBody,
      live: "assertive",
    };
  }

  // ── Input validation codes ─────────────────────────────────────────────────
  // VERIFICATION_RESEND_INVALID_EMAIL surfaces when the GET poll fires before
  // the email field is valid, or when the POST body is malformed.
  // Show the email-validation message rather than a scary generic error.

  if (rawCode === "VERIFICATION_RESEND_INVALID_EMAIL" || rawCode === "INVALID_JSON") {
    return {
      tone: "warning",
      icon: "warning",
      title: messages.confirmEmailInvalidEmailTitle,
      body: messages.confirmEmailInvalidEmailBody,
    };
  }

  // ── Provider quota codes ───────────────────────────────────────────────────
  // Daily / monthly quota exhaustion is a server-side condition the user cannot
  // resolve. Frame it as a temporary service issue so they don't keep retrying.

  if (
    rawCode === "VERIFICATION_RESEND_PROVIDER_DAILY_LIMIT_LIKELY"
    || rawCode === "VERIFICATION_RESEND_PROVIDER_MONTHLY_LIMIT_LIKELY"
  ) {
    return {
      tone: "warning",
      icon: "warning",
      title: messages.confirmEmailStatusServerTitle,
      body: messages.confirmEmailRateLimitedBody,
    };
  }

  // ── Provider rate limiting ─────────────────────────────────────────────────
  // Temporary provider-side throttle — retry in a moment.

  if (rawCode === "VERIFICATION_RESEND_PROVIDER_RATE_LIMITED") {
    return {
      tone: "warning",
      icon: "warning",
      title: messages.confirmEmailRateLimitedTitle,
      body: messages.confirmEmailRateLimitedBody,
    };
  }

  // ── Provider configuration / identity codes ────────────────────────────────
  // Sender identity not verified — admin needs to fix this, not the user.

  if (rawCode === "VERIFICATION_RESEND_PROVIDER_IDENTITY_UNVERIFIED") {
    return {
      tone: "danger",
      icon: "config",
      title: messages.confirmEmailStatusServerTitle,
      body: messages.confirmEmailStatusServerBody,
      live: "assertive",
    };
  }

  // ── Provider network / connectivity codes ──────────────────────────────────
  // Upstream network issue — transient, user can retry.

  if (rawCode === "VERIFICATION_RESEND_PROVIDER_NETWORK_FAILURE") {
    return {
      tone: "danger",
      icon: "danger",
      title: messages.confirmEmailNetworkTitle,
      body: messages.confirmEmailNetworkBody,
      live: "assertive",
    };
  }

  // ── Provider generic rejection ─────────────────────────────────────────────
  // Provider accepted the request shape but rejected delivery for unknown reason.

  if (rawCode === "VERIFICATION_RESEND_PROVIDER_REJECTED") {
    return {
      tone: "danger",
      icon: "danger",
      title: messages.confirmEmailGenericErrorTitle,
      body: messages.confirmEmailGenericErrorBody,
      live: "assertive",
    };
  }

  // ── OTP / token lifecycle codes (from finalization path) ───────────────────

  if (
    rawCode === "OTP_EXPIRED"
    || rawCode === "FLOW_STATE_EXPIRED"
    || rawCode === "FLOW_STATE_NOT_FOUND"
  ) {
    return {
      tone: "warning",
      icon: "warning",
      title: messages.confirmEmailLinkExpiredTitle,
      body: messages.confirmEmailLinkExpiredBody,
    };
  }

  if (
    rawCode === "BAD_CODE_VERIFIER"
    || rawCode === "BAD_OTP"
    || rawCode === "VALIDATION_FAILED"
    || rawCode === "BAD_JWT"
  ) {
    return {
      tone: "warning",
      icon: "warning",
      title: messages.confirmEmailInvalidLinkTitle,
      body: messages.confirmEmailInvalidLinkBody,
    };
  }

  // ── Normalized failure codes (catch-all for cross-cutting concerns) ─────────
  // These handle codes that arrive from the auth-failure normalizer regardless
  // of which specific backend code triggered them.

  switch (failure.normalizedCode) {
    case "AUTH_EMAIL_NOT_CONFIRMED":
      return {
        tone: "warning",
        icon: "warning",
        title: messages.confirmEmailInvalidLinkTitle,
        body: messages.confirmEmailInvalidLinkBody,
      };
    case "AUTH_NETWORK_FAILURE":
      return {
        tone: "danger",
        icon: "danger",
        title: messages.confirmEmailNetworkTitle,
        body: messages.confirmEmailNetworkBody,
        live: "assertive",
      };
    case "AUTH_RATE_LIMITED":
      return {
        tone: "warning",
        icon: "warning",
        title: messages.confirmEmailRateLimitedTitle,
        body: messages.confirmEmailRateLimitedBody,
      };
    case "AUTH_ENV_MISCONFIGURED":
    case "AUTH_PROVIDER_MISCONFIGURED":
      return {
        tone: "danger",
        icon: "config",
        title: messages.confirmEmailStatusServerTitle,
        body: messages.confirmEmailStatusServerBody,
        live: "assertive",
      };
    default:
      return {
        tone: "danger",
        icon: "danger",
        title: messages.confirmEmailGenericErrorTitle,
        body: messages.confirmEmailGenericErrorBody,
        live: "assertive",
      };
  }
}

// ─── Governance snapshot → UI status ─────────────────────────────────────────
//
// Maps the governance snapshot that comes back on every GET poll or POST
// response into a UI status descriptor. Kept consistent with mapConfirmEmailFailure
// so the same code always produces the same tone/icon regardless of which path
// it arrives through.

function mapGovernanceSnapshotToStatus(
  governance: VerificationResendGovernanceSnapshot | null,
  messages: AppMessages,
): AuthStatusDescriptor | null {
  if (!governance || governance.allowed) {
    return null;
  }

  switch (governance.governanceCode) {
    case "VERIFICATION_RESEND_COOLDOWN_ACTIVE":
      return {
        tone: "warning",
        icon: "warning",
        title: messages.confirmEmailRateLimitedTitle,
        body: messages.confirmEmailRateLimitedBody,
      };
    case "VERIFICATION_RESEND_ACCOUNT_WINDOW_EXHAUSTED":
      return {
        tone: "warning",
        icon: "warning",
        title: messages.confirmEmailRateLimitedTitle,
        body: messages.confirmEmailRateLimitedAccountBody,
      };
    case "VERIFICATION_RESEND_IP_WINDOW_EXHAUSTED":
      return {
        tone: "warning",
        icon: "warning",
        title: messages.confirmEmailRateLimitedTitle,
        body: messages.confirmEmailRateLimitedIpBody,
      };
    case "VERIFICATION_RESEND_UNAVAILABLE":
      return {
        tone: "danger",
        icon: "config",
        title: messages.confirmEmailStatusServerTitle,
        body: messages.confirmEmailStatusServerBody,
        live: "assertive",
      };
    default:
      return null;
  }
}

// ─── API helpers ──────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readApiPayload<T>(value: unknown): ApiFailurePayload | ApiSuccessPayload<T> | null {
  if (!isRecord(value) || typeof value.ok !== "boolean") {
    return null;
  }

  if (value.ok === true && "data" in value) {
    return value as ApiSuccessPayload<T>;
  }

  if (value.ok === false && isRecord(value.error)) {
    const code = typeof value.error.code === "string"
      ? value.error.code
      : "AUTH_UNKNOWN_UPSTREAM_FAILURE";
    const message = typeof value.error.message === "string"
      ? value.error.message
      : "Request failed.";

    return {
      ok: false,
      error: { code, message },
    };
  }

  return null;
}

function readGovernanceSnapshot(value: unknown): VerificationResendGovernanceSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }

  if (!isRecord(value.account) || !isRecord(value.ip)) {
    return null;
  }

  if (typeof value.governanceCode !== "string" || typeof value.allowed !== "boolean") {
    return null;
  }

  return value as unknown as VerificationResendGovernanceSnapshot;
}

// ─── Network calls ────────────────────────────────────────────────────────────

async function readResendGovernanceSnapshot(email: string) {
  const url = new URL(CONFIRM_EMAIL_RESEND_API_ROUTE, window.location.origin);
  url.searchParams.set("email", email);

  const response = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store",
  });

  const payload = readApiPayload<ConfirmEmailResendStatusPayload>(
    await response.json().catch(() => null),
  );

  if (!payload) {
    throw createAuthFlowError(
      "AUTH_UNKNOWN_UPSTREAM_FAILURE",
      "Verification governance status returned an invalid response.",
    );
  }

  if (payload.ok === false) {
    throw createAuthFlowError(payload.error.code, payload.error.message);
  }

  if (!response.ok) {
    throw createAuthFlowError(
      "AUTH_UNKNOWN_UPSTREAM_FAILURE",
      "Verification governance status request failed.",
    );
  }

  const governance = readGovernanceSnapshot(payload.data.governance);
  if (!governance) {
    throw createAuthFlowError(
      "AUTH_UNKNOWN_UPSTREAM_FAILURE",
      "Verification governance payload was malformed.",
    );
  }

  return governance;
}

async function submitVerificationResend(input: {
  email: string;
  flow: ConfirmEmailFlow;
  fromRoute: string;
}) {
  const response = await fetch(CONFIRM_EMAIL_RESEND_API_ROUTE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({
      email: input.email,
      flow: input.flow,
      fromRoute: input.fromRoute,
    }),
  });

  const payload = readApiPayload<ConfirmEmailResendActionPayload>(
    await response.json().catch(() => null),
  );

  if (!payload) {
    throw createAuthFlowError(
      "AUTH_UNKNOWN_UPSTREAM_FAILURE",
      "Verification resend returned an invalid response.",
    );
  }

  if (payload.ok === false) {
    throw createAuthFlowError(payload.error.code, payload.error.message);
  }

  if (!response.ok) {
    throw createAuthFlowError(
      "AUTH_UNKNOWN_UPSTREAM_FAILURE",
      "Verification resend request failed.",
    );
  }

  const governance = readGovernanceSnapshot(payload.data.governance);
  if (!governance) {
    throw createAuthFlowError(
      "AUTH_UNKNOWN_UPSTREAM_FAILURE",
      "Verification resend governance payload was malformed.",
    );
  }

  return {
    accepted: payload.data.accepted,
    providerAccepted: payload.data.providerAccepted,
    governance,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ConfirmEmailPanel({
  messages,
  supabaseAuthReady,
  initialEmail,
  flow,
  fromRoute,
  initialFinalize,
}: ConfirmEmailPanelProps) {
  const router = useRouter();
  const [email, setEmail] = useState(initialEmail);
  const [status, setStatus] = useState<AuthStatusDescriptor | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [governance, setGovernance] = useState<VerificationResendGovernanceSnapshot | null>(null);
  const [isGovernanceLoading, setIsGovernanceLoading] = useState(false);
  /* Confirm-email CTA truth is driven by server governance state (`hasAcceptedSend`)
     plus current-page successful sends. This keeps "Send email" vs "Resend email"
     aligned with real lifecycle state instead of static copy. */
  const [hasAcceptedSendOnPage, setHasAcceptedSendOnPage] = useState(false);
  const [governancePrimedEmail, setGovernancePrimedEmail] = useState<string | null>(null);
  const governanceRequestTokenRef = useRef(0);
  const previousCooldownRef = useRef(0);
  const submitInFlightRef = useRef(false);
  const finalizationStartedRef = useRef(false);
  const redirectStartedRef = useRef(false);
  const supabaseConfigured = isSupabaseWebConfigured();

  const returnRoute = useMemo(() => resolveReturnRoute(flow, fromRoute), [flow, fromRoute]);
  const flowKind = flow === "admin" ? "admin" : "user";
  const purposeContent = useMemo(
    () => resolveConfirmationPurposeContent(flow, messages),
    [flow, messages],
  );

  const syncGovernanceState = useCallback(async (
    targetEmail: string,
    options?: { suppressStatus?: boolean },
  ) => {
    const requestToken = ++governanceRequestTokenRef.current;
    setIsGovernanceLoading(true);

    try {
      const nextGovernance = await readResendGovernanceSnapshot(targetEmail);
      if (requestToken !== governanceRequestTokenRef.current) {
        return null;
      }

      setGovernance(nextGovernance);
      setCooldownSeconds(nextGovernance.cooldownRemainingSeconds);
      if (nextGovernance.hasAcceptedSend) {
        setHasAcceptedSendOnPage(true);
      }
      return nextGovernance;
    } catch (nextError) {
      if (requestToken !== governanceRequestTokenRef.current) {
        return null;
      }

      // Background polls always suppress status so they never flash an error
      // banner while the user is typing or waiting for a cooldown to expire.
      if (options?.suppressStatus) {
        return null;
      }

      const failure = normalizeAuthFailure({
        error: nextError,
        flow: flowKind,
        stage: "AUTH_STAGE_C_PROVIDER_RESPONSE",
        routePath: APP_ROUTES.confirmEmail,
        sessionCreationAttempted: false,
      });

      logAuthDiagnosis({
        failure,
        uxAction: "show_error",
      });

      // All backend codes now have explicit mappings — no silent fallthrough.
      setStatus(mapConfirmEmailFailure(failure, messages));
      return null;
    } finally {
      if (requestToken === governanceRequestTokenRef.current) {
        setIsGovernanceLoading(false);
      }
    }
  }, [flowKind, messages]);

  useEffect(() => {
    if (!supabaseConfigured) {
      return;
    }

    void primeEphemeralSupabaseClient().catch(() => {
      // Keep retry logic in submit path so users receive explicit runtime diagnostics.
    });
  }, [supabaseConfigured]);

  useEffect(() => {
    if (!supabaseConfigured || finalizationStartedRef.current) {
      return;
    }

    const finalizePayload = mergeFinalizePayload(
      initialFinalize,
      readHashFinalizePayload(window.location.hash),
    );

    if (!hasFinalizePayload(finalizePayload)) {
      return;
    }

    finalizationStartedRef.current = true;
    setIsFinalizing(true);
    setStatus({
      tone: "info",
      icon: "working",
      title: messages.confirmEmailFinalizingTitle,
      body: messages.confirmEmailFinalizingBody,
    });

    void (async () => {
      let callbackKind: "token_hash" | "auth_code" | "session_tokens" | null = null;
      let supabase: SupabaseClient | null = null;

      try {
        supabase = await getEphemeralSupabaseClient();
        callbackKind = await finalizeEmailConfirmation({
          supabase,
          payload: finalizePayload,
        });

        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          throw sessionError;
        }

        const idToken = sessionData.session?.access_token?.trim();
        if (!idToken) {
          throw createAuthFlowError(
            "AUTH_SESSION_CREATION_FAILED",
            "Supabase confirmation callback did not produce a session token.",
          );
        }

        const { data: confirmedUserData, error: confirmedUserError } = await supabase.auth.getUser(idToken);
        if (confirmedUserError) {
          throw confirmedUserError;
        }

        /* Callback token exchange alone is not sufficient for success UI.
           Only continue when Supabase user state confirms email verification. */
        if (!isSupabaseEmailConfirmed(confirmedUserData.user)) {
          throw createAuthFlowError(
            "AUTH_EMAIL_NOT_CONFIRMED",
            "Supabase still reports this account email as unconfirmed.",
          );
        }

        /* Confirm-email belongs to the verification lane only.
           After Supabase confirms this exact account, clean up the helper session and
           return users to the correct login page so Auth.js remains the only trust
           boundary for entering protected routes. */
        await supabase.auth.signOut({ scope: "local" }).catch(() => {
          // Best-effort helper-session cleanup only.
        });

        console.info("[auth-confirmation]", {
          routePath: APP_ROUTES.confirmEmail,
          flow: flowKind,
          callbackKind,
          redirectTo: returnRoute,
          finalized: true,
        });

        redirectStartedRef.current = true;
        cleanupConfirmationCallbackUrl();

        setStatus({
          tone: "success",
          icon: "success",
          title: messages.confirmEmailConfirmedTitle,
          body: messages.confirmEmailConfirmedBody,
        });

        setIsFinalizing(false);
        router.replace(buildPostConfirmationRedirectUrl({
          returnRoute,
          email,
          isSignupFlow: flow === "sign_up",
        }));
        router.refresh();
      } catch (nextError) {
        const failure = normalizeAuthFailure({
          error: nextError,
          flow: flowKind,
          stage: "AUTH_STAGE_C_PROVIDER_RESPONSE",
          routePath: APP_ROUTES.confirmEmail,
          sessionCreationAttempted: false,
        });

        logAuthDiagnosis({
          failure,
          uxAction: "show_error",
        });

        console.warn("[auth-confirmation]", {
          routePath: APP_ROUTES.confirmEmail,
          flow: flowKind,
          callbackKind,
          finalized: false,
          normalizedCode: failure.normalizedCode,
          rawCode: failure.rawCode,
        });

        setStatus(mapConfirmEmailFailure(failure, messages));
      } finally {
        if (supabase && !redirectStartedRef.current) {
          await supabase.auth.signOut({ scope: "local" }).catch(() => {
            // Best-effort cleanup; Auth.js state remains authoritative.
          });
        }

        if (!redirectStartedRef.current) {
          cleanupConfirmationCallbackUrl();
          setIsFinalizing(false);
        }
      }
    })();
  }, [email, flow, flowKind, initialFinalize, messages, returnRoute, router, supabaseConfigured]);

  const normalizedEmail = email.trim().toLowerCase();
  const hasValidEmail = isValidEmail(normalizedEmail);

  useEffect(() => {
    if (!supabaseConfigured || !supabaseAuthReady || !hasValidEmail) {
      setGovernance(null);
      setCooldownSeconds(0);
      setHasAcceptedSendOnPage(false);
      setGovernancePrimedEmail(null);
      setIsGovernanceLoading(false);
      return;
    }

    let cancelled = false;
    setGovernancePrimedEmail(null);

    const timerId = window.setTimeout(() => {
      void syncGovernanceState(normalizedEmail, { suppressStatus: true })
        .finally(() => {
          if (!cancelled) {
            setGovernancePrimedEmail(normalizedEmail);
          }
        });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [
    hasValidEmail,
    normalizedEmail,
    supabaseAuthReady,
    supabaseConfigured,
    syncGovernanceState,
  ]);

  useEffect(() => {
    if (cooldownSeconds <= 0) {
      return;
    }

    const timerId = window.setInterval(() => {
      setCooldownSeconds((value) => (value <= 1 ? 0 : value - 1));
    }, 1_000);

    return () => {
      window.clearInterval(timerId);
    };
  }, [cooldownSeconds]);

  useEffect(() => {
    if (
      previousCooldownRef.current > 0
      && cooldownSeconds === 0
      && hasValidEmail
      && supabaseConfigured
      && supabaseAuthReady
    ) {
      void syncGovernanceState(normalizedEmail, { suppressStatus: true });
    }

    previousCooldownRef.current = cooldownSeconds;
  }, [
    cooldownSeconds,
    hasValidEmail,
    normalizedEmail,
    supabaseAuthReady,
    supabaseConfigured,
    syncGovernanceState,
  ]);

  const governanceStatus = status
    ? null
    : mapGovernanceSnapshotToStatus(governance, messages);

  const isGovernanceBlocked = Boolean(governance && !governance.allowed);
  const isCooldownActive = cooldownSeconds > 0;
  const hasServerAcceptedSend = governance?.hasAcceptedSend === true;
  const hasSentEmailForCurrentFlow = hasAcceptedSendOnPage || hasServerAcceptedSend;
  const isGovernancePriming =
    supabaseConfigured
    && supabaseAuthReady
    && hasValidEmail
    && governancePrimedEmail !== normalizedEmail;

  const disabled =
    !supabaseConfigured
    || !supabaseAuthReady
    || isSending
    || isFinalizing
    || isGovernanceLoading
    || isGovernancePriming
    || isGovernanceBlocked
    || isCooldownActive
    || !hasValidEmail;

  const blockingStatus =
    status
      ? null
      : !supabaseConfigured
        ? {
            tone: "warning" as const,
            icon: "config" as const,
            title: messages.confirmEmailStatusConfigTitle,
            body: messages.confirmEmailStatusConfigBody,
            live: "off" as const,
          }
        : !supabaseAuthReady
          ? {
              tone: "warning" as const,
              icon: "config" as const,
              title: messages.confirmEmailStatusServerTitle,
              body: messages.confirmEmailStatusServerBody,
              live: "off" as const,
            }
          : null;

  const idleStatus: AuthStatusDescriptor = {
    tone: "neutral",
    icon: "info",
    title: hasSentEmailForCurrentFlow
      ? messages.confirmEmailAutoSentTitle
      : messages.confirmEmailIdleTitle,
    body: hasSentEmailForCurrentFlow
      ? messages.confirmEmailAutoSentBody
      : messages.confirmEmailIdleBody,
    live: "off",
  };

  const visibleStatus = status ?? governanceStatus ?? blockingStatus ?? idleStatus;

  const resendLabel =
    isFinalizing
      ? messages.confirmEmailFinalizingButton
      : isSending || isGovernanceLoading || isGovernancePriming
        ? messages.confirmEmailResendWorking
        : governance?.governanceCode === "VERIFICATION_RESEND_COOLDOWN_ACTIVE" && cooldownSeconds > 0
          ? `${messages.confirmEmailResendCooldownPrefix} ${cooldownSeconds}s`
          : hasSentEmailForCurrentFlow
            ? messages.confirmEmailResendAction
            : messages.confirmEmailSendAction;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitInFlightRef.current) {
      return;
    }

    if (disabled) {
      if (!hasValidEmail) {
        setStatus({
          tone: "warning",
          icon: "warning",
          title: messages.confirmEmailInvalidEmailTitle,
          body: messages.confirmEmailInvalidEmailBody,
        });
      } else if (isGovernanceBlocked && governance) {
        setStatus(
          mapGovernanceSnapshotToStatus(governance, messages) ?? {
            tone: "warning",
            icon: "warning",
            title: messages.confirmEmailRateLimitedTitle,
            body: messages.confirmEmailRateLimitedBody,
          },
        );
      } else if (isGovernancePriming) {
        setStatus({
          tone: "info",
          icon: "working",
          title: messages.confirmEmailWorkingTitle,
          body: messages.confirmEmailWorkingBody,
        });
      }
      return;
    }

    // Always refresh governance before submit — catches null state (initial load race),
    // stale snapshots from prior navigation, and cooldowns that expired between polls.
    const freshGovernance = await syncGovernanceState(normalizedEmail, {
      suppressStatus: false,
    });
    setGovernancePrimedEmail(normalizedEmail);

    const effectiveGovernance = freshGovernance ?? governance;

    if (!effectiveGovernance || !effectiveGovernance.allowed) {
      setStatus(
        effectiveGovernance
          ? (mapGovernanceSnapshotToStatus(effectiveGovernance, messages) ?? {
              tone: "warning" as const,
              icon: "warning" as const,
              title: messages.confirmEmailRateLimitedTitle,
              body: messages.confirmEmailRateLimitedBody,
            })
          : {
              tone: "warning" as const,
              icon: "warning" as const,
              title: messages.confirmEmailGenericErrorTitle,
              body: messages.confirmEmailGenericErrorBody,
            },
      );
      return;
    }

    submitInFlightRef.current = true;
    setIsSending(true);
    setStatus({
      tone: "info",
      icon: "working",
      title: messages.confirmEmailWorkingTitle,
      body: messages.confirmEmailWorkingBody,
    });

    try {
      const hadAcceptedSendBeforeSubmit = hasSentEmailForCurrentFlow;
      const resendResult = await submitVerificationResend({
        email: normalizedEmail,
        flow,
        fromRoute: returnRoute,
      });

      // Keep governance/cooldown truth anchored to backend snapshots.
      // CTA copy state flips separately only after this page gets an accepted send.
      setGovernance(resendResult.governance);
      setCooldownSeconds(resendResult.governance.cooldownRemainingSeconds);

      if (!resendResult.accepted || !resendResult.providerAccepted) {
        throw createAuthFlowError(
          "VERIFICATION_RESEND_PROVIDER_REJECTED",
          "Verification provider did not accept this resend request.",
        );
      }

      setHasAcceptedSendOnPage(true);

      setStatus({
        tone: "success",
        icon: "success",
        title: hadAcceptedSendBeforeSubmit
          ? messages.confirmEmailResentTitle
          : messages.confirmEmailSentTitle,
        body: hadAcceptedSendBeforeSubmit
          ? messages.confirmEmailResentBody
          : messages.confirmEmailSentBody,
      });
    } catch (nextError) {
      const failure = normalizeAuthFailure({
        error: nextError,
        flow: flowKind,
        stage: "AUTH_STAGE_C_PROVIDER_RESPONSE",
        routePath: APP_ROUTES.confirmEmail,
        sessionCreationAttempted: false,
      });

      logAuthDiagnosis({
        failure,
        uxAction: "show_error",
      });

      setStatus(mapConfirmEmailFailure(failure, messages));
    } finally {
      setIsSending(false);
      submitInFlightRef.current = false;

      if (hasValidEmail && supabaseConfigured && supabaseAuthReady) {
        void syncGovernanceState(normalizedEmail, { suppressStatus: true });
      }
    }
  }

  return (
    <div className="relative mx-auto flex w-full max-w-[480px] flex-col gap-3 animate-in fade-in zoom-in-95 duration-700">
      <div className="relative isolate overflow-hidden rounded-[2rem] border border-border bg-background-elevated/90 p-5 shadow-2xl shadow-black/16 backdrop-blur-2xl sm:p-6">
        <div className="relative z-10 flex flex-col gap-4">
          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3">
            {/* This page-level purpose block explains why confirmation exists for this
               specific auth lane (signup vs sign-in recovery vs admin lane). Keep this
               explicit so users do not confuse lifecycle verification with credential failure. */}
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">
              {purposeContent.title}
            </p>
            <p className="mt-1 text-sm text-foreground">
              {purposeContent.body}
            </p>
          </div>

          {/* Keep confirmation UX explicit and recovery-focused so unverified accounts are not misdiagnosed as session refresh failures. */}
          <AuthStatus status={visibleStatus} />

          <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
            <label className="flex flex-col gap-2">
              <span className="ms-1 text-[11px] font-bold uppercase tracking-[0.18em] text-foreground-muted">
                {messages.confirmEmailEmailLabel}
              </span>
              <input
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setGovernance(null);
                  setCooldownSeconds(0);
                  setHasAcceptedSendOnPage(false);
                  if (!isSending && !isFinalizing) {
                    setStatus(null);
                  }
                }}
                placeholder={messages.confirmEmailEmailPlaceholder}
                autoComplete="email"
                disabled={isSending || isFinalizing}
                className="w-full rounded-2xl border border-border bg-background px-4 py-3.5 text-sm font-medium text-foreground shadow-[0_12px_30px_rgba(15,23,42,0.05)] transition-all focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 placeholder:text-foreground-muted/80"
              />
            </label>

            <button
              type="submit"
              disabled={disabled}
              aria-busy={isSending || isFinalizing || isGovernanceLoading || isGovernancePriming}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3.5 font-bold text-white shadow-[0_14px_30px_rgba(5,150,105,0.25)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_34px_rgba(5,150,105,0.32)] active:scale-[0.98] disabled:opacity-50"
            >
              <span>{resendLabel}</span>
              {isSending || isFinalizing
                ? <LoaderCircle className="h-5 w-5 animate-spin text-white" aria-hidden="true" />
                : null}
            </button>
          </form>

          <div className="flex items-center justify-start border-t border-border pt-3">
            <Link
              href={returnRoute}
              className="inline-flex items-center gap-2 text-sm font-medium text-foreground-muted transition-colors hover:text-emerald-600"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>
                {returnRoute === APP_ROUTES.adminLogin
                  ? messages.confirmEmailBackToAdmin
                  : messages.confirmEmailBackToLogin}
              </span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
