"use client";

import { APP_ROUTES } from "@zootopia/shared-config";
import type { ApiResult, Locale } from "@zootopia/shared-types";
import { ArrowLeft, LoaderCircle, Mail } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import type { AuthStatusDescriptor } from "@/components/auth/auth-feedback";
import { AuthStatus } from "@/components/auth/auth-status";

type ForgotPasswordPanelProps = {
  locale: Locale;
  supabaseAuthReady: boolean;
  initialEmail?: string;
};

type ForgotPasswordResponse = {
  accepted: boolean;
};

const FORGOT_PASSWORD_API_ROUTE = "/api/auth/password/forgot";

function buildLocalText(locale: Locale) {
  if (locale === "ar") {
    return {
      emailLabel: "البريد الإلكتروني للحساب",
      emailPlaceholder: "name@university.edu",
      sendAction: "إرسال رابط إعادة التعيين",
      sendWorking: "جاري إرسال الرابط...",
      backToLogin: "العودة إلى تسجيل الدخول",
      idleTitle: "استعد كلمة المرور بأمان",
      idleBody: "أدخل بريدك المسجل وسنرسل رابط إعادة تعيين كلمة المرور إذا كان الحساب متاحاً.",
      workingTitle: "جاري تجهيز رابط إعادة التعيين",
      workingBody: "نرسل الآن طلب إعادة التعيين عبر المسار الآمن.",
      successTitle: "تم استلام الطلب",
      successBody:
        "إذا كان البريد يطابق حساباً عادياً، ستصلك رسالة فيها رابط إعادة التعيين. افحص البريد الوارد والرسائل غير المرغوبة.",
      invalidEmailTitle: "أدخل بريداً إلكترونياً صالحاً",
      invalidEmailBody: "استخدم البريد الكامل المرتبط بحسابك.",
      adminBlockedTitle: "هذا البريد يستخدم مسار المشرف",
      adminBlockedBody: "حسابات المشرف تُدار من صفحة دخول المشرف فقط.",
      rateLimitTitle: "محاولات كثيرة في وقت قصير",
      rateLimitBody: "انتظر قليلاً ثم أعد المحاولة.",
      rateLimitAccountBody: "تم تجاوز حد هذا الحساب مؤقتاً. أعد المحاولة لاحقاً.",
      rateLimitIpBody: "تم تجاوز حد هذه الشبكة مؤقتاً. أعد المحاولة لاحقاً.",
      unavailableTitle: "الخدمة غير متاحة حالياً",
      unavailableBody: "خدمة إعادة التعيين غير جاهزة الآن. حاول بعد قليل.",
      genericErrorTitle: "تعذر إرسال رابط إعادة التعيين",
      genericErrorBody: "حاول مرة أخرى بعد قليل.",
      privacyNotice:
        "لأسباب أمنية، لا نكشف ما إذا كان البريد مسجلاً أم لا. يتم إرجاع نفس نتيجة النجاح عند القبول.",
    };
  }

  return {
    emailLabel: "Account email",
    emailPlaceholder: "name@university.edu",
    sendAction: "Send reset link",
    sendWorking: "Sending reset link...",
    backToLogin: "Back to login",
    idleTitle: "Recover your password securely",
    idleBody:
      "Enter your account email and we will send a reset link if the account is eligible.",
    workingTitle: "Preparing reset link",
    workingBody: "We are sending your password reset request through the secure runtime.",
    successTitle: "Request accepted",
    successBody:
      "If this email belongs to a regular account, a reset link will be sent. Check inbox and spam for the latest message.",
    invalidEmailTitle: "Enter a valid email address",
    invalidEmailBody: "Use the full email tied to your account.",
    adminBlockedTitle: "This email uses the admin lane",
    adminBlockedBody: "Admin accounts are managed from the dedicated admin login page.",
    rateLimitTitle: "Too many attempts right now",
    rateLimitBody: "Please wait a moment before trying again.",
    rateLimitAccountBody: "This account reached the current reset request limit. Retry later.",
    rateLimitIpBody: "This network reached the current reset request limit. Retry later.",
    unavailableTitle: "Service temporarily unavailable",
    unavailableBody: "Password reset runtime is not ready right now. Please retry shortly.",
    genericErrorTitle: "Reset link could not be sent",
    genericErrorBody: "Please try again in a moment.",
    privacyNotice:
      "For security privacy, we do not reveal whether an email exists. Successful acceptance returns the same response shape.",
  };
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function readApiResult<T>(response: Response) {
  try {
    return (await response.json()) as ApiResult<T>;
  } catch {
    return {
      ok: false,
      error: {
        code: "INVALID_JSON",
        message: "Invalid server response.",
      },
    };
  }
}

function mapForgotFailure(code: string, text: ReturnType<typeof buildLocalText>): AuthStatusDescriptor {
  switch (code) {
    case "PASSWORD_RESET_EMAIL_REQUIRED":
    case "PASSWORD_RESET_EMAIL_INVALID":
      return {
        tone: "warning",
        icon: "warning",
        title: text.invalidEmailTitle,
        body: text.invalidEmailBody,
      };
    case "ADMIN_PASSWORD_FLOW_UNSUPPORTED":
      return {
        tone: "warning",
        icon: "permission",
        title: text.adminBlockedTitle,
        body: text.adminBlockedBody,
      };
    case "PASSWORD_RESET_RATE_LIMITED":
      return {
        tone: "warning",
        icon: "warning",
        title: text.rateLimitTitle,
        body: text.rateLimitBody,
      };
    case "PASSWORD_RESET_RATE_LIMITED_ACCOUNT":
      return {
        tone: "warning",
        icon: "warning",
        title: text.rateLimitTitle,
        body: text.rateLimitAccountBody,
      };
    case "PASSWORD_RESET_RATE_LIMITED_IP":
      return {
        tone: "warning",
        icon: "warning",
        title: text.rateLimitTitle,
        body: text.rateLimitIpBody,
      };
    case "PASSWORD_RESET_UNAVAILABLE":
      return {
        tone: "danger",
        icon: "config",
        title: text.unavailableTitle,
        body: text.unavailableBody,
        live: "assertive",
      };
    default:
      return {
        tone: "danger",
        icon: "danger",
        title: text.genericErrorTitle,
        body: text.genericErrorBody,
        live: "assertive",
      };
  }
}

export function ForgotPasswordPanel({
  locale,
  supabaseAuthReady,
  initialEmail = "",
}: ForgotPasswordPanelProps) {
  const text = useMemo(() => buildLocalText(locale), [locale]);
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<AuthStatusDescriptor | null>({
    tone: "neutral",
    icon: "info",
    title: text.idleTitle,
    body: text.idleBody,
    live: "off",
  });

  const disabled = busy || !supabaseAuthReady;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();
    if (!isValidEmail(normalizedEmail)) {
      setStatus({
        tone: "warning",
        icon: "warning",
        title: text.invalidEmailTitle,
        body: text.invalidEmailBody,
      });
      return;
    }

    if (!supabaseAuthReady) {
      setStatus({
        tone: "danger",
        icon: "config",
        title: text.unavailableTitle,
        body: text.unavailableBody,
        live: "assertive",
      });
      return;
    }

    setBusy(true);
    setStatus({
      tone: "info",
      icon: "working",
      title: text.workingTitle,
      body: text.workingBody,
    });

    try {
      const response = await fetch(FORGOT_PASSWORD_API_ROUTE, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ email: normalizedEmail }),
      });

      const payload = await readApiResult<ForgotPasswordResponse>(response);
      if (!response.ok || !payload.ok) {
        const code = payload.ok ? "PASSWORD_RESET_REQUEST_FAILED" : payload.error.code;
        setStatus(mapForgotFailure(code, text));
        return;
      }

      setStatus({
        tone: "success",
        icon: "success",
        title: text.successTitle,
        body: text.successBody,
      });
    } catch {
      setStatus({
        tone: "danger",
        icon: "danger",
        title: text.genericErrorTitle,
        body: text.genericErrorBody,
        live: "assertive",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative isolate mx-auto w-full max-w-[440px] overflow-hidden rounded-[2rem] border border-border bg-background-elevated/90 p-6 shadow-2xl shadow-black/16 backdrop-blur-2xl sm:rounded-[2.25rem] sm:p-8">
      <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-emerald-500 opacity-20 blur-3xl transition-opacity duration-700 dark:opacity-30" />
      <div className="pointer-events-none absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-emerald-500 opacity-20 blur-3xl transition-opacity duration-700 dark:opacity-30" />

      <div className="relative z-10 space-y-6">
        <AuthStatus status={status} />

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="space-y-2 block">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground-muted">
              {text.emailLabel}
            </span>
            <div className="flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-3">
              <Mail className="h-4.5 w-4.5 text-foreground-muted" />
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                className="w-full bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-foreground-muted/80"
                placeholder={text.emailPlaceholder}
                required
              />
            </div>
          </label>

          <button
            type="submit"
            disabled={disabled}
            aria-busy={busy}
            className="group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-2xl bg-emerald-600 px-5 py-3.5 text-[1rem] font-semibold text-white shadow-[0_8px_24px_rgba(16,185,129,0.3)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-emerald-500 disabled:opacity-60 disabled:hover:translate-y-0"
          >
            {busy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : null}
            <span>{busy ? text.sendWorking : text.sendAction}</span>
          </button>
        </form>

        <p className="rounded-2xl border border-border bg-background/60 px-3.5 py-3 text-xs leading-5 text-foreground-muted">
          {text.privacyNotice}
        </p>

        <Link
          href={APP_ROUTES.login}
          className="inline-flex items-center gap-2 text-sm font-semibold text-foreground-muted transition hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {text.backToLogin}
        </Link>
      </div>
    </div>
  );
}
