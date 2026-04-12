import { apiError, applyNoStore } from "@/lib/server/api";
import {
  buildAdminUsersExportFileName,
  buildAdminUsersWorkbookBuffer,
  listAdminUserAuthMetadataByUid,
} from "@/lib/server/admin-users-excel-export";
import {
  appendAdminLog,
  getAdminAssessmentCreditStateForUser,
  listUsers,
} from "@/lib/server/repository";
import { getAdminSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";

export async function GET() {
  const adminUser = await getAdminSessionUser();
  if (!adminUser) {
    return applyNoStore(apiError("FORBIDDEN", "Admin access is required.", 403));
  }

  try {
    const [users, authMetadataByUid] = await Promise.all([
      listUsers(),
      listAdminUserAuthMetadataByUid(),
    ]);

    /* Keep export credit columns sourced from the same authoritative admin credit repository path
       so workbook values match the live admin credits panel and mutation route behavior. */
    const creditStateEntries = await Promise.all(
      users.map(async (user) => [
        user.uid,
        await getAdminAssessmentCreditStateForUser(user.uid),
      ] as const),
    );
    const creditStateByUid = new Map<
      string,
      NonNullable<Awaited<ReturnType<typeof getAdminAssessmentCreditStateForUser>>>
    >();
    for (const [ownerUid, state] of creditStateEntries) {
      if (state) {
        creditStateByUid.set(ownerUid, state);
      }
    }

    const workbookBuffer = await buildAdminUsersWorkbookBuffer({
      users,
      authMetadataByUid,
      creditStateByUid,
    });
    const fileName = buildAdminUsersExportFileName();

    await appendAdminLog({
      actorUid: adminUser.uid,
      actorRole: adminUser.role,
      ownerUid: adminUser.uid,
      ownerRole: adminUser.role,
      action: "admin-users-export-xlsx",
      resourceType: "admin-export",
      resourceId: "users",
      route: "/api/admin/users/export",
      metadata: {
        recordCount: users.length,
        format: "xlsx",
      },
    });

    return new Response(new Uint8Array(workbookBuffer), {
      headers: {
        "content-type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${fileName}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return applyNoStore(
      apiError(
        "ADMIN_USERS_EXPORT_FAILED",
        error instanceof Error
          ? error.message
          : "Unable to generate the users export workbook.",
        500,
      ),
    );
  }
}
