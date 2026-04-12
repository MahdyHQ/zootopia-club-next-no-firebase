import "server-only";

import type { SessionUser } from "@zootopia/shared-types";

import { apiError, apiSuccess, applyNoStore } from "@/lib/server/api";
import {
  listDocumentsForUser,
  listAssessmentGenerationsForUser,
  listInfographicGenerationsForUser,
  getUserByUid,
  appendAdminLog,
} from "@/lib/server/repository";
import { getAdminSessionUser } from "@/lib/server/session";
import {
  listZootopiaPrivateObjectsByPrefix,
  deleteZootopiaPrivateObjectsBatch,
  hasRemoteBlobStorage,
} from "@/lib/server/supabase-blob-storage";

export const runtime = "nodejs";

const STORAGE_CLEANUP_ROUTE = "/api/admin/storage/cleanup";
const USER_OWNED_STORAGE_NAMESPACES = [
  "uploads/temp",
  "documents",
  "assessment-results",
  "assessment-exports",
] as const;
const STORAGE_DELETE_BATCH_SIZE = 500;

type NamespaceCleanupBreakdown = {
  namespace: string;
  prefix: string;
  matchedCount: number;
  deletedCount: number;
  failedCount: number;
};

async function deleteNamespaceObjectsInBatches(input: {
  namespace: string;
  prefix: string;
  paths: string[];
}) {
  let deletedCount = 0;

  for (let i = 0; i < input.paths.length; i += STORAGE_DELETE_BATCH_SIZE) {
    const batch = input.paths.slice(i, i + STORAGE_DELETE_BATCH_SIZE);
    const batchDeleted = await deleteZootopiaPrivateObjectsBatch(batch);
    deletedCount += batchDeleted;
  }

  return {
    namespace: input.namespace,
    prefix: input.prefix,
    matchedCount: input.paths.length,
    deletedCount,
    failedCount: input.paths.length - deletedCount,
  } satisfies NamespaceCleanupBreakdown;
}

/**
 * Admin-only storage cleanup endpoint.
 *
 * Supports two modes:
 * 1. Per-user cleanup: { mode: "user", targetUid: string }
 *    - Deletes all storage objects for a specific user across all namespaces
 * 2. Global cleanup: { mode: "global", scope: string }
 *    - Deletes all storage objects in the specified scope(s)
 *
 * Both modes require admin authentication and explicit confirmation.
 */
export async function POST(request: Request) {
  const admin = await getAdminSessionUser();
  if (!admin) {
    return applyNoStore(apiError("FORBIDDEN", "Admin access is required.", 403));
  }

  let body: {
    mode?: string;
    targetUid?: string;
    scope?: string;
    confirmation?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return applyNoStore(apiError("INVALID_JSON", "Request body must be valid JSON.", 400));
  }

  const mode = String(body.mode || "").trim();
  if (mode !== "user" && mode !== "global") {
    return applyNoStore(
      apiError(
        "INVALID_MODE",
        "Mode must be 'user' (per-user cleanup) or 'global' (all storage cleanup).",
        400,
      ),
    );
  }

  if (!hasRemoteBlobStorage()) {
    return applyNoStore(
      apiError(
        "STORAGE_UNAVAILABLE",
        "Remote storage is not available in this runtime.",
        503,
      ),
    );
  }

  if (mode === "user") {
    return handleUserCleanup(admin, body);
  }

  return handleGlobalCleanup(admin, body);
}

/**
 * Per-user storage cleanup: deletes all storage objects owned by a specific user.
 *
 * Scope: All user-owned namespaces under uploads/temp/{targetUid}/, documents/{targetUid}/,
 * assessment-results/{targetUid}/, and assessment-exports/{targetUid}/.
 *
 * Also deletes related DB records (documents, assessment generations, infographic generations).
 */
