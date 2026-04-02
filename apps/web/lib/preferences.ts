import { ENV_KEYS } from "@zootopia/shared-config";
import type { Locale, ThemeMode } from "@zootopia/shared-types";

export const DEFAULT_LOCALE: Locale = "en";
export const DEFAULT_THEME: ThemeMode = "dark";

export function resolveLocale(value: string | null | undefined): Locale {
  return value === "ar" ? "ar" : "en";
}

export function resolveThemeMode(value: string | null | undefined): ThemeMode {
  if (value === "light" || value === "dark" || value === "system") {
    return value;
  }

  return DEFAULT_THEME;
}

export function directionForLocale(locale: Locale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

export function getPreferenceCookieOptions() {
  return {
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  };
}

export function getSessionCookieOptions(maxAgeSeconds: number) {
  return {
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    maxAge: maxAgeSeconds,
  };
}

export { ENV_KEYS };
