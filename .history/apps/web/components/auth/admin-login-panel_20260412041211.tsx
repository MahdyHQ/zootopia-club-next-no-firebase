"use client";

import { APP_ROUTES } from "@zootopia/shared-config";
import type { ApiResult, AdminIdentifierResolution } from "@zootopia/shared-types";
import { Eye, EyeOff, GraduationCap, LoaderCircle } from "lucide-react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  createAuthFlowError,
  createAuthFlowErrorWithDetails,
  mapAdminLoginError,
  type AuthStatusDescriptor,
} from "@/components/auth/auth-feedback";
import { AuthStatus } from "@/components/auth/auth-status";
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
import { readCredentialsSignInErrorCode } from "@/components/auth/signin-result";

type AdminLoginPanelProps = {
  messages: AppMessages;
  supabaseAuthReady: boolean;
};

type AdminLoginPhase =
  | "idle"
  | "resolving"
  | "signing_in"
  | "bootstrapping"
  | "success_handoff";

const ADMIN_SESSION_BOOTSTRAP_MAX_ATTEMPTS = 40;
const ADMIN_SESSION_BOOTSTRAP_RETRY_MS = 200;

async function readApiResult<T>(response: Response, invalidCode: string) {
  try {
    return (await response.json()) as ApiResult<T>;
  } catch {
    throw createAuthFlowError(invalidCode);
  }
}

function mapSupabaseAdminError(input: {
  error: {
    code?: string | null;
    message?: string | null;
    status?: number | null;
  };
  routePath: string;
}) {
  const providerCode = (input.error.code || "").trim().toLowerCase();
  let code = "ADMIN_SIGNIN_FAILED";

  if (providerCode === "invalid_credentials" || providerCode === "invalid_login_credentials") {
    code = "auth/invalid-login-credentials";
  } else if (providerCode === "over_request_rate_limit") {
    code = "auth/too-many-requests";
  } else if (providerCode === "email_not_confirmed" || providerCode === "email_not_verified") {
    code = "AUTH_EMAIL_NOT_CONFIRMED";
  } else if (providerCode === "user_suspended") {
    code = "AUTH_ACCOUNT_SUSPENDED";
  }

  const failure = normalizeAuthFailure({
    error: createAuthFlowError(code, input.error.message ?? undefined),
    flow: "admin",
    stage: "AUTH_STAGE_C_PROVIDER_RESPONSE",
    routePath: input.routePath,
    sessionCreationAttempted: false,
  });

  logAuthDiagnosis({
    failure,
    uxAction: "show_error",
  });

  return createAuthFlowErrorWithDetails(code, failure.safeProviderMessage ?? undefined, {
    failure,
  });
}

