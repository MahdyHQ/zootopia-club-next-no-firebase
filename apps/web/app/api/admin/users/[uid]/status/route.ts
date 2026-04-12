import type { UserStatus } from "@zootopia/shared-types";

import { apiError, apiSuccess, applyNoStore } from "@/lib/server/api";
import { appendAdminLog, setUserStatus } from "@/lib/server/repository";
import { getAdminSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";
const ADMIN_STATUS_MUTATION_ROUTE = "/api/admin/users/[uid]/status";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ uid: string }> },
) {
  // Blocking and unblocking belong to the active admin session on the server. The client table may
  // request a change, but the repository layer owns the persisted status plus Supabase Auth sync.
  const admin = await getAdminSessionUser();
  if (!admin) {
    return applyNoStore(apiError("FORBIDDEN", "Admin access is required.", 403));
  }

  const { uid } = await context.params;
  if (uid === admin.uid) {
    return applyNoStore(
      apiError(
        "SELF_UPDATE_BLOCKED",
        "Admins cannot change their own status here.",
        400,
      ),
    );
  }

  let body: { status?: UserStatus };

  try {
    body = (await request.json()) as { status?: UserStatus };
  } catch {
    return applyNoStore(apiError("INVALID_JSON", "Request body must be valid JSON.", 400));
  }

  if (body.status !== "active" && body.status !== "suspended") {
    return applyNoStore(
      apiError(
        "STATUS_INVALID",
        "Status must be either active or suspended.",
        400,
      ),
    );
  }

  console.info("[admin-users-mutation]", {
    action: "set-status",
    targetUid: uid,
    actingAdminUid: admin.uid,
    routeHit: ADMIN_STATUS_MUTATION_ROUTE,
    requestedStatus: body.status,
    backendMutationResult: "started",
  });

  try {
    const user = await setUserStatus(uid, body.status);
    await appendAdminLog({
      actorUid: admin.uid,
      action: `set-status:${body.status}`,
      targetUid: uid,
    });

    console.info("[admin-users-mutation]", {
      action: "set-status",
      targetUid: uid,
      actingAdminUid: admin.uid,
      routeHit: ADMIN_STATUS_MUTATION_ROUTE,
      requestedStatus: body.status,
      backendMutationResult: "success",
    });

    return applyNoStore(apiSuccess({ user }));
  } catch (error) {
    console.warn("[admin-users-mutation]", {
      action: "set-status",
      targetUid: uid,
      actingAdminUid: admin.uid,
      routeHit: ADMIN_STATUS_MUTATION_ROUTE,
      requestedStatus: body.status,
      backendMutationResult: "failed",
      failureReason: error instanceof Error ? error.message : "STATUS_UPDATE_FAILED",
    });

    return applyNoStore(
      apiError(
        "STATUS_UPDATE_FAILED",
        error instanceof Error ? error.message : "Unable to update status.",
        400,
      ),
    );
  }
}
