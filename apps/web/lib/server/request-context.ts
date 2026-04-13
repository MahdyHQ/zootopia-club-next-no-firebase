import "server-only";

import { ENV_KEYS } from "@zootopia/shared-config";
import type { Locale, ThemeMode } from "@zootopia/shared-types";
import { cookies } from "next/headers";

import { getMessages, type AppMessages } from "@/lib/messages";
import {
  directionForLocale,
  resolveInitialThemeMode,
  resolveLocale,
  resolveThemeMode,
} from "@/lib/preferences";

const DEFAULT_THEME_MODE_ENV_KEY = "ZOOTOPIA_DEFAULT_THEME_MODE";

export async function getRequestLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  return resolveLocale(cookieStore.get(ENV_KEYS.localeCookie)?.value);
}

export async function getRequestThemeMode(): Promise<ThemeMode> {
  const cookieStore = await cookies();

  /* Auth and public shells must start in a deterministic dark/light mode before any user
     preference cookie exists. Keep this env gate strict (dark|light only) so invalid values
     never destabilize bootstrap and always fail closed to dark. */
  const initialThemeMode = resolveInitialThemeMode(
    process.env[DEFAULT_THEME_MODE_ENV_KEY],
  );

  return resolveThemeMode(cookieStore.get(ENV_KEYS.themeCookie)?.value, initialThemeMode);
}

export async function getRequestUiContext(): Promise<{
  locale: Locale;
  themeMode: ThemeMode;
  direction: "ltr" | "rtl";
  messages: AppMessages;
}> {
  const locale = await getRequestLocale();
  const themeMode = await getRequestThemeMode();

  return {
    locale,
    themeMode,
    direction: directionForLocale(locale),
    messages: await getMessages(locale),
  };
}
