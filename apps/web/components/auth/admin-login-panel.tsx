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
  type AuthSupportNote,
} from "@/components/auth/auth-feedback";
import {
  AuthStatus,
  AuthSupportDetails,
} from "@/components/auth/auth-status";
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
  const supportNotes: AuthSupportNote[] = [];
  if (!firebaseConfigured) {
    supportNotes.push({ text: messages.adminLoginConfigHint });
  }
  if (!firebaseAdminReady) {
    supportNotes.push({ text: messages.firebaseUnavailable });
  }
  supportNotes.push(
    { text: messages.adminLoginUsernameHint },
    { text: messages.adminLoginRestrictedNotice },
    { text: messages.adminLoginClaimsRunbookNote },
    { text: messages.adminLoginWeakPasswordNotice, tone: "danger" },
  );
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
  const idleHelperStatus =
    !identifier.trim() || !password
      ? {
          tone: "neutral" as const,
          icon: "info" as const,
          title: messages.adminLoginIdleTitle,
          body: messages.adminLoginIdleBody,
          live: "off" as const,
        }
      : null;
  const visibleStatus = blockingStatus ?? status ?? idleHelperStatus;
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
    <div className="relative mx-auto flex w-full max-w-[440px] flex-col gap-6 animate-in fade-in zoom-in-95 duration-700">
      <div className="relative overflow-hidden rounded-[2.25rem] border border-white/15 bg-white/88 shadow-2xl shadow-black/20 backdrop-blur-2xl dark:bg-zinc-950/72 dark:shadow-black/50 p-8 sm:p-10">
        <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-amber-500 opacity-20 blur-3xl transition-opacity duration-700 dark:opacity-30" />
        <div className="pointer-events-none absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-amber-500 opacity-20 blur-3xl transition-opacity duration-700 dark:opacity-30" />
        
        <div className="relative z-10">
          <h2 className="mb-2 text-center font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
            {messages.adminLoginCardHint}
          </h2>
          <p className="mb-8 text-center text-[0.95rem] leading-relaxed text-zinc-600 dark:text-zinc-400">
            {messages.adminLoginRestrictedNotice}
          </p>

          <AuthStatus status={visibleStatus} />

          <form className="mt-8 flex flex-col gap-5" onSubmit={handleSubmit}>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 ms-1">{messages.adminLoginIdentifierLabel}</span>
              <input
                type="text"
                value={identifier}
                onChange={(event) => {
                  setIdentifier(event.target.value);
                  if (phase === "idle") setStatus(null);
                }}
                placeholder={messages.adminLoginIdentifierPlaceholder}
                autoComplete="username"
                className="w-full rounded-2xl border-2 border-zinc-100 bg-white py-3.5 px-4 text-sm font-medium text-zinc-900 transition-all focus:outline-none focus:border-amber-500 dark:border-zinc-700/50 dark:bg-zinc-800/60 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 ms-1">{messages.adminLoginPasswordLabel}</span>
              <input
                type="password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (phase === "idle") setStatus(null);
                }}
                placeholder={messages.adminLoginPasswordPlaceholder}
                autoComplete="current-password"
                className="w-full rounded-2xl border-2 border-zinc-100 bg-white py-3.5 px-4 text-sm font-medium text-zinc-900 transition-all focus:outline-none focus:border-amber-500 dark:border-zinc-700/50 dark:bg-zinc-800/60 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
              />
            </label>

            <button
              type="submit"
              disabled={disabled}
              aria-busy={isBusy}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-600 py-3.5 font-bold text-white shadow-[0_4px_14px_rgba(217,119,6,0.2)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(217,119,6,0.3)] active:scale-[0.98] disabled:opacity-50"
            >
              <span>{buttonLabel}</span>
              {isBusy ? <LoaderCircle className="h-5 w-5 animate-spin text-white" aria-hidden="true" /> : null}
            </button>
          </form>
           
          <div className="mt-8 flex justify-center">
            <Link href={APP_ROUTES.login} className="group flex flex-col items-center gap-2 text-sm text-zinc-500 hover:text-amber-600 dark:text-zinc-400 dark:hover:text-amber-400 transition-colors">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-zinc-200 bg-white shadow-sm transition-all group-hover:scale-110 group-hover:border-amber-500/30 group-hover:bg-amber-500/5 dark:border-zinc-800 dark:bg-zinc-900">
                <GraduationCap className="h-5 w-5" aria-hidden="true" />
              </div>
              <span className="font-medium tracking-wide">{messages.adminLoginBackAction}</span>
            </Link>
          </div>
        </div>
      </div>

      <div className="rounded-[2.25rem] border border-white/15 bg-white/60 p-8 backdrop-blur-md dark:bg-zinc-950/40 dark:border-zinc-800/50 text-sm">
        <AuthSupportDetails
          label={messages.adminSupportDetailsLabel}
          notes={supportNotes}
        />
      </div>
    </div>
  );
}
