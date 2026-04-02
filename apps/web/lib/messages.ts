import type { Locale } from "@zootopia/shared-types";

import ar from "@/messages/ar.json";
import en from "@/messages/en.json";

export type AppMessages = typeof en;

const DICTIONARIES: Record<Locale, AppMessages> = {
  en,
  ar,
};

export async function getMessages(locale: Locale): Promise<AppMessages> {
  return DICTIONARIES[locale];
}
