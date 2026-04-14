import { apiError } from "@/lib/server/api";
import { buildAssessmentExportRouteContext } from "@/lib/server/assessment-export-route-context";
import {
  buildAssessmentProPdfResponse,
  describeAssessmentProPdfFailure,
} from "@/lib/server/assessment-pro-pdf-export";

export const runtime = "nodejs";
/* The Pro lane performs Puppeteer capture plus artifact persistence on Vercel. Keep its
   function duration explicit so premium PDF work does not inherit the shorter defaults that are
   fine for lightweight JSON/HTML lanes but risky for browser-backed capture flows. */
export const maxDuration = 120;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  let resolved: Awaited<ReturnType<typeof buildAssessmentExportRouteContext>>;
  try {
    resolved = await buildAssessmentExportRouteContext(request, id);
  } catch (error) {
    const details = describeAssessmentProPdfFailure(error);
    console.error("Assessment Pro PDF export failed.", {
      assessmentId: id,
      stage: "route-context",
      errorCode: details.errorCode,
      cause: details.cause,
      message: "Assessment Pro PDF route context resolution failed.",
    });
    return apiError(
      "ASSESSMENT_PDF_EXPORT_FAILED",
      "The assessment PDF could not be generated right now.",
      500,
    );
  }

  if ("error" in resolved) {
    return resolved.error;
  }

  try {
    /* The Pro lane is the premium Puppeteer/Chromium boundary for real downloadable PDFs.
       Future premium rendering work should expand here instead of reaching back into the Fast
       browser-print route or reintroducing mixed lane logic in the legacy alias route. */
    return await buildAssessmentProPdfResponse(resolved);
  } catch (error) {
    console.error("Assessment Pro PDF export failed.", {
      assessmentId: id,
      ...describeAssessmentProPdfFailure(error),
    });
    return apiError(
      "ASSESSMENT_PDF_EXPORT_FAILED",
      "The assessment PDF could not be generated right now.",
      500,
    );
  }
}
