"use client";

import { APP_ROUTES } from "@zootopia/shared-config";
import type { ApiResult, Locale } from "@zootopia/shared-types";
import { ArrowLeft, LoaderCircle, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import type { AuthStatusDescriptor } from "@/components/auth/auth-feedback";
import { AuthStatus } from "@/components/auth/auth-status";
import { PasswordVisibilityInput } from "@/components/ui/password-visibility-input";
import {
  getEphemeralSupabaseClient,
  isSupabaseWebConfigured,
  primeEphemeralSupabaseClient,
} from "@/lib/supabase/client";
import {
  getPasswordPolicyErrorMessage,
  getPasswordPolicyHint,
  getPasswordPolicyMinLength,
  validateUserPasswordPolicy,
} from "@/lib/password-policy";

export type ResetPasswordInitialFinalizeParams = {
  authCode: string;
  tokenHash: string;
  verificationType: string;
  errorCode: string;
  errorDescription: string;
  accessToken: string;
  refreshToken: string;
};

type ResetPasswordPanelProps = {
  locale: Locale;
  supabaseAuthReady: boolean;
  initialFinalize: ResetPasswordInitialFinalizeParams;
};

type PasswordRecoveryValidatePayload = {
  validated: boolean;
  user: {
    uid: string;
    email: string;
  };
};

type PasswordRecoveryCompletePayload = {
  completed: boolean;
  sessionHardeningSucceeded: boolean;
};

type ResetFinalizePayload = {
  authCode: string | null;
  tokenHash: string | null;
  verificationType: "recovery" | null;
  errorCode: string | null;
  errorDescription: string | null;
  accessToken: string | null;
  refreshToken: string | null;
};

const RESET_CALLBACK_URL_SENSITIVE_PARAM_KEYS = [
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

const PASSWORD_RECOVERY_API_ROUTE = "/api/auth/password/recovery";

function buildLocalText(locale: Locale) {
  if (locale === "ar") {
    return {
      initializingTitle: "جاري التحقق من رابط الاستعادة",
      initializingBody: "نراجع رمز الاستعادة ونجهز جلسة إعادة التعيين.",
      readyTitle: "يمكنك الآن تعيين كلمة مرور جديدة",
      readyBody: "أدخل كلمة مرور قوية ثم أكدها لإكمال استعادة الحساب.",
      successTitle: "تم تحديث كلمة المرور",
      successBody: "اكتملت إعادة التعيين. استخدم كلمة المرور الجديدة لتسجيل الدخول مرة أخرى.",
      successWithWarningBody:
        "تم تحديث كلمة المرور، لكن لم نؤكد تشديد الجلسة بالكامل. سجّل الدخول من جديد فوراً.",
      invalidLinkTitle: "رابط الاستعادة غير صالح",
      invalidLinkBody: "اطلب رابطاً جديداً ثم افتح أحدث رسالة.",
      expiredLinkTitle: "انتهت صلاحية رابط الاستعادة",
      expiredLinkBody: "اطلب رابطاً جديداً لإعادة تعيين كلمة المرور.",
      adminBlockedTitle: "هذا الحساب يستخدم مسار المشرف",
      adminBlockedBody: "استعادة كلمة مرور المشرف تتم عبر المسار الإداري المخصص.",
      unavailableTitle: "الخدمة غير متاحة حالياً",
      unavailableBody: "تعذر تهيئة تدفق الاستعادة الآن. حاول لاحقاً.",
      genericErrorTitle: "تعذر إكمال إعادة التعيين",
      genericErrorBody: "حاول مرة أخرى بعد قليل.",
      supportLabel: "مساعدة إضافية",
      supportNote:
        "في حال واجهت أي خطأ داخل المنصة، يُرجى التواصل مع المطور المهدي عبدالله. المنصة ما زالت قيد التطوير ونعمل على تحسينها باستمرار.",
      passwordLabel: "كلمة المرور الجديدة",
      confirmPasswordLabel: "تأكيد كلمة المرور الجديدة",
      passwordPlaceholder: "أدخل كلمة مرور قوية",
      confirmPasswordPlaceholder: "أعد إدخال كلمة المرور",
      passwordsMismatch: "كلمتا المرور غير متطابقتين.",
      passwordReused: "يجب أن تختلف كلمة المرور الجديدة عن كلمة المرور الحالية.",
      passwordRequired: "كلمة المرور الجديدة مطلوبة.",
      passwordConfirmRequired: "تأكيد كلمة المرور مطلوب.",
      submitAction: "تعيين كلمة مرور جديدة",
      submitWorking: "جاري تحديث كلمة المرور...",
      backToLogin: "العودة إلى تسجيل الدخول",
      requestNewReset: "طلب رابط استعادة جديد",
      showPassword: "إظهار كلمة المرور",
      hidePassword: "إخفاء كلمة المرور",
      sessionHardeningNote:
        "بعد التحديث، نطلب تسجيل دخول جديد لحماية حسابك عبر الجلسات.",
    };
  }

  return {
    initializingTitle: "Validating your recovery link",
    initializingBody: "We are checking this recovery token and preparing a reset session.",
    readyTitle: "You can set a new password now",
    readyBody: "Enter a strong password and confirm it to complete account recovery.",
    successTitle: "Password updated",
    successBody: "Recovery is complete. Sign in again using your new password.",
    successWithWarningBody:
      "Password was updated, but we could not fully confirm session hardening. Sign in again immediately.",
    invalidLinkTitle: "This recovery link is invalid",
    invalidLinkBody: "Request a new reset email, then open the latest message.",
    expiredLinkTitle: "This recovery link has expired",
    expiredLinkBody: "Request a fresh reset email to continue.",
    adminBlockedTitle: "This account uses the admin lane",
    adminBlockedBody: "Admin password recovery must run through the dedicated admin path.",
    unavailableTitle: "Service temporarily unavailable",
    unavailableBody: "Password recovery runtime could not be prepared right now. Please retry later.",
    genericErrorTitle: "Password reset could not be completed",
    genericErrorBody: "Please try again in a moment.",
    supportLabel: "Need help?",
    supportNote:
      "If you encounter any issue inside the platform, please contact the developer, Elmahdy Abdallah. The platform is still under development and we are improving it continuously.",
    passwordLabel: "New password",
    confirmPasswordLabel: "Confirm new password",
    passwordPlaceholder: "Enter a strong password",
    confirmPasswordPlaceholder: "Repeat your new password",
    passwordsMismatch: "New password and confirmation do not match.",
    passwordReused: "New password must be different from your current password.",
    passwordRequired: "New password is required.",
    passwordConfirmRequired: "Confirm password is required.",
    submitAction: "Set new password",
    submitWorking: "Updating password...",
    backToLogin: "Back to login",
    requestNewReset: "Request a new reset link",
    showPassword: "Show password",
    hidePassword: "Hide password",
    sessionHardeningNote:
      "After reset, we require a fresh sign-in to harden account session boundaries.",
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

  return value.trim().toLowerCase() === "recovery" ? "recovery" : null;
}

function readHashFinalizePayload(hash: string): ResetFinalizePayload {
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
  initialFinalize: ResetPasswordInitialFinalizeParams,
  hashPayload: ResetFinalizePayload,
): ResetFinalizePayload {
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

function hasFinalizePayload(payload: ResetFinalizePayload) {
  return Boolean(
    payload.errorCode
      || payload.authCode
      || (payload.tokenHash && payload.verificationType)
      || (payload.accessToken && payload.refreshToken),
  );
}

function cleanupResetCallbackUrl() {
  const url = new URL(window.location.href);

  for (const key of RESET_CALLBACK_URL_SENSITIVE_PARAM_KEYS) {
    url.searchParams.delete(key);
  }

  const hashParams = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
  for (const key of RESET_CALLBACK_URL_SENSITIVE_PARAM_KEYS) {
    hashParams.delete(key);
  }

  const nextHash = hashParams.toString();
  const nextUrl = `${url.pathname}${url.search}${nextHash ? `#${nextHash}` : ""}`;
  window.history.replaceState({}, "", nextUrl);
}

async function readApiResult<T>(response: Response) {
  try {
    return (await response.json()) as ApiResult<T>;
  } catch {
    return {
      ok: false as const,
      error: {
        code: "INVALID_JSON",
        message: "Invalid server response.",
      },
    } satisfies ApiResult<T>;
  }
}

function mapRecoveryValidationFailure(
  code: string,
  text: ReturnType<typeof buildLocalText>,
): AuthStatusDescriptor {
  if (code === "ADMIN_PASSWORD_FLOW_UNSUPPORTED") {
    return {
      tone: "warning",
      icon: "permission",
      title: text.adminBlockedTitle,
      body: text.adminBlockedBody,
    };
  }

  if (code === "PASSWORD_RECOVERY_INVALID_TOKEN") {
    return {
      tone: "warning",
      icon: "warning",
      title: text.invalidLinkTitle,
      body: text.invalidLinkBody,
    };
  }

  if (code === "PASSWORD_RECOVERY_EMAIL_UNAVAILABLE") {
    return {
      tone: "warning",
      icon: "warning",
      title: text.invalidLinkTitle,
      body: text.invalidLinkBody,
    };
  }

  if (code === "PASSWORD_RECOVERY_VALIDATION_FAILED") {
    return {
      tone: "danger",
      icon: "danger",
      title: text.genericErrorTitle,
      body: text.genericErrorBody,
      live: "assertive",
      supportLabel: text.supportLabel,
      supportNotes: [{ text: text.supportNote, tone: "danger" }],
    };
  }

  return {
    tone: "warning",
    icon: "warning",
    title: text.invalidLinkTitle,
    body: text.invalidLinkBody,
  };
}

function mapSupabaseFinalizeError(
  error: { code?: string; message?: string },
  text: ReturnType<typeof buildLocalText>,
): AuthStatusDescriptor {
  const normalizedCode = String(error.code || "").trim().toLowerCase();
  const normalizedMessage = String(error.message || "").trim().toLowerCase();

  if (normalizedCode.includes("expired") || normalizedMessage.includes("expired")) {
    return {
      tone: "warning",
      icon: "warning",
      title: text.expiredLinkTitle,
      body: text.expiredLinkBody,
    };
  }

  if (
    normalizedCode.includes("invalid")
    || normalizedMessage.includes("invalid")
    || normalizedCode.includes("otp")
  ) {
    return {
      tone: "warning",
      icon: "warning",
      title: text.invalidLinkTitle,
      body: text.invalidLinkBody,
    };
  }

  return {
    tone: "danger",
    icon: "danger",
    title: text.genericErrorTitle,
    body: text.genericErrorBody,
    live: "assertive",
    supportLabel: text.supportLabel,
    supportNotes: [{ text: text.supportNote, tone: "danger" }],
  };
}

function mapResetUpdateFailure(
  code: string,
  text: ReturnType<typeof buildLocalText>,
): AuthStatusDescriptor {
  switch (code) {
    case "SAME_PASSWORD":
      return {
        tone: "warning",
        icon: "warning",
        title: text.genericErrorTitle,
        body: text.passwordReused,
      };
    case "WEAK_PASSWORD":
      return {
        tone: "warning",
        icon: "warning",
        title: text.genericErrorTitle,
        body: text.genericErrorBody,
      };
    case "PASSWORD_RECOVERY_COMPLETE_FAILED":
      return {
        tone: "danger",
        icon: "danger",
        title: text.genericErrorTitle,
        body: text.genericErrorBody,
        supportLabel: text.supportLabel,
        supportNotes: [{ text: text.supportNote, tone: "danger" }],
      };
    case "PASSWORD_RECOVERY_INVALID_TOKEN":
      return {
        tone: "warning",
        icon: "warning",
        title: text.invalidLinkTitle,
        body: text.invalidLinkBody,
      };
    default:
      return {
        tone: "danger",
        icon: "danger",
        title: text.genericErrorTitle,
        body: text.genericErrorBody,
        live: "assertive",
        supportLabel: text.supportLabel,
        supportNotes: [{ text: text.supportNote, tone: "danger" }],
      };
  }
}

async function finalizeRecoverySession(input: {
  payload: ResetFinalizePayload;
}) {
  const supabase = await getEphemeralSupabaseClient();
  const payload = input.payload;

  if (payload.errorCode) {
    throw {
      code: payload.errorCode,
      message: payload.errorDescription ?? "Recovery callback returned an error.",
    };
  }

  if (payload.tokenHash && payload.verificationType) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: payload.tokenHash,
      type: payload.verificationType,
    });

    if (error) {
      throw error;
    }

    return;
  }

  if (payload.authCode) {
    const { error } = await supabase.auth.exchangeCodeForSession(payload.authCode);

    if (error) {
      throw error;
    }

    return;
  }

  if (payload.accessToken && payload.refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: payload.accessToken,
      refresh_token: payload.refreshToken,
    });

    if (error) {
      throw error;
    }

    return;
  }

  throw {
    code: "PASSWORD_RECOVERY_INVALID_TOKEN",
    message: "Missing reset callback parameters.",
  };
}

