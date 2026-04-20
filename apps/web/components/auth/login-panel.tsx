"use client";

import { APP_ROUTES } from "@zootopia/shared-config";
import type { ApiResult, Locale, SessionUser } from "@zootopia/shared-types";
import { LoaderCircle, LogIn, Mail, Shield, UserPlus } from "lucide-react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  createAuthFlowError,
  createAuthFlowErrorWithDetails,
  getAuthFlowErrorCode,
  mapRegularLoginError,
  type AuthStatusDescriptor,
  type AuthSupportNote,
} from "@/components/auth/auth-feedback";
import {
  AuthStatus,
  AuthSupportDetails,
} from "@/components/auth/auth-status";
import { readCredentialsSignInErrorCode } from "@/components/auth/signin-result";
import type { AppMessages } from "@/lib/messages";
import {
  buildConfirmEmailRoute,
  isEmailConfirmationFailure,
  logAuthDiagnosis,
  normalizeAuthFailure,
} from "@/lib/auth-failure";
import { resolveAuthenticatedUserRedirectPath } from "@/lib/return-to";
import {
  getEphemeralSupabaseClient,
  getSupabaseClient,
  isSupabaseWebConfigured,
  primeEphemeralSupabaseClient,
} from "@/lib/supabase/client";
import { buildClientAuthDeviceLabelMetadata } from "@/lib/auth-device-label";
import {
  getPasswordPolicyErrorMessage,
  getPasswordPolicyHint,
  getPasswordPolicyMinLength,
  validateUserPasswordPolicy,
} from "@/lib/password-policy";
import { PasswordVisibilityInput } from "@/components/ui/password-visibility-input";

type LoginPanelProps = {
  messages: AppMessages;
  locale: Locale;
  supabaseAuthReady: boolean;
};

type LoginPhase = "idle" | "authenticating" | "bootstrapping" | "success_handoff";
type LoginMode = "sign_in" | "sign_up";

const BOOTSTRAP_TIMEOUT_MS = 20_000;
const SESSION_BOOTSTRAP_MAX_ATTEMPTS = 40;
const SESSION_BOOTSTRAP_RETRY_MS = 200;
const USER_LOGIN_ADMISSION_API_ROUTE = "/api/auth/login/admission";
const USER_SIGNUP_API_ROUTE = "/api/auth/signup";
const USER_LOGIN_ADMISSION_STATUS_REFRESH_MS = 5_000;

const ACTIVE_NORMAL_USERS_HEADER = "X-Zootopia-Active-Normal-Users";
const ACTIVE_NORMAL_USERS_LIMIT_HEADER = "X-Zootopia-Active-Normal-User-Limit";
const ACTIVE_NORMAL_USERS_SESSION_MINUTES_HEADER = "X-Zootopia-Active-Normal-User-Session-Minutes";
const ACTIVE_NORMAL_USERS_AVAILABLE_SLOTS_HEADER = "X-Zootopia-Active-Normal-User-Available-Slots";

type ActiveNormalUserCapacitySnapshot = {
  activeNormalUsers: number;
  maxActiveNormalUsers: number;
  sessionMinutes: number;
  availableSlots: number;
  isFull: boolean;
};

type LoginAdmissionCapacityDecision = {
  allowed: boolean;
  exempt: boolean;
  reason: "EXEMPT" | "CAPACITY_AVAILABLE" | "CAPACITY_FULL";
  snapshot: ActiveNormalUserCapacitySnapshot;
};

type LoginCapacityStatusPayload = {
  allowed: boolean;
  exempt: boolean;
  reason: "EXEMPT" | "CAPACITY_AVAILABLE" | "CAPACITY_FULL";
  capacity: ActiveNormalUserCapacitySnapshot;
};

function buildLocalText(locale: Locale) {
  if (locale === "ar") {
    return {
      emailLabel: "البريد الإلكتروني",
      passwordLabel: "كلمة المرور",
      confirmPasswordLabel: "تأكيد كلمة المرور",
      signInTab: "تسجيل الدخول",
      signUpTab: "إنشاء حساب",
      signUpHint: "أنشئ حساباً جديداً ثم أكمل الدخول الآمن.",
      signInHint: "سجّل دخولك بحسابك الجامعي لإكمال جلسة المساحة الآمنة.",
      signInButton: "دخول آمن",
      signUpButton: "إنشاء حساب",
      passwordsMismatch: "كلمتا المرور غير متطابقتين.",
      passwordPolicyTitle: "كلمة المرور الجديدة لا تحقق سياسة الأمان.",
      emailVerificationRequired:
        "تم إنشاء الحساب. راجع بريدك الإلكتروني لتأكيد الحساب ثم عد لتسجيل الدخول.",
      signUpRateLimitedTitle: "إنشاء الحساب مزدحم حالياً",
      signUpRateLimitedBody:
        "ننظم طلبات إنشاء الحساب حالياً لحماية الاستقرار. انتظر قليلاً ثم حاول مرة أخرى.",
      signUpUnavailableTitle: "إنشاء الحساب غير متاح مؤقتاً",
      signUpUnavailableBody:
        "تعذر إكمال إنشاء الحساب الآن بسبب حالة مؤقتة في الخدمة. حاول مرة أخرى بعد قليل.",
      passwordResetCompletedTitle: "تم تحديث كلمة المرور",
      passwordResetCompletedBody:
        "تم حفظ كلمة المرور الجديدة بنجاح. يمكنك الآن تسجيل الدخول مرة أخرى.",
      profileTransitionCapacityFullTitle: "اكتمل ملفك الشخصي ودخلت الآن إلى نظام الإتاحة",
      profileTransitionCapacityFullBody:
        "أصبح حسابك الآن خاضعاً لنظام الإتاحة والسعة المعتاد في المنصة، لكن السعة ممتلئة حالياً. يمكنك المحاولة مجدداً عند توفر مقعد.",
      profileTransitionAdmissionUnavailableTitle: "اكتمل ملفك الشخصي",
      profileTransitionAdmissionUnavailableBody:
        "أصبح حسابك الآن خاضعاً لنظام الإتاحة والسعة المعتاد في المنصة، لكن تعذر تأكيد حالة الإتاحة حالياً. حاول تسجيل الدخول مرة أخرى بعد قليل.",
      forgotPasswordAction: "نسيت كلمة المرور؟",
      showPasswordAction: "إظهار كلمة المرور",
      hidePasswordAction: "إخفاء كلمة المرور",
    };
  }

  return {
    emailLabel: "Email",
    passwordLabel: "Password",
    confirmPasswordLabel: "Confirm password",
    signInTab: "Sign in",
    signUpTab: "Create account",
    signUpHint: "Create your account first, then complete secure workspace sign-in.",
    signInHint: "Sign in with your university account to continue with secure workspace access.",
    signInButton: "Secure sign-in",
    signUpButton: "Create account",
    passwordsMismatch: "Passwords do not match.",
    passwordPolicyTitle: "New password does not meet policy requirements.",
    emailVerificationRequired:
      "Account created. Verify your email, then return to sign in.",
    signUpRateLimitedTitle: "Account creation is busy right now",
    signUpRateLimitedBody:
      "We are pacing account-creation requests to protect platform stability. Please try again in a moment.",
    signUpUnavailableTitle: "Account creation is temporarily unavailable",
    signUpUnavailableBody:
      "We could not complete account creation right now because of a temporary service issue. Please try again shortly.",
    passwordResetCompletedTitle: "Password updated",
    passwordResetCompletedBody:
      "Your new password was saved successfully. You can sign in again now.",
    profileTransitionCapacityFullTitle: "Your profile is complete and now enters admission control",
    profileTransitionCapacityFullBody:
      "Your account now follows the platform's normal admission and capacity rules, but capacity is currently full. Please try signing in again when a slot opens.",
    profileTransitionAdmissionUnavailableTitle: "Your profile is complete",
    profileTransitionAdmissionUnavailableBody:
      "Your account now follows the platform's normal admission and capacity rules, but we could not confirm availability right now. Please try signing in again in a moment.",
    forgotPasswordAction: "Forgot password?",
    showPasswordAction: "Show password",
    hidePasswordAction: "Hide password",
  };
}

