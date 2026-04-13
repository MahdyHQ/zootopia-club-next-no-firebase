"use client";

import { ENV_KEYS } from "@zootopia/shared-config";
import type { Locale } from "@zootopia/shared-types";
import { Globe, Languages } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

type LocaleToggleProps = {
  value: Locale;
  label: string;
  labels: Record<Locale, string>;
  variant?: "default" | "compact" | "toolbar" | "cycle-icon";
};

const LOCALE_ORDER: Locale[] = ["en", "ar"];
const LOCALE_ICONS = {
  en: Globe,
  ar: Languages,
} satisfies Record<Locale, typeof Globe>;

function writeCookie(name: string, value: string) {
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax${secure}`;
}

export function LocaleToggle({
  value,
  label,
  labels,
  variant = "default",
}: LocaleToggleProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const compact = variant === "compact";
  const toolbar = variant === "toolbar";
  const cycleIcon = variant === "cycle-icon";

  function applyLocale(nextLocale: Locale) {
    writeCookie(ENV_KEYS.localeCookie, nextLocale);
    startTransition(() => {
      router.refresh();
    });
  }

  if (cycleIcon) {
    const activeLocale = value === "ar" ? "ar" : "en";
    const ActiveLocaleIcon = LOCALE_ICONS[activeLocale];
    const nextLocale = LOCALE_ORDER[(LOCALE_ORDER.indexOf(activeLocale) + 1) % LOCALE_ORDER.length];

    return (
      <div className="toggle-group toggle-group--cycle-icon">
        <p className="sr-only">{label}</p>
        <div className="toggle-shell">
          <button
            type="button"
            aria-label={`${label}: ${labels[activeLocale]}`}
            title={`${label}: ${labels[activeLocale]}`}
            disabled={isPending}
            onClick={() => applyLocale(nextLocale)}
            className="toggle-button toggle-button--idle"
          >
            <ActiveLocaleIcon className="h-4 w-4" />
            <span className="sr-only">{labels[activeLocale]}</span>
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
        {(["en", "ar"] as const).map((locale) => {
          const selected = value === locale;
          return (
            <button
              key={locale}
              type="button"
              aria-pressed={selected}
              aria-label={`${label}: ${labels[locale]}`}
              disabled={isPending}
              onClick={() => applyLocale(locale)}
              className={`toggle-button ${
                selected
                  ? "toggle-button--selected"
                  : "toggle-button--idle"
              }`}
            >
              {labels[locale]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
