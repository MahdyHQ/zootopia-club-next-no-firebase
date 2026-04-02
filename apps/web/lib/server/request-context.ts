import "server-only";

import { ENV_KEYS } from "@zootopia/shared-config";
import type { Locale, ThemeMode } from "@zootopia/shared-types";
import { cookies } from "next/headers";

import { getMessages, type AppMessages } from "@/lib/messages";
import {
  directionForLocale,
  resolveLocale,
  resolveThemeMode,
} from "@/lib/preferences";

export async function getRequestLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  return resolveLocale(cookieStore.get(ENV_KEYS.localeCookie)?.value);
}

export async function getRequestThemeMode(): Promise<ThemeMode> {
  const cookieStore = await cookies();
  return resolveThemeMode(cookieStore.get(ENV_KEYS.themeCookie)?.value);
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
