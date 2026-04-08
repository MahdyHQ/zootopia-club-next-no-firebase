import { apiError } from "@/lib/server/api";
import {
  buildAdminUsersExportFileName,
  buildAdminUsersWorkbookBuffer,
  listAdminUserAuthMetadataByUid,
} from "@/lib/server/admin-users-excel-export";
import { appendAdminLog, listUsers } from "@/lib/server/repository";
import { getAdminSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";

export async function GET() {
  const adminUser = await getAdminSessionUser();
  if (!adminUser) {
    return apiError("FORBIDDEN", "Admin access is required.", 403);
  }

  try {
    const [users, authMetadataByUid] = await Promise.all([
      listUsers(),
      listAdminUserAuthMetadataByUid(),
    ]);

    const workbookBuffer = await buildAdminUsersWorkbookBuffer({
      users,
      authMetadataByUid,
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
    return apiError(
      "ADMIN_USERS_EXPORT_FAILED",
      error instanceof Error
        ? error.message
        : "Unable to generate the users export workbook.",
      500,
    );
  }
}