export function ResetPasswordPanel({
  locale,
  supabaseAuthReady,
  initialFinalize,
}: ResetPasswordPanelProps) {
  const router = useRouter();
  const text = useMemo(() => buildLocalText(locale), [locale]);
  const supabaseConfigured = isSupabaseWebConfigured();
  const passwordHint = getPasswordPolicyHint(locale);
  const verifiedTokenRef = useRef<string | null>(null);
  const redirectTimerRef = useRef<number | null>(null);

  const [status, setStatus] = useState<AuthStatusDescriptor>({
    tone: "info",
    icon: "working",
    title: text.initializingTitle,
    body: text.initializingBody,
  });
  const [initializing, setInitializing] = useState(true);
  const [ready, setReady] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const passwordMinLength = getPasswordPolicyMinLength();

  useEffect(() => {
    return () => {
      if (redirectTimerRef.current !== null) {
        window.clearTimeout(redirectTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function initializeRecoveryFlow() {
      if (!supabaseConfigured || !supabaseAuthReady) {
        if (!cancelled) {
          setStatus({
            tone: "danger",
            icon: "config",
            title: text.unavailableTitle,
            body: text.unavailableBody,
            live: "assertive",
            supportLabel: text.supportLabel,
            supportNotes: [{ text: text.supportNote, tone: "danger" }],
          });
          setInitializing(false);
          setReady(false);
        }
        return;
      }

      try {
        await primeEphemeralSupabaseClient();
        const mergedFinalizePayload = mergeFinalizePayload(
          initialFinalize,
          readHashFinalizePayload(window.location.hash),
        );

        if (!hasFinalizePayload(mergedFinalizePayload)) {
          if (!cancelled) {
            setStatus({
              tone: "warning",
              icon: "warning",
              title: text.invalidLinkTitle,
              body: text.invalidLinkBody,
            });
            setReady(false);
          }
          return;
        }

        await finalizeRecoverySession({
          payload: mergedFinalizePayload,
        });

        const supabase = await getEphemeralSupabaseClient();
        const sessionResult = await supabase.auth.getSession();
        const recoveryToken = sessionResult.data.session?.access_token?.trim() || "";

        if (!recoveryToken) {
          if (!cancelled) {
            setStatus({
              tone: "warning",
              icon: "warning",
              title: text.invalidLinkTitle,
              body: text.invalidLinkBody,
            });
            setReady(false);
          }
          return;
        }

        verifiedTokenRef.current = recoveryToken;

        const validateResponse = await fetch(PASSWORD_RECOVERY_API_ROUTE, {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            action: "validate",
            idToken: recoveryToken,
          }),
        });

        const validatePayload = await readApiResult<PasswordRecoveryValidatePayload>(validateResponse);
        if (!validateResponse.ok || !validatePayload.ok) {
          const code = validatePayload.ok
            ? "PASSWORD_RECOVERY_VALIDATION_FAILED"
            : validatePayload.error.code;
          if (!cancelled) {
            setStatus(mapRecoveryValidationFailure(code, text));
            setReady(false);
          }
          return;
        }

        cleanupResetCallbackUrl();

        if (!cancelled) {
          setEmail(validatePayload.data.user.email);
          setStatus({
            tone: "success",
            icon: "success",
            title: text.readyTitle,
            body: text.readyBody,
          });
          setReady(true);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        setStatus(
          mapSupabaseFinalizeError(
            {
              code:
                typeof error === "object" && error && "code" in error
                  ? String((error as { code?: string }).code || "")
                  : "",
              message:
                typeof error === "object" && error && "message" in error
                  ? String((error as { message?: string }).message || "")
                  : "",
            },
            text,
          ),
        );
        setReady(false);
      } finally {
        if (!cancelled) {
          setInitializing(false);
        }
      }
    }

    void initializeRecoveryFlow();

    return () => {
      cancelled = true;
    };
  }, [initialFinalize, supabaseAuthReady, supabaseConfigured, text]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!ready || busy || !supabaseConfigured || !supabaseAuthReady) {
      return;
    }

    const normalizedPassword = newPassword;
    const normalizedConfirm = confirmPassword;

    setFieldError(null);

    if (!normalizedPassword) {
      setFieldError(text.passwordRequired);
      return;
    }

    if (!normalizedConfirm) {
      setFieldError(text.passwordConfirmRequired);
      return;
    }

    if (normalizedPassword !== normalizedConfirm) {
      setFieldError(text.passwordsMismatch);
      return;
    }

    const policyResult = validateUserPasswordPolicy({
      password: normalizedPassword,
      email,
    });

    if (!policyResult.ok) {
      setFieldError(
        getPasswordPolicyErrorMessage({
          locale,
          code: policyResult.code,
          fallback: policyResult.error,
        }),
      );
      return;
    }

    setBusy(true);
    setStatus({
      tone: "info",
      icon: "working",
      title: text.submitWorking,
      body: text.initializingBody,
    });

    try {
      const supabase = await getEphemeralSupabaseClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password: normalizedPassword,
      });

      if (updateError) {
        const updateCode = String(updateError.code || "").trim().toUpperCase();
        const mappedCode = updateCode || "PASSWORD_RECOVERY_COMPLETE_FAILED";
        setStatus(mapResetUpdateFailure(mappedCode, text));
        return;
      }

      const { error: hardeningError } = await supabase.auth.signOut({
        scope: "others",
      });
      const sessionHardeningSucceeded = !hardeningError;

      const sessionResult = await supabase.auth.getSession();
      const completionToken = sessionResult.data.session?.access_token || verifiedTokenRef.current;

      let metadataRecorded = false;

      if (completionToken) {
        const completeResponse = await fetch(PASSWORD_RECOVERY_API_ROUTE, {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            action: "complete",
            idToken: completionToken,
            sessionHardeningSucceeded,
          }),
        });

        const completePayload = await readApiResult<PasswordRecoveryCompletePayload>(completeResponse);
        metadataRecorded = completeResponse.ok && completePayload.ok && completePayload.data.completed;
      }

      await supabase.auth.signOut({ scope: "local" }).catch(() => {
        // Best-effort client cleanup only.
      });

      setCompleted(true);
      setReady(false);
      setStatus({
        tone: metadataRecorded ? "success" : "warning",
        icon: metadataRecorded ? "success" : "warning",
        title: text.successTitle,
        body: metadataRecorded ? text.successBody : text.successWithWarningBody,
      });

      const loginUrl = new URL(APP_ROUTES.login, window.location.origin);
      if (email.trim().length > 0) {
        loginUrl.searchParams.set("email", email.trim());
      }
      loginUrl.searchParams.set("passwordReset", "1");
      redirectTimerRef.current = window.setTimeout(() => {
        router.replace(`${loginUrl.pathname}${loginUrl.search}`);
      }, 1_500);
    } catch {
      setStatus({
        tone: "danger",
        icon: "danger",
        title: text.genericErrorTitle,
        body: text.genericErrorBody,
        live: "assertive",
        supportLabel: text.supportLabel,
        supportNotes: [{ text: text.supportNote, tone: "danger" }],
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative isolate mx-auto w-full max-w-[460px] overflow-hidden rounded-[2rem] border border-border bg-background-elevated/90 p-6 shadow-2xl shadow-black/16 backdrop-blur-2xl sm:rounded-[2.25rem] sm:p-8">
      <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-emerald-500 opacity-20 blur-3xl transition-opacity duration-700 dark:opacity-30" />
      <div className="pointer-events-none absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-emerald-500 opacity-20 blur-3xl transition-opacity duration-700 dark:opacity-30" />

      <div className="relative z-10 space-y-6">
        <AuthStatus status={status} />

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="space-y-2 block">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground-muted">
              {text.passwordLabel}
            </span>
            <PasswordVisibilityInput
              value={newPassword}
              onChange={(event) => {
                setNewPassword(event.target.value);
                if (fieldError) {
                  setFieldError(null);
                }
              }}
              autoComplete="new-password"
              className="w-full rounded-2xl border border-border bg-background px-4 py-3.5 text-sm font-medium text-foreground shadow-[0_12px_30px_rgba(15,23,42,0.05)] transition-all focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 placeholder:text-foreground-muted/80"
              placeholder={text.passwordPlaceholder}
              disabled={busy || !ready || initializing || completed}
              required
              minLength={passwordMinLength}
              showPasswordLabel={text.showPassword}
              hidePasswordLabel={text.hidePassword}
            />
          </label>

          <label className="space-y-2 block">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground-muted">
              {text.confirmPasswordLabel}
            </span>
            <PasswordVisibilityInput
              value={confirmPassword}
              onChange={(event) => {
                setConfirmPassword(event.target.value);
                if (fieldError) {
                  setFieldError(null);
                }
              }}
              autoComplete="new-password"
              className="w-full rounded-2xl border border-border bg-background px-4 py-3.5 text-sm font-medium text-foreground shadow-[0_12px_30px_rgba(15,23,42,0.05)] transition-all focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 placeholder:text-foreground-muted/80"
              placeholder={text.confirmPasswordPlaceholder}
              disabled={busy || !ready || initializing || completed}
              required
              minLength={passwordMinLength}
              showPasswordLabel={text.showPassword}
              hidePasswordLabel={text.hidePassword}
            />
          </label>

          <p className="rounded-2xl border border-border bg-background/60 px-3.5 py-3 text-xs leading-5 text-foreground-muted">
            {passwordHint}
          </p>

          {fieldError ? (
            <p className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-200">
              {fieldError}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy || !ready || initializing || completed}
            aria-busy={busy}
            className="group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-2xl bg-emerald-600 px-5 py-3.5 text-[1rem] font-semibold text-white shadow-[0_8px_24px_rgba(16,185,129,0.3)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-emerald-500 disabled:opacity-60 disabled:hover:translate-y-0"
          >
            {busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />}
            <span>{busy ? text.submitWorking : text.submitAction}</span>
          </button>
        </form>

        <p className="rounded-2xl border border-border bg-background/60 px-3.5 py-3 text-xs leading-5 text-foreground-muted">
          {text.sessionHardeningNote}
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={APP_ROUTES.login}
            className="inline-flex items-center gap-2 text-sm font-semibold text-foreground-muted transition hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            {text.backToLogin}
          </Link>
          <Link
            href={APP_ROUTES.forgotPassword}
            className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 transition hover:text-emerald-600 dark:text-emerald-300 dark:hover:text-emerald-200"
          >
            {text.requestNewReset}
          </Link>
        </div>
      </div>
    </div>
  );
}
