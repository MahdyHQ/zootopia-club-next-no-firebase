"use client";

import { APP_ROUTES } from "@zootopia/shared-config";
import type { ApiResult, Locale, SessionUser } from "@zootopia/shared-types";
import {
  getRedirectResult,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from "firebase/auth";
import { LoaderCircle, Shield } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

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
  getEphemeralFirebaseClientAuth,
  getFirebaseClientAuth,
  isFirebaseWebConfigured,
  primeEphemeralFirebaseClientAuth,
} from "@/lib/firebase/client";

type LoginPanelProps = {
  messages: AppMessages;
  locale: Locale;
  firebaseAdminReady: boolean;
};

type RegularLoginPhase =
  | "idle"
  | "opening_google"
  | "redirecting"
  | "bootstrapping"
  | "success_handoff";

function isRedirectPreferred() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches;
}

function createGoogleProvider() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({
    prompt: "select_account",
  });

  return provider;
}

async function readApiResult<T>(response: Response, invalidCode: string) {
  try {
    return (await response.json()) as ApiResult<T>;
  } catch {
    throw createAuthFlowError(invalidCode);
  }
}

export function LoginPanel({
  messages,
  locale,
  firebaseAdminReady,
}: LoginPanelProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<RegularLoginPhase>("idle");
  const [status, setStatus] = useState<AuthStatusDescriptor | null>(null);
  const firebaseConfigured = isFirebaseWebConfigured();
  const isBusy = phase !== "idle";

  useEffect(() => {
    if (!firebaseConfigured) {
      return;
    }

    void primeEphemeralFirebaseClientAuth().catch(() => {
      // Defer concrete errors to the active sign-in flow for better user-facing context.
    });
  }, [firebaseConfigured]);

  const clearClientSession = useCallback(async () => {
    if (!firebaseConfigured) {
      return;
    }

    try {
      await signOut(getFirebaseClientAuth());
    } catch {
      // Best-effort client cleanup only.
    }
  }, [firebaseConfigured]);

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
    setFinishingStatus();

    const response = await fetch("/api/auth/bootstrap", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({ idToken }),
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
  }, [clearClientSession, messages, router, setFinishingStatus]);

  useEffect(() => {
    if (!firebaseConfigured) {
      return;
    }

    let cancelled = false;

    async function completeRedirectLogin() {
      try {
        const auth = await getEphemeralFirebaseClientAuth();
        const result = await getRedirectResult(auth);
        if (!result?.user || cancelled) {
          return;
        }

        await bootstrapSession(await result.user.getIdToken(true));
      } catch (nextError) {
        await clearClientSession();
        if (!cancelled) {
          setPhase("idle");
          setStatus(mapRegularLoginError(nextError, messages));
        }
      }
    }

    void completeRedirectLogin();

    return () => {
      cancelled = true;
    };
  }, [bootstrapSession, clearClientSession, firebaseConfigured, messages]);

  async function handleGoogleLogin() {
    if (!firebaseConfigured || isBusy) {
      return;
    }

    const prefersRedirect = isRedirectPreferred();
    let shouldReset = true;

    setPhase(prefersRedirect ? "redirecting" : "opening_google");
    setStatus(
      prefersRedirect
        ? {
            tone: "info",
            icon: "working",
            title: messages.loginStatusRedirectingTitle,
            body: messages.loginStatusRedirectingBody,
          }
        : {
            tone: "info",
            icon: "working",
            title: messages.loginStatusWorkingTitle,
            body: messages.loginStatusWorkingBody,
          },
    );

    try {
      const auth = await getEphemeralFirebaseClientAuth();
      auth.languageCode = locale;
      const provider = createGoogleProvider();

      if (prefersRedirect) {
        shouldReset = false;
        await signInWithRedirect(auth, provider);
        return;
      }

      const result = await signInWithPopup(auth, provider);
      await bootstrapSession(await result.user.getIdToken(true));
      shouldReset = false;
    } catch (nextError) {
      await clearClientSession();
      const code =
        typeof nextError === "object" && nextError && "code" in nextError
          ? String(nextError.code)
          : "";

      if (
        code === "auth/popup-blocked" ||
        code === "auth/operation-not-supported-in-this-environment"
      ) {
        try {
          setPhase("redirecting");
          setStatus({
            tone: "warning",
            icon: "warning",
            title: messages.loginStatusRedirectingTitle,
            body: messages.loginStatusRedirectingBody,
          });
          const redirectAuth = await getEphemeralFirebaseClientAuth();
          redirectAuth.languageCode = locale;
          shouldReset = false;
          await signInWithRedirect(redirectAuth, createGoogleProvider());
          return;
        } catch (redirectError) {
          setPhase("idle");
          setStatus(mapRegularLoginError(redirectError, messages));
        }
      } else {
        setPhase("idle");
        setStatus(mapRegularLoginError(nextError, messages));
      }
    } finally {
      if (shouldReset) {
        setPhase("idle");
      }
    }
  }

  const disabled = !firebaseConfigured || isBusy;
  const blockingStatus =
    !firebaseConfigured
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
          title: messages.loginIdleTitle,
          body: messages.loginIdleBody,
          live: "off" as const,
        }
      : null;
  const visibleStatus = blockingStatus ?? status ?? idleHelperStatus;
  const supportNotes: AuthSupportNote[] = [];
  if (!firebaseConfigured) {
    supportNotes.push({ text: messages.loginConfigHint });
  }
  if (!firebaseAdminReady) {
    supportNotes.push({ text: messages.firebaseUnavailable });
  }
  const buttonLabel =
    !firebaseConfigured
      ? messages.loginCtaUnavailable
      : phase === "opening_google"
        ? messages.loginCtaWorking
        : phase === "redirecting"
          ? messages.loginCtaRedirecting
          : phase === "bootstrapping" || phase === "success_handoff"
            ? messages.loginCtaSuccess
            : messages.loginCta;

  return (
    <div className="relative mx-auto w-full max-w-[440px] overflow-hidden rounded-[2rem] border border-white/15 bg-white/88 p-6 shadow-2xl shadow-black/20 backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-700 dark:bg-zinc-950/72 dark:shadow-black/50 sm:rounded-[2.25rem] sm:p-8">
      {/* Decorative background glow */}
      <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-emerald-500 opacity-20 blur-3xl transition-opacity duration-700 dark:opacity-30" />
      <div className="pointer-events-none absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-emerald-500 opacity-20 blur-3xl transition-opacity duration-700 dark:opacity-30" />
      
      <div className="relative z-10">
        <h2 className="mb-2 text-center font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
          {messages.loginTitle}
        </h2>
        <p className="mb-6 text-center text-[0.95rem] leading-relaxed text-zinc-600 dark:text-zinc-400">
          {messages.loginSubtitle}
        </p>
        <AuthStatus status={visibleStatus} />

        <div className="mt-7 flex flex-col gap-5">
          <button
            type="button"
            onClick={() => void handleGoogleLogin()}
            disabled={disabled}
            aria-busy={isBusy}
            className="group relative flex w-full items-center justify-center gap-4 overflow-hidden rounded-2xl bg-white px-5 py-3.5 text-[1rem] font-medium text-slate-800 shadow-[0_4px_14px_rgba(2,6,23,0.06)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_8px_24px_rgba(16,185,129,0.15)] disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-[0_4px_14px_rgba(2,6,23,0.06)] dark:bg-slate-900 dark:text-slate-100 sm:px-6 sm:py-4 sm:text-[1.05rem]"
            dir="ltr"
          >
            {isBusy ? (
              <LoaderCircle className="h-6 w-6 animate-spin text-accent" />
            ) : (
              <span className="flex items-center justify-center shrink-0" aria-hidden="true">
                <svg viewBox="0 0 24 24" className="h-6 w-6" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M21.4 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.3a4.8 4.8 0 0 1-2 3.1v2.6h3.3c1.9-1.8 2.8-4.4 2.8-7.5Z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c3 0 5.5-1 7.3-2.6l-3.3-2.6c-1 .6-2.2 1-4 1-2.9 0-5.3-2-6.2-4.6H2.6v2.7A11.1 11.1 0 0 0 12 23Z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.8 14.8a6.6 6.6 0 0 1 0-4.2V8H2.6a11.1 11.1 0 0 0 0 9.5l3.2-2.7Z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.4c1.6 0 3 .5 4.1 1.6l3.2-3.2A11 11 0 0 0 12 1a11.1 11.1 0 0 0-9.4 5l3.2 2.7c.9-2.7 3.3-4.6 6.2-4.6Z"
                    fill="#EA4335"
                  />
                </svg>
              </span>
            )}
            <span className="relative z-10 transition-transform group-hover:scale-[1.02]">
              {buttonLabel}
            </span>
          </button>

          <div className="relative my-1 flex items-center py-2">
            <div className="grow border-t border-border-strong" />
            <span className="shrink-0 px-4 text-xs font-semibold uppercase tracking-widest text-foreground-muted">
              {/* @ts-expect-error key may be missing */}
              {messages.loginDivider || "OR"}
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
                {/* @ts-expect-error key may be missing */}
                {messages.actionAdminLogin || "Admin"}
              </span>
            </Link>
          </div>
        </div>

        {supportNotes.length > 0 && (
          <div className="mt-6 space-y-3">
            {supportNotes.map((note) => (
              <AuthSupportDetails
                key={note.text}
                label={note.text}
                notes={[note]}
              />
            ))}
          </div>
        )}
      </div>
    </div>
);
}
