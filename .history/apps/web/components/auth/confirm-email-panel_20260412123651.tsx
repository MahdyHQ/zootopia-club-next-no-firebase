"use client";

import { APP_ROUTES } from "@zootopia/shared-config";
import type { ApiResult, SessionUser } from "@zootopia/shared-types";
import type { EmailOtpType, SupabaseClient } from "@supabase/supabase-js";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AuthStatus } from "@/components/auth/auth-status";
import {
  createAuthFlowError,
  type AuthStatusDescriptor,
} from "@/components/auth/auth-feedback";
import { readCredentialsSignInErrorCode } from "@/components/auth/signin-result";
import {
  logAuthDiagnosis,
  normalizeAuthFailure,
  type NormalizedAuthFailure,
} from "@/lib/auth-failure";
import type { AppMessages } from "@/lib/messages";
import { resolveAuthenticatedUserRedirectPath } from "@/lib/return-to";
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
const SESSION_BOOTSTRAP_MAX_ATTEMPTS = 40;
const SESSION_BOOTSTRAP_RETRY_MS = 200;
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

type VerificationResendGovernanceCode =
  | "VERIFICATION_RESEND_READY"
  | "VERIFICATION_RESEND_COOLDOWN_ACTIVE"
  | "VERIFICATION_RESEND_ACCOUNT_WINDOW_EXHAUSTED"
  | "VERIFICATION_RESEND_IP_WINDOW_EXHAUSTED"
  | "VERIFICATION_RESEND_UNAVAILABLE";

type VerificationResendScopeSnapshot = {
  maxAttempts: number;
  usedAttempts: number;
  remainingAttempts: number;
  resetAt: string;
};

