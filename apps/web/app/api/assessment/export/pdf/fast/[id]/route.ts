import { apiError } from "@/lib/server/api";
import { buildAssessmentExportRouteContext } from "@/lib/server/assessment-export-route-context";
import {
  buildAssessmentFastPdfResponse,
  describeAssessmentFastPdfFailure,
} from "@/lib/server/assessment-fast-pdf-export";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const resolved = await buildAssessmentExportRouteContext(request, id);
  if ("error" in resolved) {
    return resolved.error;
  }

  try {
    /* The Fast lane intentionally stays the lightweight same-origin browser-print surface.
       Keep its responsibility limited to quick HTML/print export so the Pro lane can evolve
       independently without inheriting this route's speed-first constraints. */
    return await buildAssessmentFastPdfResponse(resolved);
  } catch (error) {
    console.error("Assessment Fast PDF export failed.", {
      assessmentId: id,
      ...describeAssessmentFastPdfFailure(error),
    });
    return apiError(
      "ASSESSMENT_FAST_PDF_EXPORT_FAILED",
      "The fast assessment PDF view could not be generated right now.",
      500,
    );
  }
}
