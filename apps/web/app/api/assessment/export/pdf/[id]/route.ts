import {
  buildAssessmentFastPdfExportRoute,
  buildAssessmentProPdfExportRoute,
} from "@/lib/assessment-routes";
import {
  getServerRuntimeOrigin,
  resolveRequestUrlWithServerBase,
} from "@/lib/server/runtime-base-url";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const requestUrl = resolveRequestUrlWithServerBase(request);
  const surface = requestUrl.searchParams.get("surface");
  const targetPath =
    surface === "print"
      ? buildAssessmentFastPdfExportRoute(id)
      : buildAssessmentProPdfExportRoute(id);

  /* This route is now compatibility-only. Keep it as a thin redirect so older links still work
     while all real generation logic lives in the explicit Pro and Fast lane routes above. */
  requestUrl.searchParams.delete("surface");
  /* SECURITY: Build redirects from server-owned runtime origin instead of request origin so
     untrusted host headers cannot turn this compatibility route into an open redirect surface. */
  const redirectUrl = new URL(targetPath, getServerRuntimeOrigin());
  redirectUrl.search = requestUrl.searchParams.toString();

  return Response.redirect(redirectUrl, 307);
}
