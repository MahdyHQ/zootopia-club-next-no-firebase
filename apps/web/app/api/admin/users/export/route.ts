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

function getErrorCode(error: unknown) {
  if (typeof error === "object" && error && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code.trim()) {
      return code;
    }
  }

  if (error instanceof Error) {
    return error.name || "Error";
  }

  return "UNKNOWN";
}

export async function GET() {
  const adminUser = await getAdminSessionUser();
  if (!adminUser) {
    return applyNoStore(apiError("FORBIDDEN", "Admin access is required.", 403));
  }

  try {
    const users = await listUsers();
    const authMetadataByUid = await listAdminUserAuthMetadataByUid().catch((error) => {
      console.warn("[admin-users-export] auth metadata lookup failed", {
        errorCode: getErrorCode(error),
      });
      return new Map();
    });

    /* Export credit columns must stay repository-authoritative, but we process users one-by-one
       so a single transient credit lookup failure cannot crash the full workbook response. */
    const creditStateByUid = new Map<
      string,
      NonNullable<Awaited<ReturnType<typeof getAdminAssessmentCreditStateForUser>>>
    >();

    for (const user of users) {
      try {
        const state = await getAdminAssessmentCreditStateForUser(user.uid, {
          ownerRole: user.role,
        });
        if (state) {
          creditStateByUid.set(user.uid, state);
        }
      } catch (error) {
        console.warn("[admin-users-export] user credit state lookup failed", {
          targetUid: user.uid,
          errorCode: getErrorCode(error),
        });
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
    console.error("[admin-users-export] workbook generation failed", {
      errorCode: getErrorCode(error),
    });
    return applyNoStore(
      apiError(
        "ADMIN_USERS_EXPORT_FAILED",
        "Unable to generate the users export workbook.",
        500,
      ),
    );
  }
}
