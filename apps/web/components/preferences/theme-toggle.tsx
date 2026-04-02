"use client";

import { ENV_KEYS } from "@zootopia/shared-config";
import type { ThemeMode } from "@zootopia/shared-types";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

type ThemeToggleProps = {
  value: ThemeMode;
  label: string;
  labels: Record<ThemeMode, string>;
  variant?: "default" | "compact";
};

function writeCookie(name: string, value: string) {
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax${secure}`;
}

export function ThemeToggle({
  value,
  label,
  labels,
  variant = "default",
}: ThemeToggleProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const compact = variant === "compact";

  function applyTheme(nextTheme: ThemeMode) {
    writeCookie(ENV_KEYS.themeCookie, nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className={`toggle-group${compact ? " toggle-group--compact" : ""}`}>
      <p className="toggle-label">{label}</p>
      <div className="toggle-shell">
        {(["light", "dark", "system"] as const).map((theme) => {
          const selected = value === theme;
          return (
            <button
              key={theme}
              type="button"
              aria-pressed={selected}
              aria-label={`${label}: ${labels[theme]}`}
              disabled={isPending}
              onClick={() => applyTheme(theme)}
              className={`toggle-button ${
                selected
                  ? "toggle-button--selected"
                  : "toggle-button--idle"
              }`}
            >
              {labels[theme]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
