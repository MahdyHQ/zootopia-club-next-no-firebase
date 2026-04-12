import "server-only";

import {
  DEFAULT_ASSESSMENT_FILE_THEME_MODE,
  resolveAssessmentFileThemeMode,
} from "@/lib/assessment-file-branding";
import { isProfileCompletionRequired } from "@/lib/return-to";
import { apiError } from "@/lib/server/api";
import { buildAssessmentPreview } from "@/lib/server/assessment-preview";
import { getAssessmentGenerationForOwner } from "@/lib/server/repository";
import { getRequestUiContext } from "@/lib/server/request-context";
import { resolveRequestUrlWithServerBase } from "@/lib/server/runtime-base-url";
import { getAuthenticatedSessionUser } from "@/lib/server/session";

export type AssessmentExportRouteContext = {
  generation: NonNullable<Awaited<ReturnType<typeof getAssessmentGenerationForOwner>>>;
  preview: ReturnType<typeof buildAssessmentPreview>;
  requestUrl: URL;
  themeMode: "light" | "dark";
  uiContext: Awaited<ReturnType<typeof getRequestUiContext>>;
  user: NonNullable<Awaited<ReturnType<typeof getAuthenticatedSessionUser>>>;
};

export async function buildAssessmentExportRouteContext(request: Request, id: string) {
  const user = await getAuthenticatedSessionUser();
  if (!user) {
    return {
      error: apiError("UNAUTHENTICATED", "Sign in is required for assessments.", 401),
    } as const;
  }

  if (isProfileCompletionRequired(user)) {
    return {
      error: apiError(
        "PROFILE_INCOMPLETE",
        "Complete your profile in Settings before accessing assessment output.",
        403,
      ),
    } as const;
  }

  const generation = await getAssessmentGenerationForOwner(id, user.uid, {
    includeExpired: true,
  });

  if (!generation) {
    return {
      error: apiError("ASSESSMENT_NOT_FOUND", "Assessment generation not found.", 404),
    } as const;
  }

  if (generation.status === "expired") {
    return {
      error: apiError(
        "ASSESSMENT_EXPIRED",
        "Assessment generation has expired and is no longer available.",
        410,
      ),
    } as const;
  }

  const uiContext = await getRequestUiContext();
  const requestUrl = resolveRequestUrlWithServerBase(request);
  const themeMode = resolveAssessmentFileThemeMode(
    requestUrl.searchParams.get("theme"),
    /* Assessment preview/export surfaces intentionally default to the light file theme even when
       the broader authenticated workspace is dark. Keep that default isolated here so both PDF
       lanes and detached preview/result pages inherit the same file-surface starting point. */
    DEFAULT_ASSESSMENT_FILE_THEME_MODE,
  );

  return {
    generation,
    preview: buildAssessmentPreview({
      generation,
      locale: uiContext.locale,
      messages: uiContext.messages,
    }),
    requestUrl,
    themeMode,
    uiContext,
    user,
  } satisfies AssessmentExportRouteContext;
}
