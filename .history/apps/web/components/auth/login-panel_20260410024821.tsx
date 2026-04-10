"use client";

import { APP_ROUTES } from "@zootopia/shared-config";
import type { ApiResult, Locale, SessionUser } from "@zootopia/shared-types";
import { LoaderCircle, LogIn, Mail, Shield, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  createAuthFlowError,
  mapRegularLoginError,
  type AuthStatusDescriptor,
  type AuthSupportNote,
} from "@/components/auth/auth-feedback";
import {
  AuthStatus,
  AuthSupportDetails,
} from "@/components/auth/auth-status";
import type { AppMessages } from "@/lib/messages";
import {
  getEphemeralSupabaseClient,
  getSupabaseClient,
  isSupabaseWebConfigured,
  primeEphemeralSupabaseClient,
} from "@/lib/supabase/client";

type LoginPanelProps = {
  messages: AppMessages;
  locale: Locale;
  supabaseAuthReady: boolean;
};

type LoginPhase = "idle" | "authenticating" | "bootstrapping" | "success_handoff";
type LoginMode = "sign_in" | "sign_up";

const BOOTSTRAP_TIMEOUT_MS = 20_000;

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
      emailVerificationRequired:
        "تم إنشاء الحساب. راجع بريدك الإلكتروني لتأكيد الحساب ثم عد لتسجيل الدخول.",
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
    emailVerificationRequired:
      "Account created. Verify your email, then return to sign in.",
  };
}

async function readApiResult<T>(response: Response, invalidCode: string) {
  try {
    return (await response.json()) as ApiResult<T>;
  } catch {
    throw createAuthFlowError(invalidCode);
  }
}

function mapSupabaseBrowserError(error: { code?: string; message?: string }, mode: LoginMode) {
  const code = String(error.code || "").toLowerCase();
  const message = String(error.message || "");

  if (code === "invalid_credentials" || code === "invalid_login_credentials") {
    return createAuthFlowError("INVALID_CREDENTIALS", message);
  }

  if (code === "email_not_confirmed") {
    return createAuthFlowError("EMAIL_NOT_CONFIRMED", message);
  }

  if (code === "over_request_rate_limit") {
    return createAuthFlowError("AUTH_RATE_LIMITED", message);
  }

  if (mode === "sign_up") {
    return createAuthFlowError("SIGNUP_FAILED", message);
  }

  return createAuthFlowError("SIGNIN_FAILED", message);
}

