"use client";

import { APP_ROUTES } from "@zootopia/shared-config";
import type { ApiResult, Locale } from "@zootopia/shared-types";
import { KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { PasswordVisibilityInput } from "@/components/ui/password-visibility-input";
import {
  getPasswordPolicyErrorMessage,
  getPasswordPolicyHint,
  getPasswordPolicyMinLength,
  validateUserPasswordPolicy,
} from "@/lib/password-policy";
import {
  getSupabaseClient,
  isSupabaseWebConfigured,
} from "@/lib/supabase/client";

type PasswordChangePanelProps = {
  locale: Locale;
};

type PasswordChangeResponse = {
  passwordUpdated: boolean;
  requiresReauth: boolean;
  sessionHardeningSucceeded: boolean;
};

type PasswordChangeStatusTone = "idle" | "pending" | "success" | "warning" | "danger";

const PASSWORD_CHANGE_API_ROUTE = "/api/auth/password/change";

function buildLocalText(locale: Locale) {
  if (locale === "ar") {
    return {
      sectionLabel: "أمان الحساب",
      title: "تحديث كلمة المرور",
      subtitle:
        "هذا الإجراء متاح لحسابات المستخدمين فقط. بعد النجاح، سيتم تسجيل خروجك لإعادة الدخول بكلمة المرور الجديدة.",
      currentPasswordLabel: "كلمة المرور الحالية",
      newPasswordLabel: "كلمة المرور الجديدة",
      confirmPasswordLabel: "تأكيد كلمة المرور الجديدة",
      showPassword: "إظهار كلمة المرور",
      hidePassword: "إخفاء كلمة المرور",
      submitAction: "تحديث كلمة المرور",
      submitWorking: "جاري تحديث كلمة المرور...",
      requiredField: "هذا الحقل مطلوب.",
      mismatchError: "كلمتا المرور الجديدتان غير متطابقتين.",
      reusedError: "يجب أن تختلف كلمة المرور الجديدة عن الحالية.",
      invalidCurrentError: "كلمة المرور الحالية غير صحيحة.",
      reauthMessage: "تم تحديث كلمة المرور. سنعيد تسجيل الدخول الآن لحماية الجلسة.",
      successMessage: "تم تحديث كلمة المرور بنجاح.",
      genericError: "تعذر تحديث كلمة المرور الآن. حاول مرة أخرى بعد قليل.",
      unavailableError: "خدمة تحديث كلمة المرور غير متاحة حالياً.",
      rateLimitedError: "محاولات كثيرة في وقت قصير. حاول لاحقاً.",
      policyTitle: "سياسة كلمة المرور غير محققة",
    };
  }

  return {
    sectionLabel: "Account security",
    title: "Update password",
    subtitle:
      "This action is available for regular user accounts only. After success, you will be signed out to re-authenticate with the new password.",
    currentPasswordLabel: "Current password",
    newPasswordLabel: "New password",
    confirmPasswordLabel: "Confirm new password",
    showPassword: "Show password",
    hidePassword: "Hide password",
    submitAction: "Update password",
    submitWorking: "Updating password...",
    requiredField: "This field is required.",
    mismatchError: "New password and confirmation do not match.",
    reusedError: "New password must be different from current password.",
    invalidCurrentError: "Current password is incorrect.",
    reauthMessage: "Password updated. We are signing you out to harden the session boundary.",
    successMessage: "Password updated successfully.",
    genericError: "Password could not be updated right now. Please retry shortly.",
    unavailableError: "Password change service is currently unavailable.",
    rateLimitedError: "Too many attempts right now. Please retry later.",
    policyTitle: "Password policy requirement not met",
  };
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

function resolveStatusClassName(tone: PasswordChangeStatusTone) {
  if (tone === "pending") {
    return "border-sky-500/24 bg-sky-500/10 text-sky-700 dark:border-sky-400/24 dark:bg-sky-400/10 dark:text-sky-200";
  }

  if (tone === "success") {
    return "border-emerald-500/24 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/24 dark:bg-emerald-400/10 dark:text-emerald-200";
  }

  if (tone === "warning") {
    return "border-amber-500/24 bg-amber-500/10 text-amber-700 dark:border-amber-400/24 dark:bg-amber-400/10 dark:text-amber-200";
  }

  if (tone === "danger") {
    return "border-rose-500/24 bg-rose-500/10 text-rose-700 dark:border-rose-400/24 dark:bg-rose-400/10 dark:text-rose-200";
  }

  return "border-border bg-background text-foreground-muted";
}

export function PasswordChangePanel({ locale }: PasswordChangePanelProps) {
  const router = useRouter();
  const text = useMemo(() => buildLocalText(locale), [locale]);
  const policyHint = getPasswordPolicyHint(locale);
  const passwordMinLength = getPasswordPolicyMinLength();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{
    tone: PasswordChangeStatusTone;
    message: string;
  }>({
    tone: "idle",
    message: policyHint,
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function forceReauthenticate() {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
    }).catch(() => {
      // Keep sign-out fail-open so the client can still clear cookies.
    });

    await signOut({
      redirect: false,
    }).catch(() => {
      // Continue with client-side cleanup and redirect best-effort.
    });

    if (isSupabaseWebConfigured()) {
      await getSupabaseClient().auth.signOut().catch(() => {
        // Browser Supabase token cleanup is best-effort.
      });
    }

    router.replace(`${APP_ROUTES.login}?passwordChanged=1`);
    router.refresh();
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (busy) {
      return;
    }

    const nextFieldErrors: Record<string, string> = {};

    if (!currentPassword) {
      nextFieldErrors.currentPassword = text.requiredField;
    }

    if (!newPassword) {
      nextFieldErrors.newPassword = text.requiredField;
    }

    if (!confirmPassword) {
      nextFieldErrors.confirmPassword = text.requiredField;
    }

    if (newPassword && confirmPassword && newPassword !== confirmPassword) {
      nextFieldErrors.confirmPassword = text.mismatchError;
    }

    if (newPassword && currentPassword && newPassword === currentPassword) {
      nextFieldErrors.newPassword = text.reusedError;
    }

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      setStatus({
        tone: "warning",
        message: nextFieldErrors.newPassword || nextFieldErrors.confirmPassword || text.genericError,
      });
      return;
    }

    const policyResult = validateUserPasswordPolicy({
      password: newPassword,
    });

    if (!policyResult.ok) {
      const policyError = getPasswordPolicyErrorMessage({
        locale,
        code: policyResult.code,
        fallback: policyResult.error,
      });
      setFieldErrors({
        newPassword: policyError,
      });
      setStatus({
        tone: "warning",
        message: `${text.policyTitle}: ${policyError}`,
      });
      return;
    }

    setFieldErrors({});
    setBusy(true);
    setStatus({
      tone: "pending",
      message: text.submitWorking,
    });

    try {
      const response = await fetch(PASSWORD_CHANGE_API_ROUTE, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });

      const payload = await readApiResult<PasswordChangeResponse>(response);

      if (!response.ok || !payload.ok) {
        const code = payload.ok ? "PASSWORD_CHANGE_UPDATE_FAILED" : payload.error.code;
        const apiFieldErrors = payload.ok ? {} : payload.error.fieldErrors || {};
        const payloadErrorMessage = payload.ok ? text.genericError : payload.error.message;

        if (code === "PASSWORD_CHANGE_CURRENT_PASSWORD_INVALID") {
          setFieldErrors({
            currentPassword: text.invalidCurrentError,
          });
          setStatus({
            tone: "warning",
            message: text.invalidCurrentError,
          });
          return;
        }

        if (code === "PASSWORD_POLICY_FAILED") {
          const policyError = apiFieldErrors.newPassword || payloadErrorMessage || text.genericError;
          setFieldErrors({
            newPassword: policyError,
          });
          setStatus({
            tone: "warning",
            message: `${text.policyTitle}: ${policyError}`,
          });
          return;
        }

        if (code === "PASSWORD_CHANGE_RATE_LIMITED") {
          setStatus({
            tone: "warning",
            message: text.rateLimitedError,
          });
          return;
        }

        if (code === "PASSWORD_CHANGE_UNAVAILABLE") {
          setStatus({
            tone: "danger",
            message: text.unavailableError,
          });
          return;
        }

        setStatus({
          tone: "danger",
          message: payloadErrorMessage || text.genericError,
        });
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setStatus({
        tone: "success",
        message: payload.data.requiresReauth ? text.reauthMessage : text.successMessage,
      });

      // Password change requires a fresh session boundary; enforce immediate sign-out and login renewal.
      await forceReauthenticate();
    } catch {
      setStatus({
        tone: "danger",
        message: text.genericError,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-[1.5rem] border border-white/20 bg-white/56 p-4 shadow-[0_18px_48px_rgba(2,6,23,0.07)] backdrop-blur-xl dark:border-white/8 dark:bg-slate-950/38 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/24 bg-emerald-500/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-emerald-700 dark:border-emerald-400/24 dark:bg-emerald-400/10 dark:text-emerald-200">
          <ShieldCheck className="h-3.5 w-3.5" />
          {text.sectionLabel}
        </span>
      </div>

      <div className="mt-4 space-y-1.5">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-black tracking-[-0.03em] text-zinc-950 dark:text-white sm:text-2xl">
          {text.title}
        </h2>
        <p className="max-w-3xl text-sm leading-6 text-foreground-muted">
          {text.subtitle}
        </p>
      </div>

      <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
        <label className="space-y-2 block">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground-muted">
            {text.currentPasswordLabel}
          </span>
          <PasswordVisibilityInput
            value={currentPassword}
            onChange={(event) => {
              setCurrentPassword(event.target.value);
              if (fieldErrors.currentPassword) {
                setFieldErrors((previous) => ({
                  ...previous,
                  currentPassword: "",
                }));
              }
            }}
            className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm font-medium text-foreground shadow-[0_10px_26px_rgba(15,23,42,0.05)] transition-all focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/10"
            autoComplete="current-password"
            disabled={busy}
            required
            showPasswordLabel={text.showPassword}
            hidePasswordLabel={text.hidePassword}
          />
          {fieldErrors.currentPassword ? (
            <p className="text-xs font-semibold text-rose-600 dark:text-rose-300">
              {fieldErrors.currentPassword}
            </p>
          ) : null}
        </label>

        <label className="space-y-2 block">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground-muted">
            {text.newPasswordLabel}
          </span>
          <PasswordVisibilityInput
            value={newPassword}
            onChange={(event) => {
              setNewPassword(event.target.value);
              if (fieldErrors.newPassword) {
                setFieldErrors((previous) => ({
                  ...previous,
                  newPassword: "",
                }));
              }
            }}
            className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm font-medium text-foreground shadow-[0_10px_26px_rgba(15,23,42,0.05)] transition-all focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/10"
            autoComplete="new-password"
            disabled={busy}
            required
            minLength={passwordMinLength}
            showPasswordLabel={text.showPassword}
            hidePasswordLabel={text.hidePassword}
          />
          {fieldErrors.newPassword ? (
            <p className="text-xs font-semibold text-rose-600 dark:text-rose-300">
              {fieldErrors.newPassword}
            </p>
          ) : null}
        </label>

        <label className="space-y-2 block">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground-muted">
            {text.confirmPasswordLabel}
          </span>
          <PasswordVisibilityInput
            value={confirmPassword}
            onChange={(event) => {
              setConfirmPassword(event.target.value);
              if (fieldErrors.confirmPassword) {
                setFieldErrors((previous) => ({
                  ...previous,
                  confirmPassword: "",
                }));
              }
            }}
            className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm font-medium text-foreground shadow-[0_10px_26px_rgba(15,23,42,0.05)] transition-all focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/10"
            autoComplete="new-password"
            disabled={busy}
            required
            minLength={passwordMinLength}
            showPasswordLabel={text.showPassword}
            hidePasswordLabel={text.hidePassword}
          />
          {fieldErrors.confirmPassword ? (
            <p className="text-xs font-semibold text-rose-600 dark:text-rose-300">
              {fieldErrors.confirmPassword}
            </p>
          ) : null}
        </label>

        <p className="rounded-2xl border border-border bg-background/60 px-3.5 py-3 text-xs leading-5 text-foreground-muted">
          {policyHint}
        </p>

        <p className={`rounded-xl border px-3 py-2 text-sm font-medium ${resolveStatusClassName(status.tone)}`}>
          {status.message}
        </p>

        <button
          type="submit"
          disabled={busy}
          aria-busy={busy}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-600 px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-white shadow-[0_10px_30px_rgba(16,185,129,0.28)] transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          <span>{busy ? text.submitWorking : text.submitAction}</span>
        </button>
      </form>
    </section>
  );
}
