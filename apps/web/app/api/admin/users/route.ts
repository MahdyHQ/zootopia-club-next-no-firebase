import type { AdminUsersResponse } from "@zootopia/shared-types";

import { apiError, apiSuccess, applyNoStore } from "@/lib/server/api";
import { listUsers } from "@/lib/server/repository";
import { getAdminSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";
/* Admin user lists are mutable privileged records; keep this route fully dynamic so
  access/session checks and user state are never served from route cache snapshots. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const user = await getAdminSessionUser();
  if (!user) {
    return applyNoStore(apiError("FORBIDDEN", "Admin access is required.", 403));
  }

  try {
    const payload: AdminUsersResponse = {
      users: await listUsers(),
    };

    return applyNoStore(apiSuccess(payload));
  } catch (error) {
    console.error("[api-admin-users] failed to list users", {
      adminUid: user.uid,
      error: error instanceof Error ? error.name : "UNKNOWN",
    });
    return applyNoStore(
      apiError("ADMIN_USERS_UNAVAILABLE", "Users are temporarily unavailable.", 503),
    );
  }
}
