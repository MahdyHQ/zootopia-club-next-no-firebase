import "server-only";

import type { SessionUser, ThemeMode } from "@zootopia/shared-types";

type AllowedStorageNamespace =
  | "documents"
  | "uploads/temp"
  | "assessment-results"
  | "assessment-exports";

type AssessmentArtifactPathInput = {
  ownerUid: string;
  generationId: string;
  artifactKey: string;
  fileExtension: string;
  locale?: string | null;
  themeMode?: ThemeMode | null;
};

function sanitizeStorageSegment(value: string | null | undefined, fallback: string) {
  const rawSegment = String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .split("/")
    .pop();
  const trimmed = rawSegment
    ?.replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return trimmed || fallback;
}

export function buildOwnerSnapshot(user: Pick<SessionUser, "uid" | "role">) {
  return {
    ownerUid: user.uid,
    ownerRole: user.role,
  } as const;
}

/* All server-managed Storage writes must flow through these helpers so owner isolation,
   path naming, and future cleanup logic stay aligned across uploads, generated results,
   and export artifacts. Future agents should extend namespaces here instead of building
   ad hoc bucket paths inside route handlers. */

/* TEMPORARY UPLOAD STORAGE:
   Session identity (uid) is the ONLY authority for ownership. Every temp upload is bound to the
   authenticated session's user.uid at creation time. The storage path enforces this binding:
   uploads/temp/{userId}/* — this namespace is ONLY accessible by the session owner (uid).
   Cleanup is opportunistic (on session boundary) or scheduled (maintenance endpoint).
   See apps/web/lib/server/session.ts for how session.uid is resolved server-side from auth.
*/
export function buildTemporaryUploadStoragePath(input: {
  ownerUid: string;
  uploadId: string;
  fileName: string;
}) {
  const safeFileName = sanitizeStorageSegment(input.fileName, "upload.bin");
  return `uploads/temp/${input.ownerUid}/${input.uploadId}/${safeFileName}`;
}

export function buildDocumentStoragePath(input: {
  ownerUid: string;
  documentId: string;
  fileName: string;
}) {
  const safeFileName = sanitizeStorageSegment(input.fileName, "document.bin");
  return `documents/${input.ownerUid}/${input.documentId}/${safeFileName}`;
}

export function buildAssessmentResultStoragePath(input: {
  ownerUid: string;
  generationId: string;
}) {
  return `assessment-results/${input.ownerUid}/${input.generationId}/result.json`;
}

export function buildAssessmentArtifactStoragePath(input: AssessmentArtifactPathInput) {
  const safeArtifactKey = sanitizeStorageSegment(input.artifactKey, "artifact");
  const safeExtension = sanitizeStorageSegment(input.fileExtension, "bin").replace(/^\.+/, "");
  const localeSegment = sanitizeStorageSegment(input.locale ?? "default", "default");
  const themeSegment =
    input.themeMode === "light" || input.themeMode === "dark"
      ? sanitizeStorageSegment(input.themeMode, "default")
      : null;
  const variantSegment = themeSegment ? `${localeSegment}-${themeSegment}` : localeSegment;

  return `assessment-exports/${input.ownerUid}/${input.generationId}/${safeArtifactKey}/${variantSegment}.${safeExtension}`;
}

export function isOwnerScopedStoragePath(
  storagePath: string,
  ownerUid: string,
  allowedNamespaces: AllowedStorageNamespace[],
) {
  const normalizedPath = String(storagePath || "").replace(/\\/g, "/");
  return allowedNamespaces.some((namespace) =>
    normalizedPath.startsWith(`${namespace}/${ownerUid}/`),
  );
}

/* Storage paths are part of the server trust boundary in this app because browser Storage
   access is deny-all. Keep this assertion in every read/delete path so stale or corrupted
   metadata cannot drift into another owner's namespace even if a stored path is wrong. */
export function assertOwnerScopedStoragePath(
  storagePath: string,
  ownerUid: string,
  allowedNamespaces: AllowedStorageNamespace[],
) {
  if (!isOwnerScopedStoragePath(storagePath, ownerUid, allowedNamespaces)) {
    throw new Error("OWNER_STORAGE_SCOPE_MISMATCH");
  }

  return storagePath;
}
