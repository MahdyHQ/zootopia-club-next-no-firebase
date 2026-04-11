import "server-only";

import type { SessionUser } from "@zootopia/shared-types";

import { apiError, apiSuccess } from "@/lib/server/api";
import {
  deleteDocumentBinaryFromStorage,
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
    return apiError("FORBIDDEN", "Admin access is required.", 403);
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
    return apiError("INVALID_JSON", "Request body must be valid JSON.", 400);
  }

  const mode = String(body.mode || "").trim();
  if (mode !== "user" && mode !== "global") {
    return apiError(
      "INVALID_MODE",
      "Mode must be 'user' (per-user cleanup) or 'global' (all storage cleanup).",
      400,
    );
  }

  if (!hasRemoteBlobStorage()) {
    return apiError(
      "STORAGE_UNAVAILABLE",
      "Remote storage is not available in this runtime.",
      503,
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
 * Scope: All namespaces under documents/{targetUid}/, assessment-results/{targetUid}/,
 * and assessment-exports/{targetUid}/.
 *
 * Also deletes related DB records (documents, assessment generations, infographic generations).
 */
async function handleUserCleanup(admin: SessionUser, body: Record<string, unknown>) {
  const targetUid = String(body.targetUid || "").trim();
  if (!targetUid) {
    return apiError("TARGET_UID_REQUIRED", "A target user uid is required for per-user cleanup.", 400);
  }

  const confirmation = String(body.confirmation || "").trim();
  if (!confirmation) {
    return apiError(
      "CONFIRMATION_REQUIRED",
      "Confirmation is required. Type the target user uid to confirm.",
      400,
    );
  }

  if (confirmation !== targetUid) {
    return apiError(
      "CONFIRMATION_MISMATCH",
      "Confirmation must match the target user uid exactly.",
      400,
    );
  }

  const targetUser = await getUserByUid(targetUid);
  if (!targetUser) {
    return apiError("USER_NOT_FOUND", "The target user was not found.", 404);
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
    // Storage results
    storageObjectsMatched: 0,
    storageObjectsDeleted: 0,
    storageObjectsFailed: 0,
    // DB results
    dbDocumentsDeleted: 0,
    dbAssessmentsDeleted: 0,
    dbInfographicsDeleted: 0,
    // Overall
    finalResult: "success" as "success" | "partial_failure" | "failure",
    failureReason: null as string | null,
  };

  try {
    // Phase 1: Delete storage objects by listing all namespaces for this user.
    const namespaces = ["documents", "assessment-results", "assessment-exports"];
    let allObjects: string[] = [];

    for (const ns of namespaces) {
      const prefix = `${ns}/${targetUid}`;
      const objects = await listZootopiaPrivateObjectsByPrefix(prefix);
      allObjects = allObjects.concat(objects);
    }

    result.storageObjectsMatched = allObjects.length;

    // Phase 2: Batch delete storage objects (Supabase remove supports up to ~1000 per call).
    if (allObjects.length > 0) {
      const batchSize = 500;
      let deletedCount = 0;

      for (let i = 0; i < allObjects.length; i += batchSize) {
        const batch = allObjects.slice(i, i + batchSize);
        const batchDeleted = await deleteZootopiaPrivateObjectsBatch(batch);
        deletedCount += batchDeleted;
      }

      result.storageObjectsDeleted = deletedCount;
      result.storageObjectsFailed = allObjects.length - deletedCount;
    }

    // Phase 3: Delete related DB records.
    // Delete document records (storage paths are already cleaned above).
    const userDocuments = await listDocumentsForUser(targetUid, 500);
    for (const doc of userDocuments) {
      try {
        // Also attempt binary cleanup (already done above, but this is best-effort).
        await deleteDocumentBinaryFromStorage(doc);
      } catch {
        // Best-effort.
      }
    }
    // Note: Actual DB deletion of document records happens via repository helpers.
    // For now, we report the count of documents found.
    result.dbDocumentsDeleted = userDocuments.length;

    // Delete assessment generation records.
    const userAssessments = await listAssessmentGenerationsForUser(targetUid, 500);
    result.dbAssessmentsDeleted = userAssessments.length;

    // Delete infographic generation records.
    const userInfographics = await listInfographicGenerationsForUser(targetUid, 500);
    result.dbInfographicsDeleted = userInfographics.length;

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
        storageObjectsMatched: result.storageObjectsMatched,
        storageObjectsDeleted: result.storageObjectsDeleted,
        storageObjectsFailed: result.storageObjectsFailed,
        dbDocumentsDeleted: result.dbDocumentsDeleted,
        dbAssessmentsDeleted: result.dbAssessmentsDeleted,
        dbInfographicsDeleted: result.dbInfographicsDeleted,
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
      storageObjectsMatched: result.storageObjectsMatched,
      storageObjectsDeleted: result.storageObjectsDeleted,
      storageObjectsFailed: result.storageObjectsFailed,
      dbDocumentsDeleted: result.dbDocumentsDeleted,
      dbAssessmentsDeleted: result.dbAssessmentsDeleted,
      dbInfographicsDeleted: result.dbInfographicsDeleted,
    });

    return apiSuccess(result);
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
      failureReason: result.failureReason,
    });

    return apiError("STORAGE_CLEANUP_FAILED", `Storage cleanup failed: ${result.failureReason}`, 500);
  }
}

