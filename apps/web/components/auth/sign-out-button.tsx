"use client";

import { APP_ROUTES } from "@zootopia/shared-config";
import { signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { getFirebaseClientAuth, isFirebaseWebConfigured } from "@/lib/firebase/client";

type SignOutButtonProps = {
  label: string;
  redirectTo?: string;
};

export function SignOutButton({
  label,
  redirectTo = APP_ROUTES.login,
}: SignOutButtonProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleSignOut() {
    setError(null);

    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });

      if (isFirebaseWebConfigured()) {
        await signOut(getFirebaseClientAuth());
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
        className="ghost-button w-full justify-center border border-border"
      >
        {label}
      </button>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
