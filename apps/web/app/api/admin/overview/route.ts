import { apiError, apiSuccess, applyNoStore } from "@/lib/server/api";
import { getAdminOverviewData } from "@/lib/server/repository";
import { getRuntimeFlags } from "@/lib/server/runtime";
import { getAdminSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";

export async function GET() {
  const user = await getAdminSessionUser();
  if (!user) {
    return applyNoStore(apiError("FORBIDDEN", "Admin access is required.", 403));
  }

  return applyNoStore(
    apiSuccess({
      overview: await getAdminOverviewData(),
      runtimeFlags: getRuntimeFlags(),
    }),
  );
}
