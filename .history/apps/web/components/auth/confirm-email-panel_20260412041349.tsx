"use client";

import { APP_ROUTES } from "@zootopia/shared-config";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { AuthStatus } from "@/components/auth/auth-status";
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
import type { AuthStatusDescriptor } from "@/components/auth/auth-feedback";

export type ConfirmEmailFlow = "sign_in" | "sign_up" | "admin";

type ConfirmEmailPanelProps = {
  messages: AppMessages;
  supabaseAuthReady: boolean;
  initialEmail: string;
  flow: ConfirmEmailFlow;
  fromRoute: string;
};

const RESEND_COOLDOWN_SECONDS = 30;

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function resolveReturnRoute(flow: ConfirmEmailFlow, fromRoute: string) {
  if (fromRoute === APP_ROUTES.adminLogin || flow === "admin") {
    return APP_ROUTES.adminLogin;
  }

  return APP_ROUTES.login;
}

function mapConfirmEmailFailure(
  failure: NormalizedAuthFailure,
  messages: AppMessages,
): AuthStatusDescriptor {
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

export function ConfirmEmailPanel({
  messages,
  supabaseAuthReady,
  initialEmail,
  flow,
  fromRoute,
}: ConfirmEmailPanelProps) {
  const [email, setEmail] = useState(initialEmail);
  const [status, setStatus] = useState<AuthStatusDescriptor | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const supabaseConfigured = isSupabaseWebConfigured();

  const returnRoute = useMemo(() => resolveReturnRoute(flow, fromRoute), [flow, fromRoute]);
  const flowKind = flow === "admin" ? "admin" : "user";

  useEffect(() => {
    if (!supabaseConfigured) {
      return;
    }

    void primeEphemeralSupabaseClient().catch(() => {
      // Keep retry logic in submit path so users receive explicit runtime diagnostics.
    });
  }, [supabaseConfigured]);

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

  const normalizedEmail = email.trim();
  const hasValidEmail = isValidEmail(normalizedEmail);
  const disabled =
    !supabaseConfigured
    || !supabaseAuthReady
    || isSending
    || cooldownSeconds > 0
    || !hasValidEmail;

  const blockingStatus =
    !supabaseConfigured
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

  const visibleStatus = blockingStatus ?? status ?? idleStatus;
  const resendLabel =
    isSending
      ? messages.confirmEmailResendWorking
      : cooldownSeconds > 0
        ? `${messages.confirmEmailResendCooldownPrefix} ${cooldownSeconds}s`
        : messages.confirmEmailResendAction;

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
      const supabase = await getEphemeralSupabaseClient();

      // Keep email-link return ownership on the login lanes so users re-enter the same auth boundary
      // after confirmation, instead of landing in protected pages without a hydrated server session.
      const emailRedirectTo = `${window.location.origin}${returnRoute}`;
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: normalizedEmail,
        options: {
          emailRedirectTo,
        },
      });

      if (error) {
        throw error;
      }

      setCooldownSeconds(RESEND_COOLDOWN_SECONDS);
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
                  if (!isSending) {
                    setStatus(null);
                  }
                }}
                placeholder={messages.confirmEmailEmailPlaceholder}
                autoComplete="email"
                className="w-full rounded-2xl border border-border bg-background px-4 py-3.5 text-sm font-medium text-foreground shadow-[0_12px_30px_rgba(15,23,42,0.05)] transition-all focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 placeholder:text-foreground-muted/80"
              />
            </label>

            <button
              type="submit"
              disabled={disabled}
              aria-busy={isSending}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3.5 font-bold text-white shadow-[0_14px_30px_rgba(5,150,105,0.25)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_34px_rgba(5,150,105,0.32)] active:scale-[0.98] disabled:opacity-50"
            >
              <span>{resendLabel}</span>
              {isSending ? <LoaderCircle className="h-5 w-5 animate-spin text-white" aria-hidden="true" /> : null}
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
