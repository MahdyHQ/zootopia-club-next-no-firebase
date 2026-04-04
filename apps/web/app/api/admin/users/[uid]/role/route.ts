import type { UserRole } from "@zootopia/shared-types";

import { apiError, apiSuccess } from "@/lib/server/api";
import { appendAdminLog, setUserRole } from "@/lib/server/repository";
import { getAdminSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ uid: string }> },
) {
  // Role changes stay server-authoritative here so admin-only privilege controls never depend on
  // hidden client UI state or become reachable from regular user routes.
  const admin = await getAdminSessionUser();
  if (!admin) {
    return apiError("FORBIDDEN", "Admin access is required.", 403);
  }

  const { uid } = await context.params;
  if (uid === admin.uid) {
    return apiError("SELF_UPDATE_BLOCKED", "Admins cannot change their own role here.", 400);
  }

  let body: { role?: UserRole };

  try {
    body = (await request.json()) as { role?: UserRole };
  } catch {
    return apiError("INVALID_JSON", "Request body must be valid JSON.", 400);
  }

  if (body.role !== "admin" && body.role !== "user") {
    return apiError("ROLE_INVALID", "Role must be either admin or user.", 400);
  }

  try {
    const user = await setUserRole(uid, body.role);
    await appendAdminLog({
      actorUid: admin.uid,
      action: `set-role:${body.role}`,
      targetUid: uid,
    });

    return apiSuccess({ user });
  } catch (error) {
    return apiError(
      "ROLE_UPDATE_FAILED",
      error instanceof Error ? error.message : "Unable to update role.",
      400,
    );
  }
}