async function handleUserCleanup(admin: SessionUser, body: Record<string, unknown>) {
  const targetUid = String(body.targetUid || "").trim();
  if (!targetUid) {
    return applyNoStore(
      apiError("TARGET_UID_REQUIRED", "A target user uid is required for per-user cleanup.", 400),
    );
  }

  const confirmation = String(body.confirmation || "").trim();
  if (!confirmation) {
    return applyNoStore(
      apiError(
        "CONFIRMATION_REQUIRED",
        "Confirmation is required. Type the target user uid to confirm.",
        400,
      ),
    );
  }

  if (confirmation !== targetUid) {
    return applyNoStore(
      apiError(
        "CONFIRMATION_MISMATCH",
        "Confirmation must match the target user uid exactly.",
        400,
      ),
    );
  }

  const targetUser = await getUserByUid(targetUid);
  if (!targetUser) {
    return applyNoStore(apiError("USER_NOT_FOUND", "The target user was not found.", 404));
  }

  console.info("[admin-storage-cleanup]", {
    action: "cleanup-user-storage",
    targetUid,
    targetEmail: targetUser.email ?? null,
    actingAdminUid: admin.uid,
    route: STORAGE_CLEANUP_ROUTE,
    status: "started",
  });

  await appendAdminLog({
    actorUid: admin.uid,
    actorRole: admin.role,
    targetUid,
    ownerUid: targetUid,
    ownerRole: targetUser.role,
    action: "admin-storage-cleanup-user-started",
    resourceType: "storage",
    resourceId: targetUid,
    route: STORAGE_CLEANUP_ROUTE,
    metadata: {
      targetEmail: targetUser.email,
    },
  });

  const result = {
    targetUid,
    targetEmail: targetUser.email ?? null,
    actingAdminUid: admin.uid,
    namespaces: USER_OWNED_STORAGE_NAMESPACES,
    namespaceBreakdown: [] as NamespaceCleanupBreakdown[],
    // Storage results
    storageObjectsMatched: 0,
    storageObjectsDeleted: 0,
    storageObjectsFailed: 0,
    // DB visibility results (records are intentionally retained for history/audit).
    dbRowsUpdated: 0,
    dbRowsDeleted: 0,
    dbDocumentsRetained: 0,
    dbAssessmentsRetained: 0,
    dbInfographicsRetained: 0,
    // Overall
    finalResult: "success" as "success" | "partial_failure" | "failure",
    failureReason: null as string | null,
  };

  try {
    // Phase 1: enumerate and delete user-owned objects by namespace.
    for (const namespace of USER_OWNED_STORAGE_NAMESPACES) {
      const prefix = `${namespace}/${targetUid}`;
      const objects = await listZootopiaPrivateObjectsByPrefix(prefix);
      const breakdown = await deleteNamespaceObjectsInBatches({
        namespace,
        prefix,
        paths: objects,
      });

      result.namespaceBreakdown.push(breakdown);
      result.storageObjectsMatched += breakdown.matchedCount;
      result.storageObjectsDeleted += breakdown.deletedCount;
      result.storageObjectsFailed += breakdown.failedCount;
    }

    // Phase 2: collect related DB record counts for truthful reporting.
    // Storage cleanup is destructive; DB records are preserved as history/audit truth.
    const userDocuments = await listDocumentsForUser(targetUid, 500);
    result.dbDocumentsRetained = userDocuments.length;

    const userAssessments = await listAssessmentGenerationsForUser(targetUid, 500);
    result.dbAssessmentsRetained = userAssessments.length;

    const userInfographics = await listInfographicGenerationsForUser(targetUid, 500);
    result.dbInfographicsRetained = userInfographics.length;

    // Determine final result.
    if (result.storageObjectsFailed > 0) {
      result.finalResult = "partial_failure";
      result.failureReason = `${result.storageObjectsFailed} storage objects failed to delete.`;
    }

    await appendAdminLog({
      actorUid: admin.uid,
      actorRole: admin.role,
      targetUid,
      ownerUid: targetUid,
      ownerRole: targetUser.role,
      action: "admin-storage-cleanup-user-completed",
      resourceType: "storage",
      resourceId: targetUid,
      route: STORAGE_CLEANUP_ROUTE,
      metadata: {
        targetEmail: targetUser.email,
        namespaceCount: result.namespaceBreakdown.length,
        storageObjectsMatched: result.storageObjectsMatched,
        storageObjectsDeleted: result.storageObjectsDeleted,
        storageObjectsFailed: result.storageObjectsFailed,
        dbRowsUpdated: result.dbRowsUpdated,
        dbRowsDeleted: result.dbRowsDeleted,
        dbDocumentsRetained: result.dbDocumentsRetained,
        dbAssessmentsRetained: result.dbAssessmentsRetained,
        dbInfographicsRetained: result.dbInfographicsRetained,
        finalResult: result.finalResult,
      },
    });

    console.info("[admin-storage-cleanup]", {
      action: "cleanup-user-storage",
      targetUid,
      targetEmail: targetUser.email ?? null,
      actingAdminUid: admin.uid,
      route: STORAGE_CLEANUP_ROUTE,
      status: result.finalResult,
      namespaceBreakdown: result.namespaceBreakdown,
      storageObjectsMatched: result.storageObjectsMatched,
      storageObjectsDeleted: result.storageObjectsDeleted,
      storageObjectsFailed: result.storageObjectsFailed,
      dbRowsUpdated: result.dbRowsUpdated,
      dbRowsDeleted: result.dbRowsDeleted,
      dbDocumentsRetained: result.dbDocumentsRetained,
      dbAssessmentsRetained: result.dbAssessmentsRetained,
      dbInfographicsRetained: result.dbInfographicsRetained,
    });

    return applyNoStore(apiSuccess(result));
  } catch (error) {
    result.finalResult = "failure";
    result.failureReason = error instanceof Error ? error.message : "UNKNOWN_FAILURE";

    await appendAdminLog({
      actorUid: admin.uid,
      actorRole: admin.role,
      targetUid,
      ownerUid: targetUid,
      ownerRole: targetUser.role,
      action: "admin-storage-cleanup-user-failed",
      resourceType: "storage",
      resourceId: targetUid,
      route: STORAGE_CLEANUP_ROUTE,
      metadata: {
        targetEmail: targetUser.email,
        namespaceCount: result.namespaceBreakdown.length,
        failureReason: result.failureReason,
        storageObjectsMatched: result.storageObjectsMatched,
        storageObjectsDeleted: result.storageObjectsDeleted,
        storageObjectsFailed: result.storageObjectsFailed,
      },
    });

    console.error("[admin-storage-cleanup]", {
      action: "cleanup-user-storage",
      targetUid,
      targetEmail: targetUser.email ?? null,
      actingAdminUid: admin.uid,
      route: STORAGE_CLEANUP_ROUTE,
      status: "failed",
      namespaceBreakdown: result.namespaceBreakdown,
      failureReason: result.failureReason,
    });

    return applyNoStore(
      apiError("STORAGE_CLEANUP_FAILED", `Storage cleanup failed: ${result.failureReason}`, 500),
    );
  }
}