async function readApiResult<T>(response: Response, invalidCode: string) {
  try {
    return (await response.json()) as ApiResult<T>;
  } catch {
    throw createAuthFlowError(invalidCode);
  }
}

function mapSupabaseBrowserError(input: {
  error: { code?: string; message?: string; status?: number };
  mode: LoginMode;
  routePath: string;
}) {
  const failure = normalizeAuthFailure({
    error: {
      code: input.error.code,
      message: input.error.message,
      status: input.error.status,
    },
    flow: "user",
    stage: "AUTH_STAGE_C_PROVIDER_RESPONSE",
    routePath: input.routePath,
    sessionCreationAttempted: false,
  });

  logAuthDiagnosis({
    failure,
    uxAction: "show_error",
  });

  return createAuthFlowErrorWithDetails(
    failure.normalizedCode,
    failure.safeProviderMessage ?? undefined,
    {
      failure,
      mode: input.mode,
    },
  );
}

type LoginAdmissionPayload = {
  accepted: boolean;
  capacity?: LoginAdmissionCapacityDecision | null;
};

type SignupPayload = {
  accepted: boolean;
  email: string;
  requiresEmailConfirmation: boolean;
  confirmRoute: string;
  accessToken: string | null;
  refreshToken: string | null;
};

function parseHeaderNumber(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function readCapacitySnapshotFromHeaders(headers: Headers) {
  const activeNormalUsers = parseHeaderNumber(headers.get(ACTIVE_NORMAL_USERS_HEADER));
  const maxActiveNormalUsers = parseHeaderNumber(headers.get(ACTIVE_NORMAL_USERS_LIMIT_HEADER));
  const sessionMinutes = parseHeaderNumber(headers.get(ACTIVE_NORMAL_USERS_SESSION_MINUTES_HEADER));
  const availableSlots = parseHeaderNumber(headers.get(ACTIVE_NORMAL_USERS_AVAILABLE_SLOTS_HEADER));

  if (
    activeNormalUsers === null
    || maxActiveNormalUsers === null
    || sessionMinutes === null
  ) {
    return null;
  }

  const computedAvailableSlots = Math.max(
    0,
    maxActiveNormalUsers - activeNormalUsers,
  );

  return {
    activeNormalUsers: Math.max(0, activeNormalUsers),
    maxActiveNormalUsers: Math.max(1, maxActiveNormalUsers),
    sessionMinutes: Math.max(1, sessionMinutes),
    availableSlots: availableSlots === null
      ? computedAvailableSlots
      : Math.max(0, availableSlots),
    isFull: (availableSlots === null ? computedAvailableSlots : Math.max(0, availableSlots)) <= 0,
  } satisfies ActiveNormalUserCapacitySnapshot;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readCapacitySnapshotFromError(error: unknown) {
  if (!isRecord(error) || !isRecord(error.details)) {
    return null;
  }

  const maybeSnapshot = error.details.capacity;
  if (!isRecord(maybeSnapshot)) {
    return null;
  }

  const activeNormalUsers = typeof maybeSnapshot.activeNormalUsers === "number"
    ? maybeSnapshot.activeNormalUsers
    : null;
  const maxActiveNormalUsers = typeof maybeSnapshot.maxActiveNormalUsers === "number"
    ? maybeSnapshot.maxActiveNormalUsers
    : null;
  const sessionMinutes = typeof maybeSnapshot.sessionMinutes === "number"
    ? maybeSnapshot.sessionMinutes
    : null;
  const availableSlots = typeof maybeSnapshot.availableSlots === "number"
    ? maybeSnapshot.availableSlots
    : null;
  const isFull = typeof maybeSnapshot.isFull === "boolean"
    ? maybeSnapshot.isFull
    : null;

  if (
    activeNormalUsers === null
    || maxActiveNormalUsers === null
    || sessionMinutes === null
    || availableSlots === null
    || isFull === null
  ) {
    return null;
  }

  return {
    activeNormalUsers,
    maxActiveNormalUsers,
    sessionMinutes,
    availableSlots,
    isFull,
  } satisfies ActiveNormalUserCapacitySnapshot;
}

function readRawFailureCode(error: unknown) {
  if (!isRecord(error) || !isRecord(error.details) || !isRecord(error.details.failure)) {
    return null;
  }

  const rawCode = error.details.failure.rawCode;
  if (typeof rawCode === "string" && rawCode.trim().length > 0) {
    return rawCode.trim();
  }

  return null;
}

function interpolateTemplate(template: string, replacements: Record<string, string>) {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
    return replacements[key] ?? match;
  });
}