async function completeAdminAuthJsSignIn(input: {
  idToken: string;
  routePath: string;
}) {
  const signInResult = await signIn("admin-credentials", {
    redirect: false,
    idToken: input.idToken,
  });

  if (!signInResult) {
    const failure = normalizeAuthFailure({
      error: createAuthFlowError("AUTH_SESSION_CREATION_FAILED", "Missing Auth.js response."),
      flow: "admin",
      stage: "AUTH_STAGE_D_AUTHJS_SESSION_CREATION",
      routePath: input.routePath,
      sessionCreationAttempted: true,
    });

    throw createAuthFlowErrorWithDetails("ADMIN_BOOTSTRAP_FAILED", failure.safeProviderMessage ?? undefined, {
      failure,
    });
  }

  if (signInResult.error) {
    const code = readCredentialsSignInErrorCode(signInResult) || "ADMIN_BOOTSTRAP_FAILED";
    const failure = normalizeAuthFailure({
      error: createAuthFlowError(code, signInResult.error),
      flow: "admin",
      stage: "AUTH_STAGE_D_AUTHJS_SESSION_CREATION",
      routePath: input.routePath,
      sessionCreationAttempted: true,
    });

    throw createAuthFlowErrorWithDetails(code, failure.safeProviderMessage ?? undefined, {
      failure,
    });
  }

  if (!signInResult.ok) {
    const failure = normalizeAuthFailure({
      error: createAuthFlowError("AUTH_SESSION_CREATION_FAILED", "Unable to establish authenticated admin session."),
      flow: "admin",
      stage: "AUTH_STAGE_D_AUTHJS_SESSION_CREATION",
      routePath: input.routePath,
      sessionCreationAttempted: true,
    });

    throw createAuthFlowErrorWithDetails("ADMIN_BOOTSTRAP_FAILED", failure.safeProviderMessage ?? undefined, {
      failure,
    });
  }

  /* Admin redirect must wait for the server-observed admin session to avoid /admin <-> /admin/login bounce loops. */
  for (let attempt = 0; attempt < ADMIN_SESSION_BOOTSTRAP_MAX_ATTEMPTS; attempt += 1) {
    const meResponse = await fetch("/api/auth/me", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });

    const mePayload = await readApiResult<{
      session: {
        authenticated: boolean;
        user: { role: "admin" | "user" } | null;
      };
    }>(meResponse, "ADMIN_BOOTSTRAP_RESPONSE_INVALID");

    if (meResponse.ok && mePayload.ok && mePayload.data.session.authenticated && mePayload.data.session.user) {
      if (mePayload.data.session.user.role !== "admin") {
        const failure = normalizeAuthFailure({
          error: createAuthFlowError(
            "ADMIN_ACCOUNT_UNAUTHORIZED",
            "This account is not authorized for admin access.",
          ),
          flow: "admin",
          stage: "AUTH_STAGE_E_SESSION_HYDRATION",
          routePath: input.routePath,
          sessionCreationAttempted: true,
        });

        throw createAuthFlowErrorWithDetails("ADMIN_ACCOUNT_UNAUTHORIZED", failure.safeProviderMessage ?? undefined, {
          failure,
        });
      }
      return;
    }

    const responseErrorCode = mePayload.ok ? null : mePayload.error.code;
    const hasAttemptsRemaining = attempt + 1 < ADMIN_SESSION_BOOTSTRAP_MAX_ATTEMPTS;
    const isTransientBootstrapState =
      responseErrorCode === null
      || responseErrorCode === "SESSION_NOT_ESTABLISHED"
      || (meResponse.status >= 500 && meResponse.status < 600);

    if (!isTransientBootstrapState) {
      const code = responseErrorCode || "ADMIN_BOOTSTRAP_FAILED";
      const failure = normalizeAuthFailure({
        error: createAuthFlowError(code),
        flow: "admin",
        stage: "AUTH_STAGE_E_SESSION_HYDRATION",
        routePath: input.routePath,
        sessionCreationAttempted: true,
      });

      throw createAuthFlowErrorWithDetails(code, failure.safeProviderMessage ?? undefined, {
        failure,
      });
    }

    if (hasAttemptsRemaining) {
      await new Promise((resolve) => window.setTimeout(resolve, ADMIN_SESSION_BOOTSTRAP_RETRY_MS));
      continue;
    }
  }
  const timeoutFailure = normalizeAuthFailure({
    error: createAuthFlowError("AUTH_SESSION_CREATION_FAILED", "Admin session hydration timed out."),
    flow: "admin",
    stage: "AUTH_STAGE_E_SESSION_HYDRATION",
    routePath: input.routePath,
    sessionCreationAttempted: true,
  });
  throw createAuthFlowErrorWithDetails("ADMIN_BOOTSTRAP_FAILED", timeoutFailure.safeProviderMessage ?? undefined, {
    failure: timeoutFailure,
  });

}

