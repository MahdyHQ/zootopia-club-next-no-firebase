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

    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });

      await signOut({
        redirect: false,
      });

      if (isSupabaseWebConfigured()) {
        await getSupabaseClient().auth.signOut();
      }

      startTransition(() => {
        router.replace(redirectTo);
        router.refresh();
      });
    } catch {
      setError("Unable to complete sign-out in this runtime.");
    }
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
