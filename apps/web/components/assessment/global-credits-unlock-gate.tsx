"use client";

import { LockKeyhole, Sparkles } from "lucide-react";
import { useState } from "react";

import { AssessmentCreditDetailsPanel } from "@/components/assessment/assessment-credit-details-panel";
import type { AppMessages } from "@/lib/messages";
import type { Locale } from "@zootopia/shared-types";

type GlobalCreditsUnlockGateProps = {
  locale: Locale;
  messages: AppMessages;
  initialAccess: {
    lockEnabled: boolean;
    unlocked: boolean;
    isAdmin: boolean;
  };
};

type GlobalCreditsUnlockResponse = {
  unlocked: boolean;
  lockEnabled: boolean;
};

function getGlobalCreditsGateCopy(locale: Locale) {
  return locale === "ar"
    ? {
        title: "هذه الصفحة محمية بكلمة مرور المطوّر",
        body:
          "للاطلاع على صفحة الرصيد العام لهذا الحساب، أدخل كلمة المرور التي يحددها المطوّر من إعدادات البيئة.",
        passwordLabel: "كلمة المرور",
        passwordPlaceholder: "أدخل كلمة مرور صفحة الرصيد العام",
        unlockAction: "فتح الصفحة",
        unlockActionPending: "جارٍ التحقق...",
        passwordRequired: "يرجى إدخال كلمة المرور أولاً.",
        invalidPassword: "كلمة المرور غير صحيحة.",
        misconfigured:
          "تعذر فتح الصفحة حالياً بسبب إعداد داخلي في الخادم. تواصل مع المطوّر.",
        genericFailure: "تعذر فتح الصفحة حالياً. حاول مرة أخرى بعد قليل.",
      }
    : {
        title: "This page is protected by a developer password",
        body:
          "Enter the env-configured password to open this account's global credit page.",
        passwordLabel: "Password",
        passwordPlaceholder: "Enter global credit page password",
        unlockAction: "Unlock page",
        unlockActionPending: "Verifying...",
        passwordRequired: "Please enter the password first.",
        invalidPassword: "Invalid password.",
        misconfigured:
          "The global credit page lock is currently misconfigured on the server.",
        genericFailure: "Unable to unlock this page right now. Please try again.",
      };
}

function resolveUnlockErrorMessage(input: {
  locale: Locale;
  errorCode: string | null;
  fallbackMessage: string | null;
}) {
  const copy = getGlobalCreditsGateCopy(input.locale);
  switch (input.errorCode) {
    case "GLOBAL_CREDIT_PAGE_UNLOCK_PASSWORD_REQUIRED":
      return copy.passwordRequired;
    case "GLOBAL_CREDIT_PAGE_UNLOCK_INVALID_PASSWORD":
      return copy.invalidPassword;
    case "GLOBAL_CREDIT_PAGE_LOCK_MISCONFIGURED":
      return copy.misconfigured;
    default:
      return input.fallbackMessage?.trim() || copy.genericFailure;
  }
}

export function GlobalCreditsUnlockGate({
  locale,
  messages,
  initialAccess,
}: GlobalCreditsUnlockGateProps) {
  const [access, setAccess] = useState(initialAccess);
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copy = getGlobalCreditsGateCopy(locale);

  if (!access.lockEnabled || access.unlocked || access.isAdmin) {
    return (
      <AssessmentCreditDetailsPanel
        locale={locale}
        messages={messages}
      />
    );
  }

  async function handleUnlock() {
    if (pending) {
      return;
    }

    if (!password.trim()) {
      setError(copy.passwordRequired);
      return;
    }

    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/assessment/credits/page-unlock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const payload = (await response.json()) as
        | { ok: true; data: GlobalCreditsUnlockResponse }
        | { ok: false; error: { code: string; message: string } };

      if (!response.ok || !payload.ok || !payload.data.unlocked) {
        setError(
          resolveUnlockErrorMessage({
            locale,
            errorCode: payload.ok ? null : payload.error.code,
            fallbackMessage: payload.ok ? null : payload.error.message,
          }),
        );
        return;
      }

      setAccess((current) => ({
        ...current,
        lockEnabled: payload.data.lockEnabled,
        unlocked: payload.data.unlocked,
      }));
      setPassword("");
      setError(null);
    } catch {
      setError(copy.genericFailure);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="surface-strong rounded-[2rem] p-5 sm:p-6 lg:p-8">
      <div className="rounded-[1.4rem] border border-amber-500/25 bg-[linear-gradient(145deg,rgba(251,191,36,0.1),rgba(245,158,11,0.06))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-500/35 bg-amber-500/15 text-amber-800 dark:text-amber-200">
            <LockKeyhole className="h-4 w-4" />
          </span>
          <div className="min-w-0 space-y-2">
            <p className="text-sm font-semibold leading-7 text-foreground">{copy.title}</p>
            <p className="text-sm leading-7 text-foreground-muted">{copy.body}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="space-y-2">
            <span className="block text-xs font-semibold text-foreground-muted">
              {copy.passwordLabel}
            </span>
            <input
              type="password"
              value={password}
              onChange={(event) => {
                setError(null);
                setPassword(event.target.value);
              }}
              placeholder={copy.passwordPlaceholder}
              className="field-control assessment-premium-field w-full"
              autoComplete="current-password"
              disabled={pending}
            />
          </label>

          <button
            type="button"
            onClick={() => {
              void handleUnlock();
            }}
            disabled={pending}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-emerald-500/35 bg-emerald-500/15 px-4 text-sm font-semibold text-emerald-700 transition hover:border-emerald-500/50 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-70 dark:text-emerald-200"
          >
            {pending ? (
              <span className="loading-spinner h-3.5 w-3.5 border-2" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {pending ? copy.unlockActionPending : copy.unlockAction}
          </button>
        </div>

        {error ? (
          <p className="mt-3 text-sm text-danger">{error}</p>
        ) : null}
      </div>
    </section>
  );
}
