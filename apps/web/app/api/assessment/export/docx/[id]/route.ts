import { isProfileCompletionRequired } from "@/lib/return-to";
import { apiError } from "@/lib/server/api";
import {
  buildAssessmentDocxExport,
  buildAssessmentExportFileBase,
} from "@/lib/server/assessment-exporter";
import { buildAssessmentPreview } from "@/lib/server/assessment-preview";
import { getAssessmentGenerationForViewer } from "@/lib/server/repository";
import { getRequestUiContext } from "@/lib/server/request-context";
import { getAuthenticatedSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getAuthenticatedSessionUser();
  if (!user) {
    return apiError("UNAUTHENTICATED", "Sign in is required for assessments.", 401);
  }
  if (isProfileCompletionRequired(user)) {
    return apiError(
      "PROFILE_INCOMPLETE",
      "Complete your profile in Settings before accessing assessment output.",
      403,
    );
  }

  const { id } = await context.params;
  const generation = await getAssessmentGenerationForViewer(id, user, {
    includeExpired: true,
  });

  if (!generation) {
    return apiError("ASSESSMENT_NOT_FOUND", "Assessment generation not found.", 404);
  }

  if (generation.status === "expired") {
    return apiError(
      "ASSESSMENT_EXPIRED",
      "Assessment generation has expired and is no longer available.",
      410,
    );
  }

  const uiContext = await getRequestUiContext();
  const preview = buildAssessmentPreview({
    generation,
    locale: uiContext.locale,
    messages: uiContext.messages,
  });
  const fileBase = buildAssessmentExportFileBase(preview);
  const buffer = await buildAssessmentDocxExport(preview);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "content-disposition": `attachment; filename="${fileBase}.docx"`,
    },
  });
}
