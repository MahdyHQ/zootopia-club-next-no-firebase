"use client";

import { APP_ROUTES } from "@zootopia/shared-config";
import type { ApiResult, Locale, SessionUser } from "@zootopia/shared-types";
import { Eye, EyeOff, LoaderCircle, LogIn, Mail, Shield, UserPlus } from "lucide-react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  createAuthFlowError,
  createAuthFlowErrorWithDetails,
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
import {
  getEphemeralSupabaseClient,
  getSupabaseClient,
  isSupabaseWebConfigured,
  primeEphemeralSupabaseClient,
} from "@/lib/supabase/client";
import { buildClientAuthDeviceLabelMetadata } from "@/lib/auth-device-label";

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

async function completeAuthJsCredentialsSignIn(input: {
  providerId: "user-credentials";
  idToken: string;
  deviceLabel: string | null;
  deviceLabelSource: string | null;
  deviceLabelConfidence: number | null;
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
  const bootstrapRequestRef = useRef<Promise<void> | null>(null);
  const [mode, setMode] = useState<LoginMode>("sign_in");
  const [phase, setPhase] = useState<LoginPhase>("idle");
  const [status, setStatus] = useState<AuthStatusDescriptor | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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

  const bootstrapSession = useCallback(async (input: {
    idToken: string;
    deviceLabel: string | null;
    deviceLabelSource: string | null;
    deviceLabelConfidence: number | null;
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
        await clearClientSession();

        const redirectTo = settled.role === "admin"
          ? APP_ROUTES.admin
          : settled.profileCompleted
            ? APP_ROUTES.upload
            : APP_ROUTES.settings;
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
  }, [clearClientSession, messages, router, setFinishingStatus]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

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

    if (!supabaseConfigured || !supabaseAuthReady || isBusy) {
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
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
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
          /* Supabase sign-up may intentionally omit a session until email confirmation is complete.
             Route the user to the dedicated confirmation surface instead of mislabeling this as a refresh/session bug. */
          const confirmRoute = buildConfirmEmailRoute({
            email: email.trim(),
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
          setMode("sign_in");
          setConfirmPassword("");
          router.push(confirmRoute);
          return;
        }

        const deviceMetadata = buildClientAuthDeviceLabelMetadata();
        await bootstrapSession({
          idToken: data.session.access_token,
          deviceLabel: deviceMetadata.deviceLabel,
          deviceLabelSource: deviceMetadata.deviceLabelSource,
          deviceLabelConfidence: deviceMetadata.deviceLabelConfidence,
        });
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
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

      const deviceMetadata = buildClientAuthDeviceLabelMetadata();
      await bootstrapSession({
        idToken: data.session.access_token,
        deviceLabel: deviceMetadata.deviceLabel,
        deviceLabelSource: deviceMetadata.deviceLabelSource,
        deviceLabelConfidence: deviceMetadata.deviceLabelConfidence,
      });
    } catch (nextError) {
      const failure = normalizeAuthFailure({
        error: nextError,
        flow: "user",
        stage: "AUTH_STAGE_E_SESSION_HYDRATION",
        routePath: APP_ROUTES.login,
        sessionCreationAttempted: true,
      });

      if (isEmailConfirmationFailure(failure) && email.trim().length > 0) {
        /* When provider/auth traces point to unconfirmed email, preserve diagnosis fidelity by
           redirecting to confirmation guidance instead of showing generic session refresh messaging. */
        const confirmRoute = buildConfirmEmailRoute({
          email: email.trim(),
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

      logAuthDiagnosis({
        failure,
        uxAction:
          failure.normalizedCode === "AUTH_SESSION_REFRESH_REQUIRED"
            ? "refresh_session"
            : "show_error",
      });

      await clearClientSession();
      setPhase("idle");
      setStatus(mapRegularLoginError(nextError, messages));
    }
  }

  const disabled = !supabaseConfigured || !supabaseAuthReady || isBusy;
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
    <div className="relative mx-auto w-full max-w-[440px] overflow-hidden rounded-[2rem] border border-border bg-background-elevated/90 p-6 shadow-2xl shadow-black/20 backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-700 sm:rounded-[2.25rem] sm:p-8">
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
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground-muted">
                {localText.passwordLabel}
              </span>
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="inline-flex items-center justify-center text-foreground-muted transition-colors hover:text-foreground"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <input
              type={showPassword ? "text" : "password"}
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
              minLength={8}
            />
          </label>

          {mode === "sign_up" ? (
            <label className="space-y-2 block">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground-muted">
                  {localText.confirmPasswordLabel}
                </span>
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((value) => !value)}
                  className="inline-flex items-center justify-center text-foreground-muted transition-colors hover:text-foreground"
                  aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <input
                type={showConfirmPassword ? "text" : "password"}
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
