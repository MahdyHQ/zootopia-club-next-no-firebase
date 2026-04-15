import { apiError, apiSuccess, applyNoStore } from "@/lib/server/api";
import { getAdminOverviewData } from "@/lib/server/repository";
import { getRuntimeFlags } from "@/lib/server/runtime";
import { getAdminSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";
/* Admin overview payload includes mutable privileged data and must always resolve fresh
  per request/session in server runtime; never allow ISR/route-cache reuse here. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const user = await getAdminSessionUser();
  if (!user) {
    return applyNoStore(apiError("FORBIDDEN", "Admin access is required.", 403));
  }

  try {
    return applyNoStore(
      apiSuccess({
        overview: await getAdminOverviewData(),
        runtimeFlags: getRuntimeFlags(),
      }),
    );
  } catch (error) {
    console.error("[api-admin-overview] failed to load admin overview", {
      adminUid: user.uid,
      error: error instanceof Error ? error.name : "UNKNOWN",
    });
    return applyNoStore(
      apiError(
        "ADMIN_OVERVIEW_UNAVAILABLE",
        "Admin overview data is temporarily unavailable.",
        503,
      ),
    );
  }
}
