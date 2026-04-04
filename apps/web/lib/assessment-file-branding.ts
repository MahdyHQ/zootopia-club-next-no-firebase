import { APP_NAME, APP_TAGLINE } from "@zootopia/shared-config";

import { PROTECTED_SIGNATURE_TEXT } from "@/lib/branding/protected-signature";

export type AssessmentFileThemeMode = "light" | "dark";

export const ASSESSMENT_FILE_QR_TARGET = "https://linktr.ee/ebnabdallah";
export const ASSESSMENT_FILE_LOGO_ASSET_URL = "/favicon.svg";

export const ASSESSMENT_FILE_BACKGROUND_URLS = {
  light: "/light-file-background.png",
  dark: "/dark-file-background.png",
} as const satisfies Record<AssessmentFileThemeMode, string>;

export function resolveAssessmentFileThemeMode(
  value: string | null | undefined,
  fallback: AssessmentFileThemeMode = "dark",
): AssessmentFileThemeMode {
  return value === "light" || value === "dark" ? value : fallback;
}

export function appendAssessmentThemeToHref(
  href: string,
  themeMode: AssessmentFileThemeMode,
) {
  const [pathWithSearch, hash = ""] = href.split("#", 2);
  const [pathname, search = ""] = pathWithSearch.split("?", 2);
  const searchParams = new URLSearchParams(search);
  searchParams.set("theme", themeMode);
  const resolvedSearch = searchParams.toString();

  return `${pathname}${resolvedSearch ? `?${resolvedSearch}` : ""}${hash ? `#${hash}` : ""}`;
}

export function buildAssessmentFileSurface(input: {
  platformName?: string | null;
  platformTagline?: string | null;
}) {
  // This shared file-surface descriptor keeps detached preview pages and export renderers
  // aligned on one branding/background source of truth. Future agents should extend it here
  // instead of scattering logo, QR target, or file-background paths across separate renderers.
  return {
    platformName: input.platformName?.trim() || APP_NAME,
    platformTagline: input.platformTagline?.trim() || APP_TAGLINE,
    logoAssetUrl: ASSESSMENT_FILE_LOGO_ASSET_URL,
    qrTargetUrl: ASSESSMENT_FILE_QR_TARGET,
    footerText: PROTECTED_SIGNATURE_TEXT,
    backgroundLightUrl: ASSESSMENT_FILE_BACKGROUND_URLS.light,
    backgroundDarkUrl: ASSESSMENT_FILE_BACKGROUND_URLS.dark,
  };
}
