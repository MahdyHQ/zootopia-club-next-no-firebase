import "server-only";

import type {
  SessionUser,
  StorageDataClass,
  StorageLayoutVersion,
  ThemeMode,
} from "@zootopia/shared-types";

export const OWNER_STORAGE_NAMESPACES = [
  "documents",
  "uploads/temp",
  "assessment-results",
  "assessment-exports",
] as const;

export type AllowedStorageNamespace = (typeof OWNER_STORAGE_NAMESPACES)[number];

const OWNER_STORAGE_UNIFIED_ROOT = "users";

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

function normalizeStoragePath(value: string) {
  return String(value || "")
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");
}

function toStorageDataClass(namespace: AllowedStorageNamespace): StorageDataClass {
  if (namespace === "assessment-results") {
    return "assessment-result";
  }

  if (namespace === "assessment-exports") {
    return "assessment-export";
  }

  return "upload-source";
}

function buildOwnerScopedNamespacePrefix(input: {
  ownerUid: string;
  namespace: AllowedStorageNamespace;
  storageLayoutVersion: StorageLayoutVersion;
}) {
  const ownerUid = String(input.ownerUid || "").trim();
  if (input.storageLayoutVersion === "unified-v2") {
    return `${OWNER_STORAGE_UNIFIED_ROOT}/${ownerUid}/${input.namespace}`;
  }

  return `${input.namespace}/${ownerUid}`;
}

function pathMatchesPrefix(path: string, prefix: string) {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export type OwnerScopedStoragePathMetadata = {
  namespace: AllowedStorageNamespace;
  ownerUid: string;
  storageDataClass: StorageDataClass;
  storageLayoutVersion: StorageLayoutVersion;
};

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
   users/{userId}/uploads/temp/* (canonical) — this namespace is ONLY accessible by the session owner (uid).
   Cleanup is opportunistic (on session boundary) or scheduled (maintenance endpoint).
   See apps/web/lib/server/session.ts for how session.uid is resolved server-side from auth.
*/
export function buildTemporaryUploadStoragePath(input: {
  ownerUid: string;
  uploadId: string;
  fileName: string;
}) {
  const safeFileName = sanitizeStorageSegment(input.fileName, "upload.bin");
  return `${OWNER_STORAGE_UNIFIED_ROOT}/${input.ownerUid}/uploads/temp/${input.uploadId}/${safeFileName}`;
}

export function buildDocumentStoragePath(input: {
  ownerUid: string;
  documentId: string;
  fileName: string;
}) {
  const safeFileName = sanitizeStorageSegment(input.fileName, "document.bin");
  return `${OWNER_STORAGE_UNIFIED_ROOT}/${input.ownerUid}/documents/${input.documentId}/${safeFileName}`;
}

export function buildAssessmentResultStoragePath(input: {
  ownerUid: string;
  generationId: string;
}) {
  return `${OWNER_STORAGE_UNIFIED_ROOT}/${input.ownerUid}/assessment-results/${input.generationId}/result.json`;
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

  return `${OWNER_STORAGE_UNIFIED_ROOT}/${input.ownerUid}/assessment-exports/${input.generationId}/${safeArtifactKey}/${variantSegment}.${safeExtension}`;
}

/* This helper powers admin reporting/cleanup and dual-layout compatibility checks.
   Keep both legacy-v1 and unified-v2 prefixes until all historical rows and objects
   have fully aged out or are migrated. */
export function listOwnerScopedStoragePrefixes(input: {
  ownerUid: string;
  namespace: AllowedStorageNamespace;
  includeLegacy?: boolean;
  includeUnified?: boolean;
}) {
  const prefixes: string[] = [];

  if (input.includeUnified !== false) {
    prefixes.push(
      buildOwnerScopedNamespacePrefix({
        ownerUid: input.ownerUid,
        namespace: input.namespace,
        storageLayoutVersion: "unified-v2",
      }),
    );
  }

  if (input.includeLegacy !== false) {
    prefixes.push(
      buildOwnerScopedNamespacePrefix({
        ownerUid: input.ownerUid,
        namespace: input.namespace,
        storageLayoutVersion: "legacy-v1",
      }),
    );
  }

  return [...new Set(prefixes.filter((prefix) => prefix.trim().length > 0))];
}

export function listGlobalUserOwnedStorageRoots() {
  return [OWNER_STORAGE_UNIFIED_ROOT, ...OWNER_STORAGE_NAMESPACES] as const;
}

export function inferOwnerScopedStoragePathMetadata(input: {
  storagePath: string;
  ownerUid: string;
  allowedNamespaces?: readonly AllowedStorageNamespace[];
}): OwnerScopedStoragePathMetadata | null {
  const normalizedPath = normalizeStoragePath(input.storagePath);
  const ownerUid = String(input.ownerUid || "").trim();

  if (!normalizedPath || !ownerUid) {
    return null;
  }

  const allowedNamespaces = input.allowedNamespaces ?? OWNER_STORAGE_NAMESPACES;

  for (const namespace of allowedNamespaces) {
    const unifiedPrefix = buildOwnerScopedNamespacePrefix({
      ownerUid,
      namespace,
      storageLayoutVersion: "unified-v2",
    });
    if (pathMatchesPrefix(normalizedPath, unifiedPrefix)) {
      return {
        namespace,
        ownerUid,
        storageDataClass: toStorageDataClass(namespace),
        storageLayoutVersion: "unified-v2",
      };
    }

    const legacyPrefix = buildOwnerScopedNamespacePrefix({
      ownerUid,
      namespace,
      storageLayoutVersion: "legacy-v1",
    });
    if (pathMatchesPrefix(normalizedPath, legacyPrefix)) {
      return {
        namespace,
        ownerUid,
        storageDataClass: toStorageDataClass(namespace),
        storageLayoutVersion: "legacy-v1",
      };
    }
  }

  return null;
}

export function isOwnerScopedStoragePath(
  storagePath: string,
  ownerUid: string,
  allowedNamespaces: AllowedStorageNamespace[],
) {
  return Boolean(
    inferOwnerScopedStoragePathMetadata({
      storagePath,
      ownerUid,
      allowedNamespaces,
    }),
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
  const metadata = inferOwnerScopedStoragePathMetadata({
    storagePath,
    ownerUid,
    allowedNamespaces,
  });

  if (!metadata) {
    throw new Error("OWNER_STORAGE_SCOPE_MISMATCH");
  }

  return normalizeStoragePath(storagePath);
}