export function LoginPanel({
  messages,
  locale,
  supabaseAuthReady,
}: LoginPanelProps) {
  const router = useRouter();
  const bootstrapRequestRef = useRef<Promise<void> | null>(null);
  const [mode, setMode] = useState<LoginMode>("sign_in");
  const [phase, setPhase] = useState<LoginPhase>("idle");
  const [status, setStatus] = useState<AuthStatusDescriptor | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const supabaseConfigured = isSupabaseWebConfigured();
  const isBusy = phase !== "idle";
  const localText = buildLocalText(locale);

  useEffect(() => {
    if (!supabaseConfigured) {
      return;
    }

    void primeEphemeralSupabaseClient().catch(() => {
      // Surface concrete configuration errors during active submit flows.
    });
  }, [supabaseConfigured]);

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

  const bootstrapSession = useCallback(async (idToken: string) => {
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
        const response = await fetch("/api/auth/bootstrap", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          credentials: "same-origin",
          body: JSON.stringify({ idToken }),
          signal: controller.signal,
        });

        const payload = await readApiResult<{
          user: SessionUser;
          redirectTo: string;
        }>(response, "BOOTSTRAP_RESPONSE_INVALID");

        if (!response.ok || !payload.ok) {
          throw createAuthFlowError(
            payload.ok ? "BOOTSTRAP_FAILED" : payload.error.code,
            payload.ok ? undefined : payload.error.message,
          );
        }

        setPhase("success_handoff");
        setStatus({
          tone: "success",
          icon: "success",
          title: messages.loginStatusSuccessTitle,
          body: messages.loginStatusSuccessBody,
        });
        await clearClientSession();
        router.replace(payload.data.redirectTo || APP_ROUTES.upload);
        router.refresh();
      } catch (nextError) {
        if (nextError instanceof DOMException && nextError.name === "AbortError") {
          throw createAuthFlowError("BOOTSTRAP_TIMEOUT");
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
  }, [clearClientSession, messages, router, setFinishingStatus]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabaseConfigured || isBusy) {
      return;
    }

    if (!email.trim() || !password) {
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

    setPhase("authenticating");
    setStatus({
      tone: "info",
      icon: "working",
      title: messages.loginStatusWorkingTitle,
      body: messages.loginStatusWorkingBody,
    });

    try {
      const supabase = await getEphemeralSupabaseClient();

      if (mode === "sign_up") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });

        if (error) {
          throw mapSupabaseBrowserError(error, mode);
        }

        if (!data.session?.access_token) {
          setPhase("idle");
          setStatus({
            tone: "success",
            icon: "success",
            title: localText.signUpTab,
            body: localText.emailVerificationRequired,
          });
          setMode("sign_in");
          setConfirmPassword("");
          return;
        }

        await bootstrapSession(data.session.access_token);
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        throw mapSupabaseBrowserError(error, mode);
      }

      if (!data.session?.access_token) {
        throw createAuthFlowError("SIGNIN_FAILED", "Missing Supabase access token.");
      }

      await bootstrapSession(data.session.access_token);
    } catch (nextError) {
      await clearClientSession();
      setPhase("idle");
      setStatus(mapRegularLoginError(nextError, messages));
    }
  }

  const disabled = !supabaseConfigured || isBusy;
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
    mode === "sign_up"
      ? (isBusy ? messages.loginCtaWorking : localText.signUpButton)
      : (isBusy ? messages.loginCtaWorking : localText.signInButton);

  return (
    <div className="relative mx-auto w-full max-w-[440px] overflow-hidden rounded-[2rem] border border-white/15 bg-white/88 p-6 shadow-2xl shadow-black/20 backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-700 dark:bg-zinc-950/72 dark:shadow-black/50 sm:rounded-[2.25rem] sm:p-8">
      <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-emerald-500 opacity-20 blur-3xl transition-opacity duration-700 dark:opacity-30" />
      <div className="pointer-events-none absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-emerald-500 opacity-20 blur-3xl transition-opacity duration-700 dark:opacity-30" />

      <div className="relative z-10 space-y-6">
        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-border bg-background-elevated/70 p-1">
          <button
            type="button"
            onClick={() => {
              setMode("sign_in");
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
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
              {localText.emailLabel}
            </span>
            <div className="flex items-center gap-2 rounded-2xl border border-zinc-200/80 bg-white/95 px-4 py-3 dark:border-zinc-700/70 dark:bg-zinc-900/70">
              <Mail className="h-4.5 w-4.5 text-zinc-400" />
              <input
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (phase === "idle") {
                    setStatus(null);
                  }
                }}
                autoComplete={mode === "sign_up" ? "email" : "username"}
                className="w-full bg-transparent text-sm font-medium text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100"
                placeholder="name@university.edu"
                required
              />
            </div>
          </label>

          <label className="space-y-2 block">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
              {localText.passwordLabel}
            </span>
            <input
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                if (phase === "idle") {
                  setStatus(null);
                }
              }}
              autoComplete={mode === "sign_up" ? "new-password" : "current-password"}
              className="w-full rounded-2xl border border-zinc-200/80 bg-white/95 px-4 py-3.5 text-sm font-medium text-zinc-900 shadow-[0_12px_30px_rgba(15,23,42,0.05)] transition-all focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 dark:border-zinc-700/70 dark:bg-zinc-900/70 dark:text-zinc-100 dark:placeholder:text-zinc-500"
              placeholder="••••••••"
              required
              minLength={8}
            />
          </label>

          {mode === "sign_up" ? (
            <label className="space-y-2 block">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                {localText.confirmPasswordLabel}
              </span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                  if (phase === "idle") {
                    setStatus(null);
                  }
                }}
                autoComplete="new-password"
                className="w-full rounded-2xl border border-zinc-200/80 bg-white/95 px-4 py-3.5 text-sm font-medium text-zinc-900 shadow-[0_12px_30px_rgba(15,23,42,0.05)] transition-all focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 dark:border-zinc-700/70 dark:bg-zinc-900/70 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                placeholder="••••••••"
                required
                minLength={8}
              />
            </label>
          ) : null}

          <button
            type="submit"
            disabled={disabled}
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
