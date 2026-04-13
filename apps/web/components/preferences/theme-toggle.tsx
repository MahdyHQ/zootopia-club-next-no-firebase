"use client";

import { ENV_KEYS } from "@zootopia/shared-config";
import type { ThemeMode } from "@zootopia/shared-types";
import { Monitor, MoonStar, SunMedium } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type ThemeToggleProps = {
  value: ThemeMode;
  label: string;
  labels: Record<ThemeMode, string>;
  variant?: "default" | "compact" | "toolbar" | "cycle-icon";
  modes?: readonly ThemeMode[];
};

const THEME_ORDER: ThemeMode[] = ["light", "dark", "system"];
const THEME_ICONS = {
  light: SunMedium,
  dark: MoonStar,
  system: Monitor,
} satisfies Record<ThemeMode, typeof SunMedium>;

function resolveSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") {
    return "light";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function resolveDisplayedTheme(
  preferredTheme: ThemeMode,
  availableModes: ThemeMode[],
): ThemeMode {
  if (availableModes.includes(preferredTheme)) {
    return preferredTheme;
  }

  const systemTheme = resolveSystemTheme();
  if (availableModes.includes(systemTheme)) {
    return systemTheme;
  }

  return availableModes.includes("dark") ? "dark" : availableModes[0]!;
}

function applyThemeToDocument(
  nextTheme: ThemeMode,
  disableTransitions: boolean,
  timerRef: { current: number | null },
) {
  const root = document.documentElement;
  const darkClassActive =
    nextTheme === "dark" ||
    (nextTheme === "system" && resolveSystemTheme() === "dark");

  /* Keep theme flips paint-cheap by suppressing transition interpolation for a single frame window.
     This prevents the heavy protected-shell surfaces from animating every color token change at once. */
  if (disableTransitions) {
    root.classList.add("theme-switching");

    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }

    timerRef.current = window.setTimeout(() => {
      root.classList.remove("theme-switching");
      timerRef.current = null;
    }, 220);
  }

  root.setAttribute("data-theme", nextTheme);
  root.classList.toggle("dark", darkClassActive);
  root.style.colorScheme = darkClassActive ? "dark" : "light";
}

function writeCookie(name: string, value: string) {
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax${secure}`;
}

export function ThemeToggle({
  value,
  label,
  labels,
  variant = "default",
  modes,
}: ThemeToggleProps) {
  const [optimisticTheme, setOptimisticTheme] = useState<ThemeMode>(value);
  const themeSwitchingTimerRef = useRef<number | null>(null);
  const compact = variant === "compact";
  const toolbar = variant === "toolbar";
  const cycleIcon = variant === "cycle-icon";
  const availableModes = useMemo(
    () => (modes?.length ? [...new Set(modes)] : THEME_ORDER),
    [modes],
  );

  useEffect(() => {
    setOptimisticTheme(value);
  }, [value]);

  useEffect(() => {
    if (optimisticTheme !== "system") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handlePreferenceChange = () => {
      applyThemeToDocument("system", false, themeSwitchingTimerRef);
    };

    mediaQuery.addEventListener("change", handlePreferenceChange);
    return () => {
      mediaQuery.removeEventListener("change", handlePreferenceChange);
    };
  }, [optimisticTheme]);

  /* The protected sidebar now exposes only light/dark while older cookies may still carry
     "system". Resolve the visible selection from the active media preference so the relocated
     shell control stays truthful without reintroducing a third visible option. */
  const displayedTheme = resolveDisplayedTheme(optimisticTheme, availableModes);

  function applyTheme(nextTheme: ThemeMode) {
    if (nextTheme === optimisticTheme) {
      return;
    }

    setOptimisticTheme(nextTheme);
    writeCookie(ENV_KEYS.themeCookie, nextTheme);
    applyThemeToDocument(nextTheme, true, themeSwitchingTimerRef);
  }

  if (cycleIcon) {
    const ActiveThemeIcon = THEME_ICONS[displayedTheme];
    const nextTheme =
      availableModes[(availableModes.indexOf(displayedTheme) + 1) % availableModes.length];

    return (
      <div className="toggle-group toggle-group--cycle-icon">
        <p className="sr-only">{label}</p>
        <div className="toggle-shell">
          <button
            type="button"
            aria-label={`${label}: ${labels[displayedTheme]}`}
            title={`${label}: ${labels[displayedTheme]}`}
            onClick={() => applyTheme(nextTheme)}
            className="toggle-button toggle-button--idle"
          >
            <ActiveThemeIcon className="h-4 w-4" />
            <span className="sr-only">{labels[displayedTheme]}</span>
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
        {availableModes.map((theme) => {
          const selected = displayedTheme === theme;
          return (
            <button
              key={theme}
              type="button"
              aria-pressed={selected}
              aria-label={`${label}: ${labels[theme]}`}
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
