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
  mapAdminLoginError,
  type AuthStatusDescriptor,
} from "@/components/auth/auth-feedback";
import { AuthStatus } from "@/components/auth/auth-status";
import type { AppMessages } from "@/lib/messages";

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

async function completeAdminAuthJsSignIn(input: {
  idToken: string;
}) {
  const signInResult = await signIn("admin-credentials", {
    redirect: false,
    idToken: input.idToken,
  });

  if (!signInResult) {
    throw createAuthFlowError("ADMIN_BOOTSTRAP_FAILED", "Missing Auth.js response.");
  }

  if (signInResult.error) {
    throw createAuthFlowError(
      readCredentialsSignInErrorCode(signInResult) || "ADMIN_BOOTSTRAP_FAILED",
    );
  }

  if (!signInResult.ok) {
    throw createAuthFlowError(
      "ADMIN_BOOTSTRAP_FAILED",
      "Unable to establish authenticated admin session.",
    );
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
        throw createAuthFlowError(
          "ADMIN_ACCOUNT_UNAUTHORIZED",
          "This account is not authorized for admin access.",
        );
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
      throw createAuthFlowError(responseErrorCode || "ADMIN_BOOTSTRAP_FAILED");
    }

    if (hasAttemptsRemaining) {
      await new Promise((resolve) => window.setTimeout(resolve, ADMIN_SESSION_BOOTSTRAP_RETRY_MS));
      continue;
    }
  }
  throw createAuthFlowError("ADMIN_BOOTSTRAP_FAILED");

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
      throw createAuthFlowError(
        payload.ok ? "IDENTIFIER_RESOLUTION_FAILED" : payload.error.code,
        payload.ok ? undefined : payload.error.message,
      );
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
    });

    return APP_ROUTES.admin;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!identifier.trim() || !password) {
      return;
    }

    setPhase("resolving");
    setStatus({
      tone: "info",
      icon: "working",
      title: messages.adminLoginStatusResolvingTitle,
      body: messages.adminLoginStatusResolvingBody,
    });

    try {
      const resolution = await resolveIdentifier();
      setPhase("signing_in");
      setStatus({
        tone: "info",
        icon: "working",
        title: messages.adminLoginStatusSigningTitle,
        body: messages.adminLoginStatusSigningBody,
      });

      const supabase = await getEphemeralSupabaseClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: resolution.email,
        password,
      });

      if (error) {
        if (
          error.code === "invalid_credentials"
          || error.code === "invalid_login_credentials"
        ) {
          throw createAuthFlowError("auth/invalid-login-credentials", error.message);
        }

        if (error.code === "over_request_rate_limit") {
          throw createAuthFlowError("auth/too-many-requests", error.message);
        }

        throw createAuthFlowError("ADMIN_SIGNIN_FAILED", error.message);
      }

      if (!data.session?.access_token) {
        throw createAuthFlowError("ADMIN_SIGNIN_FAILED", "Missing Supabase access token.");
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
