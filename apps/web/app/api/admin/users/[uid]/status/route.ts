import type { UserStatus } from "@zootopia/shared-types";

import { apiError, apiSuccess } from "@/lib/server/api";
import { appendAdminLog, setUserStatus } from "@/lib/server/repository";
import { getAdminSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ uid: string }> },
) {
  // Blocking and unblocking belong to the active admin session on the server. The client table may
  // request a change, but the repository layer owns the persisted status plus Firebase Auth sync.
  const admin = await getAdminSessionUser();
  if (!admin) {
    return apiError("FORBIDDEN", "Admin access is required.", 403);
  }

  const { uid } = await context.params;
  if (uid === admin.uid) {
    return apiError(
      "SELF_UPDATE_BLOCKED",
      "Admins cannot change their own status here.",
      400,
    );
  }

  let body: { status?: UserStatus };

  try {
    body = (await request.json()) as { status?: UserStatus };
  } catch {
    return apiError("INVALID_JSON", "Request body must be valid JSON.", 400);
  }

  if (body.status !== "active" && body.status !== "suspended") {
    return apiError(
      "STATUS_INVALID",
      "Status must be either active or suspended.",
      400,
    );
  }

  try {
    const user = await setUserStatus(uid, body.status);
    await appendAdminLog({
      actorUid: admin.uid,
      action: `set-status:${body.status}`,
      targetUid: uid,
    });

    return apiSuccess({ user });
  } catch (error) {
    return apiError(
      "STATUS_UPDATE_FAILED",
      error instanceof Error ? error.message : "Unable to update status.",
      400,
    );
  }
}