function formatLocaleCount(value: number, locale: Locale) {
  try {
    return new Intl.NumberFormat(locale === "ar" ? "ar" : "en").format(value);
  } catch {
    return String(value);
  }
}

function buildCapacityFullStatus(input: {
  messages: AppMessages;
  locale: Locale;
  snapshot: ActiveNormalUserCapacitySnapshot;
}): AuthStatusDescriptor {
  const active = formatLocaleCount(input.snapshot.activeNormalUsers, input.locale);
  const limit = formatLocaleCount(input.snapshot.maxActiveNormalUsers, input.locale);

  return {
    tone: "warning",
    icon: "warning",
    title: input.messages.loginStatusCapacityFullTitle,
    body: interpolateTemplate(input.messages.loginStatusCapacityFullBody, {
      active,
      limit,
    }),
    live: "polite",
  };
}

function buildOnboardingCapacityFullStatus(input: {
  messages: AppMessages;
  locale: Locale;
  snapshot: ActiveNormalUserCapacitySnapshot;
}): AuthStatusDescriptor {
  const active = formatLocaleCount(input.snapshot.activeNormalUsers, input.locale);
  const limit = formatLocaleCount(input.snapshot.maxActiveNormalUsers, input.locale);

  return {
    tone: "warning",
    icon: "warning",
    title: input.messages.loginStatusOnboardingWaitingTitle,
    body: interpolateTemplate(input.messages.loginStatusOnboardingWaitingBody, {
      active,
      limit,
    }),
    live: "polite",
  };
}

function buildCapacityAvailableStatus(input: {
  messages: AppMessages;
  onboarding: boolean;
}): AuthStatusDescriptor {
  if (input.onboarding) {
    return {
      tone: "success",
      icon: "success",
      title: input.messages.loginStatusOnboardingCapacityAvailableTitle,
      body: input.messages.loginStatusOnboardingCapacityAvailableBody,
    };
  }

  return {
    tone: "success",
    icon: "success",
    title: input.messages.loginStatusCapacityAvailableTitle,
    body: input.messages.loginStatusCapacityAvailableBody,
  };
}

async function requestLoginAdmission(email: string) {
  const response = await fetch(USER_LOGIN_ADMISSION_API_ROUTE, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    credentials: "same-origin",
    body: JSON.stringify({
      email,
    }),
  });

  const capacityFromHeaders = readCapacitySnapshotFromHeaders(response.headers);

  const payload = await readApiResult<LoginAdmissionPayload>(response, "LOGIN_ADMISSION_RESPONSE_INVALID");
  if (!response.ok || !payload.ok) {
    throw createAuthFlowErrorWithDetails(
      payload.ok ? "AUTH_RATE_LIMITED" : payload.error.code,
      payload.ok ? undefined : payload.error.message,
      {
        capacity: capacityFromHeaders,
      },
    );
  }

  const capacity = payload.data.capacity
    ?? (capacityFromHeaders
      ? {
          allowed: !capacityFromHeaders.isFull,
          exempt: false,
          reason: capacityFromHeaders.isFull ? "CAPACITY_FULL" : "CAPACITY_AVAILABLE",
          snapshot: capacityFromHeaders,
        }
      : null);

  return {
    ...payload.data,
    capacity,
  };
}

async function requestLoginCapacityStatus(email: string) {
  const query = new URLSearchParams();
  query.set("email", email);

  const response = await fetch(`${USER_LOGIN_ADMISSION_API_ROUTE}?${query.toString()}`, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
  });

  const payload = await readApiResult<LoginCapacityStatusPayload>(
    response,
    "LOGIN_CAPACITY_STATUS_RESPONSE_INVALID",
  );

  if (!response.ok || !payload.ok) {
    throw createAuthFlowError(
      payload.ok ? "AUTH_ACTIVE_USER_ADMISSION_UNAVAILABLE" : payload.error.code,
      payload.ok ? undefined : payload.error.message,
    );
  }

  return payload.data;
}

async function requestSignup(input: {
  email: string;
  password: string;
}) {
  const response = await fetch(USER_SIGNUP_API_ROUTE, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    credentials: "same-origin",
    body: JSON.stringify(input),
  });

  const payload = await readApiResult<SignupPayload>(response, "SIGNUP_RESPONSE_INVALID");
  if (!response.ok || !payload.ok) {
    throw createAuthFlowError(
      payload.ok ? "AUTH_UNKNOWN_UPSTREAM_FAILURE" : payload.error.code,
      payload.ok ? undefined : payload.error.message,
    );
  }

  return payload.data;
}