type VerificationResendGovernanceSnapshot = {
  mode: "provider" | "disabled";
  allowed: boolean;
  governanceCode: VerificationResendGovernanceCode;
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

type AuthBootstrapProviderId = "user-credentials" | "admin-credentials";

async function readApiResult<T>(response: Response, invalidCode: string) {
  try {
    return (await response.json()) as ApiResult<T>;
  } catch {
    throw createAuthFlowError(invalidCode);
  }
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function resolveReturnRoute(flow: ConfirmEmailFlow, fromRoute: string) {
  if (fromRoute === APP_ROUTES.adminLogin || flow === "admin") {
    return APP_ROUTES.adminLogin;
  }

  return APP_ROUTES.login;
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

function resolveAuthBootstrapProvider(input: {
  flow: ConfirmEmailFlow;
  fromRoute: string;
}): AuthBootstrapProviderId {
  if (input.flow === "admin" || input.fromRoute === APP_ROUTES.adminLogin) {
    return "admin-credentials";
  }

  return "user-credentials";
}

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

async function bootstrapAuthenticatedSession(input: {
  providerId: AuthBootstrapProviderId;
  idToken: string;
}) {
  const signInResult = await signIn(input.providerId, {
    redirect: false,
    idToken: input.idToken,
  });

  if (!signInResult) {
    throw createAuthFlowError("AUTH_SESSION_CREATION_FAILED", "Missing Auth.js response.");
  }

  if (signInResult.error) {
    throw createAuthFlowError(
      readCredentialsSignInErrorCode(signInResult) || "AUTH_SESSION_CREATION_FAILED",
      signInResult.error,
    );
  }

  if (!signInResult.ok) {
    throw createAuthFlowError(
      "AUTH_SESSION_CREATION_FAILED",
      "Unable to establish authenticated session after email confirmation.",
    );
  }

  let lastBootstrapCode: string | null = null;

  for (let attempt = 0; attempt < SESSION_BOOTSTRAP_MAX_ATTEMPTS; attempt += 1) {
    const meResponse = await fetch("/api/auth/me", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });

    const mePayload = await readApiResult<{
      session: {
        authenticated: boolean;
        user: SessionUser | null;
      };
    }>(meResponse, "BOOTSTRAP_RESPONSE_INVALID");

    if (meResponse.ok && mePayload.ok && mePayload.data.session.authenticated && mePayload.data.session.user) {
      if (input.providerId === "admin-credentials" && mePayload.data.session.user.role !== "admin") {
        throw createAuthFlowError(
          "ADMIN_ACCOUNT_UNAUTHORIZED",
          "This account is not authorized for admin access.",
        );
      }

      return mePayload.data.session.user;
    }

    const responseErrorCode = mePayload.ok ? null : mePayload.error.code;
    lastBootstrapCode = responseErrorCode;

    const hasAttemptsRemaining = attempt + 1 < SESSION_BOOTSTRAP_MAX_ATTEMPTS;
    const isTransientBootstrapState =
      responseErrorCode === null
      || responseErrorCode === "SESSION_NOT_ESTABLISHED"
      || (meResponse.status >= 500 && meResponse.status < 600);

    if (!isTransientBootstrapState) {
      throw createAuthFlowError(
        responseErrorCode || "AUTH_SESSION_CREATION_FAILED",
        mePayload.ok ? undefined : mePayload.error.message,
      );
    }

    if (hasAttemptsRemaining) {
      await new Promise((resolve) => window.setTimeout(resolve, SESSION_BOOTSTRAP_RETRY_MS));
      continue;
    }
  }

  throw createAuthFlowError(
    lastBootstrapCode || "AUTH_SESSION_REFRESH_REQUIRED",
    "Session cookie was not observed after confirmation bootstrap.",
  );
}

function mapConfirmEmailFailure(
  failure: NormalizedAuthFailure,
  messages: AppMessages,
): AuthStatusDescriptor {
  const rawCode = (failure.rawCode ?? "").trim().toUpperCase();

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

  switch (failure.normalizedCode) {
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
    const code = typeof value.error.code === "string" ? value.error.code : "AUTH_UNKNOWN_UPSTREAM_FAILURE";
    const message = typeof value.error.message === "string"
      ? value.error.message
      : "Request failed.";

    return {
      ok: false,
      error: {
        code,
        message,
      },
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
  const [hasAcceptedSend, setHasAcceptedSend] = useState(false);
  const governanceRequestTokenRef = useRef(0);
  const previousCooldownRef = useRef(0);
  const finalizationStartedRef = useRef(false);
  const redirectStartedRef = useRef(false);
  const supabaseConfigured = isSupabaseWebConfigured();

  const returnRoute = useMemo(() => resolveReturnRoute(flow, fromRoute), [flow, fromRoute]);
  const authBootstrapProviderId = useMemo(() => resolveAuthBootstrapProvider({
    flow,
    fromRoute,
  }), [flow, fromRoute]);
  const flowKind = flow === "admin" ? "admin" : "user";

  const syncGovernanceState = useCallback(async (
    targetEmail: string,
    options?: { suppressStatus?: boolean },
  ) => {
    const requestToken = ++governanceRequestTokenRef.current;
    setIsGovernanceLoading(true);

    try {
      const nextGovernance = await readResendGovernanceSnapshot(targetEmail);
      if (requestToken !== governanceRequestTokenRef.current) {
        return;
      }

      setGovernance(nextGovernance);
      setCooldownSeconds(nextGovernance.cooldownRemainingSeconds);
      setHasAcceptedSend(nextGovernance.hasAcceptedSend);
    } catch (nextError) {
      if (requestToken !== governanceRequestTokenRef.current) {
        return;
      }

      if (options?.suppressStatus) {
        return;
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

      setStatus(mapConfirmEmailFailure(failure, messages));
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

        const sessionUser = await bootstrapAuthenticatedSession({
          providerId: authBootstrapProviderId,
          idToken,
        });

        const redirectDecision = resolveAuthenticatedUserRedirectPath({
          role: sessionUser.role,
          profileCompleted: sessionUser.profileCompleted,
        });

        // Confirm-email callback can create a temporary Supabase browser session.
        // Auth.js remains the single app-session authority, so clear provider session
        // right before client handoff after Auth.js cookie bootstrap succeeds.
        await supabase.auth.signOut({ scope: "local" });

        console.info("[auth-confirmation]", {
          routePath: APP_ROUTES.confirmEmail,
          flow: flowKind,
          providerId: authBootstrapProviderId,
          callbackKind,
          role: sessionUser.role,
          profileCompleted: sessionUser.profileCompleted,
          redirectTo: redirectDecision.path,
          redirectReason: redirectDecision.reason,
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
        router.replace(redirectDecision.path);
        router.refresh();
      } catch (nextError) {
        const failureStage = callbackKind
          ? "AUTH_STAGE_E_SESSION_HYDRATION"
          : "AUTH_STAGE_C_PROVIDER_RESPONSE";
        const failure = normalizeAuthFailure({
          error: nextError,
          flow: flowKind,
          stage: failureStage,
          routePath: APP_ROUTES.confirmEmail,
          sessionCreationAttempted: Boolean(callbackKind),
        });

        logAuthDiagnosis({
          failure,
          uxAction: "show_error",
        });

        console.warn("[auth-confirmation]", {
          routePath: APP_ROUTES.confirmEmail,
          flow: flowKind,
          providerId: authBootstrapProviderId,
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
  }, [authBootstrapProviderId, flowKind, initialFinalize, messages, router, supabaseConfigured]);

  const normalizedEmail = email.trim().toLowerCase();
  const hasValidEmail = isValidEmail(normalizedEmail);

  useEffect(() => {
    if (!supabaseConfigured || !supabaseAuthReady || !hasValidEmail) {
      setGovernance(null);
      setCooldownSeconds(0);
      setHasAcceptedSend(false);
      setIsGovernanceLoading(false);
      return;
    }

    const timerId = window.setTimeout(() => {
      void syncGovernanceState(normalizedEmail, { suppressStatus: true });
    }, 180);

    return () => {
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
  const governanceBlocksSubmission = governance ? !governance.allowed : false;
  const disabled =
    !supabaseConfigured
    || !supabaseAuthReady
    || isSending
    || isFinalizing
    || isGovernanceLoading
    || !hasValidEmail
    || governanceBlocksSubmission;

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
    title: messages.confirmEmailIdleTitle,
    body: messages.confirmEmailIdleBody,
    live: "off",
  };

  const visibleStatus = status ?? governanceStatus ?? blockingStatus ?? idleStatus;
  const resendLabel =
    isFinalizing
      ? messages.confirmEmailFinalizingButton
      : isSending
      ? messages.confirmEmailResendWorking
      : governance?.governanceCode === "VERIFICATION_RESEND_COOLDOWN_ACTIVE" && cooldownSeconds > 0
        ? `${messages.confirmEmailResendCooldownPrefix} ${cooldownSeconds}s`
        : hasAcceptedSend
          ? messages.confirmEmailResendAction
          : messages.confirmEmailSendAction;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (disabled) {
      if (!hasValidEmail) {
        setStatus({
          tone: "warning",
          icon: "warning",
          title: messages.confirmEmailInvalidEmailTitle,
          body: messages.confirmEmailInvalidEmailBody,
        });
      } else if (governance && !governance.allowed) {
        setStatus(mapGovernanceSnapshotToStatus(governance, messages));
      }
      return;
    }

    setIsSending(true);
    setStatus({
      tone: "info",
      icon: "working",
      title: messages.confirmEmailWorkingTitle,
      body: messages.confirmEmailWorkingBody,
    });

    try {
      const resendResult = await submitVerificationResend({
        email: normalizedEmail,
        flow,
        fromRoute: returnRoute,
      });

      // The server owns resend governance and provider delivery acceptance. Reflect exactly
      // what the backend reports so the button state cannot drift from real throttling truth.
      setGovernance(resendResult.governance);
      setCooldownSeconds(resendResult.governance.cooldownRemainingSeconds);
      setHasAcceptedSend(resendResult.governance.hasAcceptedSend || resendResult.providerAccepted);

      if (!resendResult.accepted || !resendResult.providerAccepted) {
        throw createAuthFlowError(
          "VERIFICATION_RESEND_PROVIDER_REJECTED",
          "Verification provider did not accept this resend request.",
        );
      }

      setStatus({
        tone: "success",
        icon: "success",
        title: messages.confirmEmailSentTitle,
        body: messages.confirmEmailSentBody,
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

      if (hasValidEmail && supabaseConfigured && supabaseAuthReady) {
        void syncGovernanceState(normalizedEmail, { suppressStatus: true });
      }
    }
  }

  return (
    <div className="relative mx-auto flex w-full max-w-[480px] flex-col gap-3 animate-in fade-in zoom-in-95 duration-700">
      <div className="relative overflow-hidden rounded-[2rem] border border-border bg-background-elevated/90 p-5 shadow-2xl shadow-black/20 backdrop-blur-2xl sm:p-6">
        <div className="relative z-10 flex flex-col gap-4">
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
                  setHasAcceptedSend(false);
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
              aria-busy={isSending || isFinalizing || isGovernanceLoading}
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
