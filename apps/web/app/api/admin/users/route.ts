import type { AdminUsersResponse } from "@zootopia/shared-types";

import { apiError, apiSuccess } from "@/lib/server/api";
import { listUsers } from "@/lib/server/repository";
import { getAdminSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";

export async function GET() {
  const user = await getAdminSessionUser();
  if (!user) {
    return apiError("FORBIDDEN", "Admin access is required.", 403);
  }

  const payload: AdminUsersResponse = {
    users: await listUsers(),
  };

  return apiSuccess(payload);
}