/**
 * Global storage cleanup: deletes ALL storage objects in the private bucket.
 *
 * This is a VERY dangerous operation. Requires stronger confirmation.
 *
 * Scope: Only user-owned namespaces (uploads/temp/, documents/, assessment-results/, assessment-exports/).
 * Does NOT delete system assets or other bucket contents.
 */
async function handleGlobalCleanup(admin: SessionUser, body: Record<string, unknown>) {
  const confirmation = String(body.confirmation || "").trim();

  // Stronger confirmation: must type "DELETE ALL STORAGE"
  const REQUIRED_PHRASE = "DELETE ALL STORAGE";
  if (confirmation !== REQUIRED_PHRASE) {
    return applyNoStore(
      apiError(
        "CONFIRMATION_REQUIRED",
        `You must type "${REQUIRED_PHRASE}" exactly to confirm global storage cleanup.`,
        400,
      ),
    );
  }

  console.info("[admin-storage-cleanup]", {
    action: "cleanup-global-storage",
    actingAdminUid: admin.uid,
    route: STORAGE_CLEANUP_ROUTE,
    status: "started",
  });

  await appendAdminLog({
    actorUid: admin.uid,
    actorRole: admin.role,
    action: "admin-storage-cleanup-global-started",
    resourceType: "storage",
    resourceId: "global",
    route: STORAGE_CLEANUP_ROUTE,
  });

  const result = {
    actingAdminUid: admin.uid,
    scope: "user-namespaces-only",
    namespaces: USER_OWNED_STORAGE_NAMESPACES,
    namespaceBreakdown: [] as NamespaceCleanupBreakdown[],
    // Storage results
    storageObjectsMatched: 0,
    storageObjectsDeleted: 0,
    storageObjectsFailed: 0,
    // Overall
    finalResult: "success" as "success" | "partial_failure" | "failure",
    failureReason: null as string | null,
  };

  try {
    // Only clean user-owned namespaces to avoid deleting system assets.
    for (const namespace of USER_OWNED_STORAGE_NAMESPACES) {
      const objects = await listZootopiaPrivateObjectsByPrefix(namespace);
      const breakdown = await deleteNamespaceObjectsInBatches({
        namespace,
        prefix: namespace,
        paths: objects,
      });

      result.namespaceBreakdown.push(breakdown);
      result.storageObjectsMatched += breakdown.matchedCount;
      result.storageObjectsDeleted += breakdown.deletedCount;
      result.storageObjectsFailed += breakdown.failedCount;
    }

    if (result.storageObjectsFailed > 0) {
      result.finalResult = "partial_failure";
      result.failureReason = `${result.storageObjectsFailed} storage objects failed to delete.`;
    }

    await appendAdminLog({
      actorUid: admin.uid,
      actorRole: admin.role,
      action: "admin-storage-cleanup-global-completed",
      resourceType: "storage",
      resourceId: "global",
      route: STORAGE_CLEANUP_ROUTE,
      metadata: {
        storageObjectsMatched: result.storageObjectsMatched,
        storageObjectsDeleted: result.storageObjectsDeleted,
        storageObjectsFailed: result.storageObjectsFailed,
        namespaceCount: result.namespaceBreakdown.length,
        finalResult: result.finalResult,
      },
    });

    console.info("[admin-storage-cleanup]", {
      action: "cleanup-global-storage",
      actingAdminUid: admin.uid,
      route: STORAGE_CLEANUP_ROUTE,
      status: result.finalResult,
      namespaceBreakdown: result.namespaceBreakdown,
      storageObjectsMatched: result.storageObjectsMatched,
      storageObjectsDeleted: result.storageObjectsDeleted,
      storageObjectsFailed: result.storageObjectsFailed,
    });

    return applyNoStore(apiSuccess(result));
  } catch (error) {
    result.finalResult = "failure";
    result.failureReason = error instanceof Error ? error.message : "UNKNOWN_FAILURE";

    await appendAdminLog({
      actorUid: admin.uid,
      actorRole: admin.role,
      action: "admin-storage-cleanup-global-failed",
      resourceType: "storage",
      resourceId: "global",
      route: STORAGE_CLEANUP_ROUTE,
      metadata: {
        failureReason: result.failureReason,
        storageObjectsMatched: result.storageObjectsMatched,
        storageObjectsDeleted: result.storageObjectsDeleted,
        storageObjectsFailed: result.storageObjectsFailed,
        namespaceCount: result.namespaceBreakdown.length,
      },
    });

    console.error("[admin-storage-cleanup]", {
      action: "cleanup-global-storage",
      actingAdminUid: admin.uid,
      route: STORAGE_CLEANUP_ROUTE,
      status: "failed",
      namespaceBreakdown: result.namespaceBreakdown,
      failureReason: result.failureReason,
    });

    return applyNoStore(
      apiError("STORAGE_CLEANUP_FAILED", `Global storage cleanup failed: ${result.failureReason}`, 500),
    );
  }
}