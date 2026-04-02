import { apiError, apiSuccess } from "@/lib/server/api";
import { getAdminOverviewData } from "@/lib/server/repository";
import { getRuntimeFlags } from "@/lib/server/runtime";
import { getAdminSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";

export async function GET() {
  const user = await getAdminSessionUser();
  if (!user) {
    return apiError("FORBIDDEN", "Admin access is required.", 403);
  }

  return apiSuccess({
    overview: await getAdminOverviewData(),
    runtimeFlags: getRuntimeFlags(),
  });
}