async function completeAuthJsCredentialsSignIn(input: {
  providerId: "user-credentials";
  idToken: string;
  deviceLabel: string | null;
  deviceLabelSource: string | null;
  deviceLabelConfidence: number | null;
  clientBestEffortSignInMetadataJson: string | null;
  routePath: string;
}) {
  const signInResult = await signIn(input.providerId, {
    redirect: false,
    idToken: input.idToken,
    deviceLabel: input.deviceLabel ?? "",
    deviceLabelSource: input.deviceLabelSource ?? "",
    deviceLabelConfidence:
      typeof input.deviceLabelConfidence === "number"
        ? String(input.deviceLabelConfidence)
        : "",
    clientBestEffortSignInMetadata: input.clientBestEffortSignInMetadataJson ?? "",
  });

  if (!signInResult) {
    const failure = normalizeAuthFailure({
      error: createAuthFlowError("AUTH_SESSION_CREATION_FAILED", "Missing Auth.js response."),
      flow: "user",
      stage: "AUTH_STAGE_D_AUTHJS_SESSION_CREATION",
      routePath: input.routePath,
      sessionCreationAttempted: true,
    });
    throw createAuthFlowErrorWithDetails(failure.normalizedCode, failure.safeProviderMessage ?? undefined, {
      failure,
    });
  }

  if (signInResult.error) {
    const failure = normalizeAuthFailure({
      error: {
        code: readCredentialsSignInErrorCode(signInResult) || "AUTH_SESSION_CREATION_FAILED",
        message: signInResult.error,
      },
      flow: "user",
      stage: "AUTH_STAGE_D_AUTHJS_SESSION_CREATION",
      routePath: input.routePath,
      sessionCreationAttempted: true,
    });
    throw createAuthFlowErrorWithDetails(failure.normalizedCode, failure.safeProviderMessage ?? undefined, {
      failure,
    });
  }

  if (!signInResult.ok) {
    const failure = normalizeAuthFailure({
      error: createAuthFlowError(
        "AUTH_SESSION_CREATION_FAILED",
        "Unable to establish authenticated session.",
      ),
      flow: "user",
      stage: "AUTH_STAGE_D_AUTHJS_SESSION_CREATION",
      routePath: input.routePath,
      sessionCreationAttempted: true,
    });
    throw createAuthFlowErrorWithDetails(failure.normalizedCode, failure.safeProviderMessage ?? undefined, {
      failure,
    });
  }

  /* Auth.js cookie issuance can race with the very next /api/auth/me request.
     Keep bootstrap deterministic by polling briefly until the server reads the new session cookie. */
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
      const failure = normalizeAuthFailure({
        error: {
          code: responseErrorCode || "AUTH_SESSION_CREATION_FAILED",
          message: mePayload.ok ? null : mePayload.error.message,
          status: meResponse.status,
        },
        flow: "user",
        stage: "AUTH_STAGE_E_SESSION_HYDRATION",
        routePath: input.routePath,
        sessionCreationAttempted: true,
      });
      throw createAuthFlowErrorWithDetails(failure.normalizedCode, failure.safeProviderMessage ?? undefined, {
        failure,
      });
    }

    if (hasAttemptsRemaining) {
      await new Promise((resolve) => window.setTimeout(resolve, SESSION_BOOTSTRAP_RETRY_MS));
      continue;
    }
  }
  const failure = normalizeAuthFailure({
    error: {
      code: lastBootstrapCode || "AUTH_SESSION_REFRESH_REQUIRED",
      message: "Session cookie was not observed after credentials sign-in bootstrap.",
    },
    flow: "user",
    stage: "AUTH_STAGE_E_SESSION_HYDRATION",
    routePath: input.routePath,
    sessionCreationAttempted: true,
  });
  throw createAuthFlowErrorWithDetails(failure.normalizedCode, failure.safeProviderMessage ?? undefined, {
    failure,
  });
}