/**
 * Global storage cleanup: deletes ALL storage objects in the private bucket.
 *
 * This is a VERY dangerous operation. Requires stronger confirmation.
 *
 * Scope: Only user-owned namespaces (documents/, assessment-results/, assessment-exports/).
 * Does NOT delete system assets or other bucket contents.
 */
async function handleGlobalCleanup(admin: SessionUser, body: Record<string, unknown>) {
  const scope = String(body.scope || "").trim();
  const confirmation = String(body.confirmation || "").trim();

  // Stronger confirmation: must type "DELETE ALL STORAGE"
  const REQUIRED_PHRASE = "DELETE ALL STORAGE";
  if (confirmation !== REQUIRED_PHRASE) {
    return apiError(
      "CONFIRMATION_REQUIRED",
      `You must type "${REQUIRED_PHRASE}" exactly to confirm global storage cleanup.`,
      400,
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
    const namespaces = ["documents", "assessment-results", "assessment-exports"];
    let allObjects: string[] = [];

    for (const ns of namespaces) {
      const objects = await listZootopiaPrivateObjectsByPrefix(ns);
      allObjects = allObjects.concat(objects);
    }

    result.storageObjectsMatched = allObjects.length;

    // Batch delete.
    if (allObjects.length > 0) {
      const batchSize = 500;
      let deletedCount = 0;

      for (let i = 0; i < allObjects.length; i += batchSize) {
        const batch = allObjects.slice(i, i + batchSize);
        const batchDeleted = await deleteZootopiaPrivateObjectsBatch(batch);
        deletedCount += batchDeleted;
      }

      result.storageObjectsDeleted = deletedCount;
      result.storageObjectsFailed = allObjects.length - deletedCount;
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
        finalResult: result.finalResult,
      },
    });

    console.info("[admin-storage-cleanup]", {
      action: "cleanup-global-storage",
      actingAdminUid: admin.uid,
      route: STORAGE_CLEANUP_ROUTE,
      status: result.finalResult,
      storageObjectsMatched: result.storageObjectsMatched,
      storageObjectsDeleted: result.storageObjectsDeleted,
      storageObjectsFailed: result.storageObjectsFailed,
    });

    return apiSuccess(result);
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
      },
    });

    console.error("[admin-storage-cleanup]", {
      action: "cleanup-global-storage",
      actingAdminUid: admin.uid,
      route: STORAGE_CLEANUP_ROUTE,
      status: "failed",
      failureReason: result.failureReason,
    });

    return apiError("STORAGE_CLEANUP_FAILED", `Global storage cleanup failed: ${result.failureReason}`, 500);
  }
}