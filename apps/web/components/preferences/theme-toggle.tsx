"use client";

import { ENV_KEYS } from "@zootopia/shared-config";
import type { ThemeMode } from "@zootopia/shared-types";
import { Monitor, MoonStar, SunMedium } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

type ThemeToggleProps = {
  value: ThemeMode;
  label: string;
  labels: Record<ThemeMode, string>;
  variant?: "default" | "compact" | "toolbar" | "cycle-icon";
};

const THEME_ORDER: ThemeMode[] = ["light", "dark", "system"];
const THEME_ICONS = {
  light: SunMedium,
  dark: MoonStar,
  system: Monitor,
} satisfies Record<ThemeMode, typeof SunMedium>;

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
  const toolbar = variant === "toolbar";
  const cycleIcon = variant === "cycle-icon";

  function applyTheme(nextTheme: ThemeMode) {
    writeCookie(ENV_KEYS.themeCookie, nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
    startTransition(() => {
      router.refresh();
    });
  }

  if (cycleIcon) {
    const ActiveThemeIcon = THEME_ICONS[value];
    const nextTheme = THEME_ORDER[(THEME_ORDER.indexOf(value) + 1) % THEME_ORDER.length];

    return (
      <div className="toggle-group toggle-group--cycle-icon">
        <p className="sr-only">{label}</p>
        <div className="toggle-shell">
          <button
            type="button"
            aria-label={`${label}: ${labels[value]}`}
            title={`${label}: ${labels[value]}`}
            disabled={isPending}
            onClick={() => applyTheme(nextTheme)}
            className="toggle-button toggle-button--idle"
          >
            <ActiveThemeIcon className="h-4 w-4" />
            <span className="sr-only">{labels[value]}</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`toggle-group${compact ? " toggle-group--compact" : ""}${
        toolbar ? " toggle-group--toolbar" : ""
      }`}
    >
      <p className={toolbar ? "sr-only" : "toggle-label"}>{label}</p>
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