export function LoginPanel({
  messages,
  locale,
  supabaseAuthReady,
}: LoginPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const bootstrapRequestRef = useRef<Promise<void> | null>(null);
  const confirmationPrefillKeyRef = useRef<string | null>(null);
  const [mode, setMode] = useState<LoginMode>("sign_in");
  const [phase, setPhase] = useState<LoginPhase>("idle");
  const [status, setStatus] = useState<AuthStatusDescriptor | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [capacityBlockedSnapshot, setCapacityBlockedSnapshot] =
    useState<ActiveNormalUserCapacitySnapshot | null>(null);
  const [capacityBlockedEmail, setCapacityBlockedEmail] = useState<string | null>(null);
  const [onboardingSignupEmail, setOnboardingSignupEmail] = useState<string | null>(null);
  const supabaseConfigured = isSupabaseWebConfigured();
  const isBusy = phase !== "idle";
  const localText = useMemo(() => buildLocalText(locale), [locale]);
  const passwordMinLength = getPasswordPolicyMinLength();

  const normalizedEmail = email.trim().toLowerCase();
  const isOnboardingCapacityContext =
    mode === "sign_in"
    && normalizedEmail.length > 0
    && onboardingSignupEmail === normalizedEmail;

  const isCapacityBlocked =
    mode === "sign_in"
    && phase === "idle"
    && Boolean(capacityBlockedSnapshot)
    && normalizedEmail.length > 0
    && capacityBlockedEmail === normalizedEmail;

  useEffect(() => {
    if (!supabaseConfigured) {
      return;
    }

    void primeEphemeralSupabaseClient().catch(() => {
      // Surface concrete configuration errors during active submit flows.
    });
  }, [supabaseConfigured]);

  useEffect(() => {
    const confirmed = searchParams.get("confirmed") === "1";
    const confirmedEmail = searchParams.get("email")?.trim() ?? "";
    const onboarding = searchParams.get("onboarding")?.trim().toLowerCase() === "signup";
    const confirmationKey = `${confirmed}:${confirmedEmail.toLowerCase()}:${onboarding ? "signup" : "none"}`;

    if (!confirmed || !confirmedEmail || confirmationPrefillKeyRef.current === confirmationKey) {
      return;
    }

    confirmationPrefillKeyRef.current = confirmationKey;

    /* Post-confirmation redirects land back on the login page by design.
       Prefill the verified email and show the next-step banner so users can
       continue with Auth.js sign-in instead of being dropped into the app directly. */
    setMode("sign_in");
    setEmail(confirmedEmail);
    setPassword("");
    setConfirmPassword("");
    setOnboardingSignupEmail(onboarding ? confirmedEmail.toLowerCase() : null);
    setStatus({
      tone: "success",
      icon: "success",
      title: messages.loginStatusEmailConfirmedTitle,
      body: messages.loginStatusEmailConfirmedBody,
    });
  }, [messages, searchParams]);

  useEffect(() => {
    const resetCompleted =
      searchParams.get("passwordReset") === "1"
      || searchParams.get("passwordChanged") === "1";
    const profileTransition = searchParams.get("profileTransition") === "1";
    const transitionState = searchParams.get("profileTransitionState")?.trim().toLowerCase() ?? "";
    const nextEmail = searchParams.get("email")?.trim() ?? "";

    if (!resetCompleted && !profileTransition) {
      return;
    }

    setMode("sign_in");
    if (nextEmail) {
      setEmail(nextEmail);
    }
    setPassword("");
    setConfirmPassword("");

    if (resetCompleted) {
      setStatus({
        tone: "success",
        icon: "success",
        title: localText.passwordResetCompletedTitle,
        body: localText.passwordResetCompletedBody,
      });
      return;
    }

    setStatus({
      tone: transitionState === "capacity_full" ? "warning" : "info",
      icon: transitionState === "capacity_full" ? "warning" : "info",
      title:
        transitionState === "capacity_full"
          ? localText.profileTransitionCapacityFullTitle
          : localText.profileTransitionAdmissionUnavailableTitle,
      body:
        transitionState === "capacity_full"
          ? localText.profileTransitionCapacityFullBody
          : localText.profileTransitionAdmissionUnavailableBody,
    });
  }, [localText, searchParams]);

  useEffect(() => {
    if (!capacityBlockedEmail) {
      return;
    }

    if (normalizedEmail.length === 0 || normalizedEmail !== capacityBlockedEmail) {
      setCapacityBlockedEmail(null);
      setCapacityBlockedSnapshot(null);

      if (phase === "idle") {
        setStatus(null);
      }
    }
  }, [capacityBlockedEmail, normalizedEmail, phase]);

  useEffect(() => {
    if (!onboardingSignupEmail) {
      return;
    }

    if (normalizedEmail.length > 0 && normalizedEmail !== onboardingSignupEmail) {
      setOnboardingSignupEmail(null);
    }
  }, [onboardingSignupEmail, normalizedEmail]);

  useEffect(() => {
    if (mode === "sign_in") {
      return;
    }

    if (onboardingSignupEmail) {
      setOnboardingSignupEmail(null);
    }

    if (capacityBlockedEmail || capacityBlockedSnapshot) {
      setCapacityBlockedEmail(null);
      setCapacityBlockedSnapshot(null);
    }
  }, [capacityBlockedEmail, capacityBlockedSnapshot, mode, onboardingSignupEmail]);

  useEffect(() => {
    if (
      !capacityBlockedEmail
      || !supabaseConfigured
      || !supabaseAuthReady
      || phase !== "idle"
      || mode !== "sign_in"
    ) {
      return;
    }

    let cancelled = false;

    const refreshCapacity = async () => {
      try {
        const capacityStatus = await requestLoginCapacityStatus(capacityBlockedEmail);
        if (cancelled) {
          return;
        }

        const isOnboardingBlockedEmail =
          onboardingSignupEmail !== null
          && capacityBlockedEmail === onboardingSignupEmail;

        if (!capacityStatus.allowed || capacityStatus.reason === "CAPACITY_FULL") {
          setCapacityBlockedSnapshot(capacityStatus.capacity);
          setStatus(
            isOnboardingBlockedEmail
              ? buildOnboardingCapacityFullStatus({
                  messages,
                  locale,
                  snapshot: capacityStatus.capacity,
                })
              : buildCapacityFullStatus({
                  messages,
                  locale,
                  snapshot: capacityStatus.capacity,
                }),
          );
          return;
        }

        setCapacityBlockedEmail(null);
        setCapacityBlockedSnapshot(null);
        setStatus(
          buildCapacityAvailableStatus({
            messages,
            onboarding: isOnboardingBlockedEmail,
          }),
        );
      } catch {
        if (cancelled) {
          return;
        }

        /* Capacity polling belongs to the `/login` admission truth surface. When that refresh
           degrades, do not keep showing stale queue/capacity copy as if it were current truth;
           preserve the blocked state but surface the temporary admission-availability message
           until the next successful server refresh proves the real state again. */
        setStatus(
          mapRegularLoginError(
            createAuthFlowError("AUTH_ACTIVE_USER_ADMISSION_UNAVAILABLE"),
            messages,
          ),
        );
      }
    };

    void refreshCapacity();
    const intervalId = window.setInterval(() => {
      void refreshCapacity();
    }, USER_LOGIN_ADMISSION_STATUS_REFRESH_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [
    capacityBlockedEmail,
    locale,
    messages,
    mode,
    onboardingSignupEmail,
    phase,
    supabaseAuthReady,
    supabaseConfigured,
  ]);

  const clearClientSession = useCallback(async () => {
    if (!supabaseConfigured) {
      return;
    }

    try {
      await getSupabaseClient().auth.signOut();
    } catch {
      // Best-effort client cleanup only.
    }
  }, [supabaseConfigured]);

  const setFinishingStatus = useCallback(() => {
    setPhase("bootstrapping");
    setStatus({
      tone: "info",
      icon: "working",
      title: messages.loginStatusFinishingTitle,
      body: messages.loginStatusFinishingBody,
    });
  }, [messages]);

  const bootstrapSession = useCallback(async (input: {
    idToken: string;
    deviceLabel: string | null;
    deviceLabelSource: string | null;
    deviceLabelConfidence: number | null;
    clientBestEffortSignInMetadataJson: string | null;
  }) => {
    if (bootstrapRequestRef.current) {
      await bootstrapRequestRef.current;
      return;
    }

    const requestPromise = (async () => {
      setFinishingStatus();

      const controller = new AbortController();
      const timeoutHandle = window.setTimeout(() => {
        controller.abort();
      }, BOOTSTRAP_TIMEOUT_MS);

      try {
        const settled = await Promise.race([
          completeAuthJsCredentialsSignIn({
            providerId: "user-credentials",
            idToken: input.idToken,
            deviceLabel: input.deviceLabel,
            deviceLabelSource: input.deviceLabelSource,
            deviceLabelConfidence: input.deviceLabelConfidence,
            clientBestEffortSignInMetadataJson: input.clientBestEffortSignInMetadataJson,
            routePath: APP_ROUTES.login,
          }),
          new Promise<SessionUser>((_, reject) => {
            controller.signal.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true },
            );
          }),
        ]);

        setPhase("success_handoff");
        setStatus({
          tone: "success",
          icon: "success",
          title: messages.loginStatusSuccessTitle,
          body: messages.loginStatusSuccessBody,
        });

          /* Keep the Supabase browser session alive after Auth.js bootstrap so protected routes can
            authorize private Realtime channel subscriptions. App route/data authority remains owned
            by Auth.js server session checks, not by this browser session. */

        /* Keep post-bootstrap handoff aligned with centralized role/profile redirect policy
           so NEXT_PUBLIC_ZOOTOPIA_AUTH_* defaults remain authoritative for login completion. */
        const redirectDecision = resolveAuthenticatedUserRedirectPath({
          role: settled.role,
          profileCompleted: settled.profileCompleted,
        });
        const redirectTo = redirectDecision.path;
        router.replace(redirectTo);
        router.refresh();
      } catch (nextError) {
        if (nextError instanceof DOMException && nextError.name === "AbortError") {
          const failure = normalizeAuthFailure({
            error: createAuthFlowError("AUTH_SESSION_CREATION_FAILED", "Timed out while waiting for session hydration."),
            flow: "user",
            stage: "AUTH_STAGE_E_SESSION_HYDRATION",
            routePath: APP_ROUTES.login,
            sessionCreationAttempted: true,
          });
          throw createAuthFlowErrorWithDetails(failure.normalizedCode, failure.safeProviderMessage ?? undefined, {
            failure,
          });
        }

        throw nextError;
      } finally {
        window.clearTimeout(timeoutHandle);
      }
    })();

    bootstrapRequestRef.current = requestPromise;

    try {
      await requestPromise;
    } finally {
      bootstrapRequestRef.current = null;
    }
  }, [messages, router, setFinishingStatus]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Keep the provider request and server preflight on one canonical email shape.
    const submittedEmail = email.trim().toLowerCase();

    logAuthDiagnosis({
      failure: normalizeAuthFailure({
        error: createAuthFlowError("AUTH_UNKNOWN_UPSTREAM_FAILURE", "Credentials were submitted from login panel."),
        flow: "user",
        stage: "AUTH_STAGE_A_CREDENTIALS_SUBMITTED",
        routePath: APP_ROUTES.login,
        sessionCreationAttempted: false,
      }),
      uxAction: "retry",
    });

    if (!supabaseConfigured || !supabaseAuthReady || isBusy || isCapacityBlocked) {
      return;
    }

    if (!submittedEmail || !password) {
      return;
    }

    if (mode === "sign_up" && password !== confirmPassword) {
      setStatus({
        tone: "warning",
        icon: "warning",
        title: localText.passwordsMismatch,
        body: localText.passwordsMismatch,
      });
      return;
    }

    if (mode === "sign_up") {
      const passwordPolicy = validateUserPasswordPolicy({
        password,
        email: submittedEmail,
      });

      if (!passwordPolicy.ok) {
        setStatus({
          tone: "warning",
          icon: "warning",
          title: localText.passwordPolicyTitle,
          body: getPasswordPolicyErrorMessage({
            locale,
            code: passwordPolicy.code,
            fallback: passwordPolicy.error,
          }),
        });
        return;
      }
    }

    setPhase("authenticating");
    setCapacityBlockedEmail(null);
    setCapacityBlockedSnapshot(null);
    setStatus({
      tone: "info",
      icon: "working",
      title: messages.loginStatusWorkingTitle,
      body: messages.loginStatusWorkingBody,
    });

    try {
      const supabase = await getEphemeralSupabaseClient();

      logAuthDiagnosis({
        failure: normalizeAuthFailure({
          error: createAuthFlowError("AUTH_UNKNOWN_UPSTREAM_FAILURE", "Submitting credentials to Supabase password auth."),
          flow: "user",
          stage: "AUTH_STAGE_B_SUPABASE_ATTEMPT",
          routePath: APP_ROUTES.login,
          sessionCreationAttempted: false,
        }),
        uxAction: "retry",
      });

      if (mode === "sign_up") {
        const signupResult = await requestSignup({
          email: submittedEmail,
          password,
        });

        if (signupResult.requiresEmailConfirmation || !signupResult.accessToken || !signupResult.refreshToken) {
          /* Supabase sign-up may intentionally omit a session until email confirmation is complete.
             Route the user to the dedicated confirmation surface instead of mislabeling this as a refresh/session bug. */
          const confirmRoute = signupResult.confirmRoute || buildConfirmEmailRoute({
            email: submittedEmail,
            flow: "sign_up",
            fromRoute: APP_ROUTES.login,
          });

          logAuthDiagnosis({
            failure: normalizeAuthFailure({
              error: createAuthFlowError("AUTH_EMAIL_NOT_CONFIRMED", "Signup completed but email confirmation is required."),
              flow: "user",
              stage: "AUTH_STAGE_C_PROVIDER_RESPONSE",
              routePath: APP_ROUTES.login,
              sessionCreationAttempted: false,
            }),
            uxAction: "redirect_confirm_email",
            redirectedToConfirmation: true,
          });

          setPhase("idle");
          setStatus({
            tone: "success",
            icon: "success",
            title: localText.signUpTab,
            body: localText.emailVerificationRequired,
          });
          setOnboardingSignupEmail(submittedEmail);
          setMode("sign_in");
          setConfirmPassword("");
          router.push(confirmRoute);
          return;
        }

        const { error: sessionError } = await supabase.auth.setSession({
          access_token: signupResult.accessToken,
          refresh_token: signupResult.refreshToken,
        });

        if (sessionError) {
          throw mapSupabaseBrowserError({
            error: sessionError,
            mode,
            routePath: APP_ROUTES.login,
          });
        }

        const deviceMetadata = await buildClientAuthDeviceLabelMetadata();
        await bootstrapSession({
          idToken: signupResult.accessToken,
          deviceLabel: deviceMetadata.deviceLabel,
          deviceLabelSource: deviceMetadata.deviceLabelSource,
          deviceLabelConfidence: deviceMetadata.deviceLabelConfidence,
          clientBestEffortSignInMetadataJson: deviceMetadata.clientBestEffortSignInMetadataJson,
        });
        return;
      }

      try {
        await requestLoginAdmission(submittedEmail);
      } catch (admissionError) {
        const admissionCode =
          readRawFailureCode(admissionError)
          ?? getAuthFlowErrorCode(admissionError);

        if (
          admissionCode !== "AUTH_ACTIVE_USER_CAPACITY_FULL"
          && admissionCode !== "AUTH_ACTIVE_USER_ADMISSION_UNAVAILABLE"
        ) {
          throw admissionError;
        }

        /* Public login admission remains useful for pacing, but active-capacity truth now
           belongs to the decisive Auth.js/session path because profile-incomplete users must
           stay outside queue counting until the backend confirms completion. */
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: submittedEmail,
        password,
      });

      if (error) {
        throw mapSupabaseBrowserError({
          error,
          mode,
          routePath: APP_ROUTES.login,
        });
      }

      if (!data.session?.access_token) {
        const failure = normalizeAuthFailure({
          error: createAuthFlowError("AUTH_UNKNOWN_UPSTREAM_FAILURE", "Supabase password sign-in succeeded without an access token."),
          flow: "user",
          stage: "AUTH_STAGE_C_PROVIDER_RESPONSE",
          routePath: APP_ROUTES.login,
          sessionCreationAttempted: false,
        });
        throw createAuthFlowErrorWithDetails(failure.normalizedCode, failure.safeProviderMessage ?? undefined, {
          failure,
        });
      }

      const deviceMetadata = await buildClientAuthDeviceLabelMetadata();
      await bootstrapSession({
        idToken: data.session.access_token,
        deviceLabel: deviceMetadata.deviceLabel,
        deviceLabelSource: deviceMetadata.deviceLabelSource,
        deviceLabelConfidence: deviceMetadata.deviceLabelConfidence,
        clientBestEffortSignInMetadataJson: deviceMetadata.clientBestEffortSignInMetadataJson,
      });
    } catch (nextError) {
      const rawAuthCode = readRawFailureCode(nextError) ?? getAuthFlowErrorCode(nextError);

      if ((mode === "sign_in" || mode === "sign_up") && rawAuthCode === "AUTH_ACTIVE_USER_CAPACITY_FULL") {
        const blockedEmail = submittedEmail;
        const isSignupOnboardingCapacity = mode === "sign_up";
        const isOnboardingBlockedEmail =
          isSignupOnboardingCapacity
          || (
            blockedEmail.length > 0
            && onboardingSignupEmail !== null
            && onboardingSignupEmail === blockedEmail
          );
        let snapshot = readCapacitySnapshotFromError(nextError);

        if (!snapshot && blockedEmail) {
          try {
            const capacityStatus = await requestLoginCapacityStatus(blockedEmail);
            snapshot = capacityStatus.capacity;
          } catch {
            // Keep fallback warning below when live status cannot be read yet.
          }
        }

        await clearClientSession();
        setPhase("idle");
        if (isSignupOnboardingCapacity) {
          setMode("sign_in");
          setConfirmPassword("");
        }
        if (blockedEmail) {
          setCapacityBlockedEmail(blockedEmail);
          if (isOnboardingBlockedEmail) {
            setOnboardingSignupEmail(blockedEmail);
          }
        }

        if (snapshot) {
          setCapacityBlockedSnapshot(snapshot);
          setStatus(
            isOnboardingBlockedEmail
              ? buildOnboardingCapacityFullStatus({
                  messages,
                  locale,
                  snapshot,
                })
              : buildCapacityFullStatus({
                  messages,
                  locale,
                  snapshot,
                }),
          );
        } else {
          setStatus(
            isOnboardingBlockedEmail
              ? {
                  tone: "warning",
                  icon: "warning",
                  title: messages.loginStatusOnboardingWaitingTitle,
                  body: messages.loginStatusOnboardingWaitingFallbackBody,
                }
              : {
                  tone: "warning",
                  icon: "warning",
                  title: messages.loginStatusCapacityFullTitle,
                  body: messages.loginStatusCapacityFullFallbackBody,
                },
          );
        }

        return;
      }

      const failure = normalizeAuthFailure({
        error: nextError,
        flow: "user",
        stage: "AUTH_STAGE_E_SESSION_HYDRATION",
        routePath: APP_ROUTES.login,
        sessionCreationAttempted: true,
      });

      if (isEmailConfirmationFailure(failure) && submittedEmail.length > 0) {
        /* When provider/auth traces point to unconfirmed email, preserve diagnosis fidelity by
           redirecting to confirmation guidance instead of showing generic session refresh messaging. */
        const confirmRoute = buildConfirmEmailRoute({
          email: submittedEmail,
          flow: "sign_in",
          fromRoute: APP_ROUTES.login,
        });

        logAuthDiagnosis({
          failure,
          uxAction: "redirect_confirm_email",
          redirectedToConfirmation: true,
        });

        await clearClientSession();
        setPhase("idle");
        router.push(confirmRoute);
        return;
      }

      if (mode === "sign_up") {
        await clearClientSession();
        if (failure.normalizedCode === "AUTH_ACCOUNT_ALREADY_EXISTS") {
          setMode("sign_in");
          setConfirmPassword("");
        }
        setPhase("idle");

        if (rawAuthCode === "SIGNUP_EMAIL_INVALID") {
          setStatus({
            tone: "warning",
            icon: "warning",
            title: messages.confirmEmailInvalidEmailTitle,
            body: messages.confirmEmailInvalidEmailBody,
          });
          return;
        }

        if (rawAuthCode === "SIGNUP_PASSWORD_REQUIRED") {
          setStatus({
            tone: "warning",
            icon: "warning",
            title: localText.passwordLabel,
            body: locale === "ar"
              ? "كلمة المرور مطلوبة لإنشاء الحساب."
              : "A password is required to create an account.",
          });
          return;
        }

        if (rawAuthCode === "PASSWORD_POLICY_FAILED") {
          setStatus({
            tone: "warning",
            icon: "warning",
            title: localText.passwordPolicyTitle,
            body: nextError instanceof Error
              ? nextError.message
              : localText.passwordPolicyTitle,
          });
          return;
        }

        if (failure.normalizedCode === "AUTH_RATE_LIMITED") {
          setStatus({
            tone: "warning",
            icon: "warning",
            title: localText.signUpRateLimitedTitle,
            body: localText.signUpRateLimitedBody,
          });
          return;
        }

        if (
          failure.normalizedCode === "AUTH_ENV_MISCONFIGURED"
          || failure.normalizedCode === "AUTH_PROVIDER_MISCONFIGURED"
          || failure.normalizedCode === "AUTH_UNKNOWN_UPSTREAM_FAILURE"
        ) {
          setStatus({
            tone: "danger",
            icon: "config",
            title: localText.signUpUnavailableTitle,
            body: localText.signUpUnavailableBody,
          });
          return;
        }
      }

      logAuthDiagnosis({
        failure,
        uxAction:
          failure.normalizedCode === "AUTH_SESSION_REFRESH_REQUIRED"
            ? "refresh_session"
            : "show_error",
      });

      await clearClientSession();
      if (failure.normalizedCode === "AUTH_ACCOUNT_ALREADY_EXISTS" && mode === "sign_up") {
        setMode("sign_in");
        setConfirmPassword("");
      }
      setPhase("idle");
      setStatus(mapRegularLoginError(nextError, messages));
    }
  }

  const disabled = !supabaseConfigured || !supabaseAuthReady || isBusy;
  const isSubmitDisabled = disabled || isCapacityBlocked;
  const blockingStatus =
    !supabaseConfigured
      ? {
          tone: "warning" as const,
          icon: "config" as const,
          title: messages.loginStatusConfigTitle,
          body: messages.loginStatusConfigBody,
          live: "off" as const,
        }
      : null;
  const idleHelperStatus =
    phase === "idle" && !status
      ? {
          tone: "neutral" as const,
          icon: "info" as const,
          title: mode === "sign_up" ? localText.signUpTab : messages.loginIdleTitle,
          body: mode === "sign_up" ? localText.signUpHint : localText.signInHint,
          live: "off" as const,
        }
      : null;
  const visibleStatus = blockingStatus ?? status ?? idleHelperStatus;
  const supportNotes: AuthSupportNote[] = [];
  if (!supabaseConfigured) {
    supportNotes.push({ text: messages.loginConfigHint });
  }
  if (!supabaseAuthReady) {
    supportNotes.push({ text: messages.supabaseAuthUnavailable });
  }

  const submitButtonLabel =
    isCapacityBlocked && isOnboardingCapacityContext
      ? messages.loginStatusOnboardingBlockedButton
      : isCapacityBlocked
        ? messages.loginStatusCapacityBlockedButton
      :
    mode === "sign_up"
      ? (isBusy ? messages.loginCtaWorking : localText.signUpButton)
      : (isBusy ? messages.loginCtaWorking : localText.signInButton);

  return (
    <div className="relative isolate mx-auto w-full max-w-[440px] overflow-hidden rounded-[2rem] border border-border bg-background-elevated/90 p-6 shadow-2xl shadow-black/16 backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-700 sm:rounded-[2.25rem] sm:p-8">
      <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-emerald-500 opacity-20 blur-3xl transition-opacity duration-700 dark:opacity-30" />
      <div className="pointer-events-none absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-emerald-500 opacity-20 blur-3xl transition-opacity duration-700 dark:opacity-30" />

      <div className="relative z-10 space-y-6">
        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-border bg-background-elevated/70 p-1">
          <button
            type="button"
            onClick={() => {
              setMode("sign_in");
              setCapacityBlockedEmail(null);
              setCapacityBlockedSnapshot(null);
              setStatus(null);
            }}
            className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${
              mode === "sign_in"
                ? "bg-emerald-600 text-white shadow"
                : "text-foreground-muted hover:text-foreground"
            }`}
          >
            <LogIn className="h-4 w-4" />
            {localText.signInTab}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("sign_up");
              setCapacityBlockedEmail(null);
              setCapacityBlockedSnapshot(null);
              setOnboardingSignupEmail(null);
              setStatus(null);
            }}
            className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${
              mode === "sign_up"
                ? "bg-emerald-600 text-white shadow"
                : "text-foreground-muted hover:text-foreground"
            }`}
          >
            <UserPlus className="h-4 w-4" />
            {localText.signUpTab}
          </button>
        </div>

        <AuthStatus status={visibleStatus} />

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="space-y-2 block">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground-muted">
              {localText.emailLabel}
            </span>
            <div className="flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-3">
              <Mail className="h-4.5 w-4.5 text-foreground-muted" />
              <input
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setCapacityBlockedEmail(null);
                  setCapacityBlockedSnapshot(null);
                  if (phase === "idle") {
                    setStatus(null);
                  }
                }}
                autoComplete={mode === "sign_up" ? "email" : "username"}
                className="w-full bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-foreground-muted/80"
                placeholder="name@university.edu"
                required
              />
            </div>
          </label>

          <label className="space-y-2 block">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground-muted">
              {localText.passwordLabel}
            </span>
            <PasswordVisibilityInput
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                if (phase === "idle") {
                  setStatus(null);
                }
              }}
              autoComplete={mode === "sign_up" ? "new-password" : "current-password"}
              className="w-full rounded-2xl border border-border bg-background px-4 py-3.5 text-sm font-medium text-foreground shadow-[0_12px_30px_rgba(15,23,42,0.05)] transition-all focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 placeholder:text-foreground-muted/80"
              placeholder="••••••••"
              required
              minLength={mode === "sign_up" ? passwordMinLength : 1}
              showPasswordLabel={localText.showPasswordAction}
              hidePasswordLabel={localText.hidePasswordAction}
            />
          </label>

          {mode === "sign_in" ? (
            <div className="-mt-1 flex justify-end">
              <Link
                href={`${APP_ROUTES.forgotPassword}?email=${encodeURIComponent(email.trim())}`}
                className="text-xs font-semibold text-emerald-700 transition hover:text-emerald-600 dark:text-emerald-300 dark:hover:text-emerald-200"
              >
                {localText.forgotPasswordAction}
              </Link>
            </div>
          ) : null}

          {mode === "sign_up" ? (
            <label className="space-y-2 block">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground-muted">
                {localText.confirmPasswordLabel}
              </span>
              <PasswordVisibilityInput
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                  if (phase === "idle") {
                    setStatus(null);
                  }
                }}
                autoComplete="new-password"
                className="w-full rounded-2xl border border-border bg-background px-4 py-3.5 text-sm font-medium text-foreground shadow-[0_12px_30px_rgba(15,23,42,0.05)] transition-all focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 placeholder:text-foreground-muted/80"
                placeholder="••••••••"
                required
                minLength={passwordMinLength}
                showPasswordLabel={localText.showPasswordAction}
                hidePasswordLabel={localText.hidePasswordAction}
              />

              <p className="rounded-2xl border border-border bg-background/60 px-3.5 py-3 text-xs leading-5 text-foreground-muted">
                {getPasswordPolicyHint(locale)}
              </p>
            </label>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitDisabled}
            aria-busy={isBusy}
            className="group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-2xl bg-emerald-600 px-5 py-3.5 text-[1rem] font-semibold text-white shadow-[0_8px_24px_rgba(16,185,129,0.3)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-emerald-500 disabled:opacity-60 disabled:hover:translate-y-0"
          >
            {isBusy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : null}
            <span>{submitButtonLabel}</span>
          </button>
        </form>

        <div className="relative my-1 flex items-center py-1">
          <div className="grow border-t border-border-strong" />
          <span className="shrink-0 px-4 text-xs font-semibold uppercase tracking-widest text-foreground-muted">
            OR
          </span>
          <div className="grow border-t border-border-strong" />
        </div>

        <div className="flex justify-center">
          <Link
            href={APP_ROUTES.adminLogin}
            className="group flex flex-col items-center gap-2 text-sm text-foreground-muted transition-colors hover:text-gold"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background-elevated shadow-sm transition-all group-hover:scale-110 group-hover:border-gold/30 group-hover:bg-gold/5 group-hover:shadow-[0_0_15px_rgba(242,198,106,0.2)]">
              <Shield className="h-4 w-4" />
            </div>
            <span className="font-medium tracking-wide">
              {messages.loginAdminAction || "Admin"}
            </span>
          </Link>
        </div>

        {supportNotes.length > 0 ? (
          <div className="space-y-3">
            {supportNotes.map((note) => (
              <AuthSupportDetails
                key={note.text}
                label={note.text}
                notes={[note]}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
