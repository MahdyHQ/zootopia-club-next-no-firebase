"use client";

import { APP_ROUTES } from "@zootopia/shared-config";
import type { ApiResult, AdminIdentifierResolution } from "@zootopia/shared-types";
import { signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { GraduationCap, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  createAuthFlowError,
  getAuthFlowErrorCode,
  mapAdminLoginError,
  type AuthStatusDescriptor,
} from "@/components/auth/auth-feedback";
import { AuthStatus } from "@/components/auth/auth-status";
import type { AppMessages } from "@/lib/messages";

import {
  getEphemeralFirebaseClientAuth,
  getFirebaseClientAuth,
  isFirebaseWebConfigured,
  primeEphemeralFirebaseClientAuth,
} from "@/lib/firebase/client";

type AdminLoginPanelProps = {
  messages: AppMessages;
  firebaseAdminReady: boolean;
};

type AdminLoginPhase =
  | "idle"
  | "resolving"
  | "signing_in"
  | "bootstrapping"
  | "success_handoff";

async function readApiResult<T>(response: Response, invalidCode: string) {
  try {
    return (await response.json()) as ApiResult<T>;
  } catch {
    throw createAuthFlowError(invalidCode);
  }
}

export function AdminLoginPanel({
  messages,
  firebaseAdminReady,
}: AdminLoginPanelProps) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [phase, setPhase] = useState<AdminLoginPhase>("idle");
  const [status, setStatus] = useState<AuthStatusDescriptor | null>(null);
  const firebaseConfigured = isFirebaseWebConfigured();
  const isBusy = phase !== "idle";

  useEffect(() => {
    if (!firebaseConfigured) {
      return;
    }

    void primeEphemeralFirebaseClientAuth().catch(() => {
      // Let the submit flow surface concrete config/runtime failures to the user.
    });
  }, [firebaseConfigured]);

  async function clearClientSession() {
    if (!firebaseConfigured) {
      return;
    }

    try {
      await signOut(getFirebaseClientAuth());
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

    const response = await fetch("/api/auth/admin/bootstrap", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({ idToken }),
    });

    const payload = await readApiResult<{
      user: unknown;
      redirectTo: string;
    }>(response, "ADMIN_BOOTSTRAP_RESPONSE_INVALID");
    if (!response.ok || !payload.ok) {
      throw createAuthFlowError(
        payload.ok ? "ADMIN_BOOTSTRAP_FAILED" : payload.error.code,
        payload.ok ? undefined : payload.error.message,
      );
    }

    return payload.data.redirectTo;
  }

  async function completeAdminBootstrap(user: User) {
    try {
      return await bootstrapAdminSession(await user.getIdToken(true));
    } catch (bootstrapError) {
      if (getAuthFlowErrorCode(bootstrapError) !== "ADMIN_TOKEN_REFRESH_REQUIRED") {
        throw bootstrapError;
      }

      await user.reload();
      await new Promise((resolve) => window.setTimeout(resolve, 1200));
      return bootstrapAdminSession(await user.getIdToken(true));
    }
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

      const auth = await getEphemeralFirebaseClientAuth();
      const credential = await signInWithEmailAndPassword(
        auth,
        resolution.email,
        password,
      );

      const redirectTo = await completeAdminBootstrap(credential.user);
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
    !firebaseConfigured || !firebaseAdminReady || isBusy || !identifier.trim() || !password;
  const blockingStatus =
    !firebaseConfigured
      ? {
          tone: "warning" as const,
          icon: "config" as const,
          title: messages.adminLoginStatusConfigTitle,
          body: messages.adminLoginStatusConfigBody,
          live: "off" as const,
        }
      : !firebaseAdminReady
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
    !firebaseConfigured || !firebaseAdminReady
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
      <div className="relative overflow-hidden rounded-[2.1rem] border border-white/15 bg-white/90 p-4 shadow-2xl shadow-black/20 backdrop-blur-2xl dark:bg-zinc-950/72 dark:shadow-black/50 sm:p-5">
        
        <div className="relative z-10 flex flex-col gap-3">
          {/* Keep the admin sign-in card operational and compact: form first, runtime/security notes second. */}

          <AuthStatus status={visibleStatus} />

          <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
            <label className="flex flex-col gap-2">
              <span className="ms-1 text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
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
                className="w-full rounded-2xl border border-zinc-200/80 bg-white/95 px-4 py-3.5 text-sm font-medium text-zinc-900 shadow-[0_12px_30px_rgba(15,23,42,0.05)] transition-all focus:border-amber-500 focus:outline-none focus:ring-4 focus:ring-amber-500/10 dark:border-zinc-700/70 dark:bg-zinc-900/70 dark:text-zinc-100 dark:placeholder:text-zinc-500"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="ms-1 text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                {messages.adminLoginPasswordLabel}
              </span>
              <input
                type="password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (phase === "idle") setStatus(null);
                }}
                placeholder={messages.adminLoginPasswordPlaceholder}
                autoComplete="current-password"
                className="w-full rounded-2xl border border-zinc-200/80 bg-white/95 px-4 py-3.5 text-sm font-medium text-zinc-900 shadow-[0_12px_30px_rgba(15,23,42,0.05)] transition-all focus:border-amber-500 focus:outline-none focus:ring-4 focus:ring-amber-500/10 dark:border-zinc-700/70 dark:bg-zinc-900/70 dark:text-zinc-100 dark:placeholder:text-zinc-500"
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

          <div className="flex items-center justify-start border-t border-zinc-200/70 pt-3 dark:border-zinc-800/80">
            <Link
              href={APP_ROUTES.login}
              className="inline-flex items-center gap-2 text-sm font-medium text-zinc-500 transition-colors hover:text-amber-600 dark:text-zinc-400 dark:hover:text-amber-400"
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