export function AdminLoginPanel({
  messages,
  supabaseAuthReady,
}: AdminLoginPanelProps) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [phase, setPhase] = useState<AdminLoginPhase>("idle");
  const [status, setStatus] = useState<AuthStatusDescriptor | null>(null);
  const supabaseConfigured = isSupabaseWebConfigured();
  const isBusy = phase !== "idle";

  useEffect(() => {
    if (!supabaseConfigured) {
      return;
    }

    void primeEphemeralSupabaseClient().catch(() => {
      // Let the submit flow surface concrete config/runtime failures to the user.
    });
  }, [supabaseConfigured]);

  async function clearClientSession() {
    if (!supabaseConfigured) {
      return;
    }

    try {
      await getSupabaseClient().auth.signOut();
    } catch {
      // Best-effort client cleanup only.
    }
  }

  async function resolveIdentifier() {
    const response = await fetch("/api/auth/admin/resolve-identifier", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({
        identifier,
      }),
    });

    const payload = await readApiResult<AdminIdentifierResolution>(
      response,
      "IDENTIFIER_RESPONSE_INVALID",
    );
    if (!response.ok || !payload.ok) {
      const code = payload.ok ? "IDENTIFIER_RESOLUTION_FAILED" : payload.error.code;
      const failure = normalizeAuthFailure({
        error: createAuthFlowError(code, payload.ok ? undefined : payload.error.message),
        flow: "admin",
        stage: "AUTH_STAGE_A_CREDENTIALS_SUBMITTED",
        routePath: APP_ROUTES.adminLogin,
        sessionCreationAttempted: false,
      });

      throw createAuthFlowErrorWithDetails(code, failure.safeProviderMessage ?? undefined, {
        failure,
      });
    }

    return payload.data;
  }

  async function bootstrapAdminSession(idToken: string) {
    setPhase("bootstrapping");
    setStatus({
      tone: "info",
      icon: "working",
      title: messages.adminLoginStatusOpeningTitle,
      body: messages.adminLoginStatusOpeningBody,
    });

    await completeAdminAuthJsSignIn({
      idToken,
      routePath: APP_ROUTES.adminLogin,
    });

    return APP_ROUTES.admin;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    logAuthDiagnosis({
      failure: normalizeAuthFailure({
        error: createAuthFlowError("AUTH_UNKNOWN_UPSTREAM_FAILURE", "Admin credentials were submitted from admin login panel."),
        flow: "admin",
        stage: "AUTH_STAGE_A_CREDENTIALS_SUBMITTED",
        routePath: APP_ROUTES.adminLogin,
        sessionCreationAttempted: false,
      }),
      uxAction: "retry",
    });

    if (!supabaseConfigured || !supabaseAuthReady || isBusy) {
      return;
    }

    if (!identifier.trim() || !password) {
      return;
    }

    let resolvedEmail: string | null = null;

    setPhase("resolving");
    setStatus({
      tone: "info",
      icon: "working",
      title: messages.adminLoginStatusResolvingTitle,
      body: messages.adminLoginStatusResolvingBody,
    });

    try {
      const resolution = await resolveIdentifier();
      resolvedEmail = resolution.email;
      setPhase("signing_in");
      setStatus({
        tone: "info",
        icon: "working",
        title: messages.adminLoginStatusSigningTitle,
        body: messages.adminLoginStatusSigningBody,
      });

      const supabase = await getEphemeralSupabaseClient();

      logAuthDiagnosis({
        failure: normalizeAuthFailure({
          error: createAuthFlowError("AUTH_UNKNOWN_UPSTREAM_FAILURE", "Submitting admin credentials to Supabase password auth."),
          flow: "admin",
          stage: "AUTH_STAGE_B_SUPABASE_ATTEMPT",
          routePath: APP_ROUTES.adminLogin,
          sessionCreationAttempted: false,
        }),
        uxAction: "retry",
      });

      const { data, error } = await supabase.auth.signInWithPassword({
        email: resolution.email,
        password,
      });

      if (error) {
        throw mapSupabaseAdminError({
          error,
          routePath: APP_ROUTES.adminLogin,
        });
      }

      if (!data.session?.access_token) {
        const failure = normalizeAuthFailure({
          error: createAuthFlowError("AUTH_UNKNOWN_UPSTREAM_FAILURE", "Supabase admin sign-in succeeded without an access token."),
          flow: "admin",
          stage: "AUTH_STAGE_C_PROVIDER_RESPONSE",
          routePath: APP_ROUTES.adminLogin,
          sessionCreationAttempted: false,
        });
        throw createAuthFlowErrorWithDetails("ADMIN_SIGNIN_FAILED", failure.safeProviderMessage ?? undefined, {
          failure,
        });
      }

      const redirectTo = await bootstrapAdminSession(data.session.access_token);
      setPhase("success_handoff");
      setStatus({
        tone: "success",
        icon: "success",
        title: messages.adminLoginStatusSuccessTitle,
        body: messages.adminLoginStatusSuccessBody,
      });
      await clearClientSession();
      router.replace(redirectTo);
      router.refresh();
    } catch (nextError) {
      const failure = normalizeAuthFailure({
        error: nextError,
        flow: "admin",
        stage: "AUTH_STAGE_E_SESSION_HYDRATION",
        routePath: APP_ROUTES.adminLogin,
        sessionCreationAttempted: true,
      });

      const confirmationEmail = resolvedEmail ?? (identifier.includes("@") ? identifier.trim() : "");
      if (isEmailConfirmationFailure(failure) && confirmationEmail.length > 0) {
        const confirmRoute = buildConfirmEmailRoute({
          email: confirmationEmail,
          flow: "admin",
          fromRoute: APP_ROUTES.adminLogin,
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
      setStatus(mapAdminLoginError(nextError, messages));
    }
  }

  const disabled =
    !supabaseConfigured
    || !supabaseAuthReady
    || isBusy
    || !identifier.trim()
    || !password;
  const blockingStatus =
    !supabaseConfigured
      ? {
          tone: "warning" as const,
          icon: "config" as const,
          title: messages.adminLoginStatusConfigTitle,
          body: messages.adminLoginStatusConfigBody,
          live: "off" as const,
        }
      : !supabaseAuthReady
        ? {
            tone: "warning" as const,
            icon: "config" as const,
            title: messages.adminLoginStatusServerTitle,
            body: messages.adminLoginStatusServerBody,
            live: "off" as const,
          }
        : null;
  const visibleStatus = blockingStatus ?? status;
  const buttonLabel =
    !supabaseConfigured || !supabaseAuthReady
      ? messages.adminLoginCtaUnavailable
      : phase === "resolving"
        ? messages.adminLoginCtaChecking
        : phase === "signing_in"
          ? messages.adminLoginCtaVerifying
          : phase === "bootstrapping" || phase === "success_handoff"
            ? messages.adminLoginCtaOpening
            : messages.adminLoginCta;

  return (
    <div className="relative mx-auto flex w-full max-w-[440px] flex-col gap-2 animate-in fade-in zoom-in-95 duration-700">
      <div className="relative overflow-hidden rounded-[2.1rem] border border-border bg-background-elevated/90 p-4 shadow-2xl shadow-black/20 backdrop-blur-2xl sm:p-5">
        
        <div className="relative z-10 flex flex-col gap-3">
          {/* Keep the admin sign-in card operational and compact: form first, runtime/security notes second. */}

          <AuthStatus status={visibleStatus} />

          <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
            <label className="flex flex-col gap-2">
              <span className="ms-1 text-[11px] font-bold uppercase tracking-[0.18em] text-foreground-muted">
                {messages.adminLoginIdentifierLabel}
              </span>
              <input
                type="text"
                value={identifier}
                onChange={(event) => {
                  setIdentifier(event.target.value);
                  if (phase === "idle") setStatus(null);
                }}
                placeholder={messages.adminLoginIdentifierPlaceholder}
                autoComplete="username"
                className="w-full rounded-2xl border border-border bg-background px-4 py-3.5 text-sm font-medium text-foreground shadow-[0_12px_30px_rgba(15,23,42,0.05)] transition-all focus:border-amber-500 focus:outline-none focus:ring-4 focus:ring-amber-500/10 placeholder:text-foreground-muted/80"
              />
            </label>

            <label className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="ms-1 text-[11px] font-bold uppercase tracking-[0.18em] text-foreground-muted">
                  {messages.adminLoginPasswordLabel}
                </span>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="me-2 inline-flex items-center justify-center text-foreground-muted transition-colors hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (phase === "idle") setStatus(null);
                }}
                placeholder={messages.adminLoginPasswordPlaceholder}
                autoComplete="current-password"
                className="w-full rounded-2xl border border-border bg-background px-4 py-3.5 text-sm font-medium text-foreground shadow-[0_12px_30px_rgba(15,23,42,0.05)] transition-all focus:border-amber-500 focus:outline-none focus:ring-4 focus:ring-amber-500/10 placeholder:text-foreground-muted/80"
              />
            </label>

            <button
              type="submit"
              disabled={disabled}
              aria-busy={isBusy}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-600 py-3.5 font-bold text-white shadow-[0_14px_30px_rgba(217,119,6,0.24)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_34px_rgba(217,119,6,0.3)] active:scale-[0.98] disabled:opacity-50"
            >
              <span>{buttonLabel}</span>
              {isBusy ? <LoaderCircle className="h-5 w-5 animate-spin text-white" aria-hidden="true" /> : null}
            </button>
          </form>

          <div className="flex items-center justify-start border-t border-border pt-3">
            <Link
              href={APP_ROUTES.login}
              className="inline-flex items-center gap-2 text-sm font-medium text-foreground-muted transition-colors hover:text-amber-600"
            >
              <GraduationCap className="h-4 w-4" aria-hidden="true" />
              <span>{messages.adminLoginBackAction}</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
