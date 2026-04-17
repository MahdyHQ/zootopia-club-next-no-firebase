"use client";

import { APP_ROUTES } from "@zootopia/shared-config";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState, useTransition } from "react";

import { getSupabaseClient, isSupabaseWebConfigured } from "@/lib/supabase/client";

type SignOutButtonProps = {
  label: string;
  redirectTo?: string;
  icon?: ReactNode;
  title?: string;
  variant?: "default" | "icon";
};

export function SignOutButton({
  label,
  redirectTo = APP_ROUTES.login,
  icon,
  title,
  variant = "default",
}: SignOutButtonProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const iconVariant = variant === "icon";

  async function handleSignOut() {
    setError(null);

    let authSessionCleared = false;

    /* Protected-shell sign-out must preserve Auth.js as the primary trust boundary while still
       attempting browser-side Supabase cleanup for private Realtime auth. Keep this flow
       fail-open for the auxiliary cleanup route and Supabase token teardown so logout continues
       even when those supporting steps are degraded. Future agents: do not make Supabase or
       workspace cleanup a prerequisite for clearing the Auth.js session cookie on this button. */
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
    }).catch(() => {
      // Workspace cleanup is best-effort; Auth.js logout must still proceed.
    });

    try {
      await signOut({
        redirect: false,
      });
      authSessionCleared = true;
    } catch {
      authSessionCleared = false;
    }

    if (isSupabaseWebConfigured()) {
      await getSupabaseClient().auth.signOut().catch(() => {
        // Supabase browser-session cleanup supports Realtime continuity only and must not block logout.
      });
    }

    if (authSessionCleared) {
      startTransition(() => {
        router.replace(redirectTo);
        router.refresh();
      });
      return;
    }

    setError("Unable to complete sign-out in this runtime.");
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleSignOut}
        disabled={isPending}
        aria-label={title ?? label}
        title={title ?? label}
        className={
          iconVariant
            ? "inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-transparent text-red-400/80 hover:border-red-500/20 hover:bg-red-500/10 hover:text-red-400"
            : "ghost-button w-full justify-center border border-border"
        }
      >
        {iconVariant ? icon ?? label : label}
      </button>
      {!iconVariant && error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
