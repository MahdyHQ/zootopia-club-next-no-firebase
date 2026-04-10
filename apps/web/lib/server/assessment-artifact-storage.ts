import "server-only";

import type {
  AssessmentArtifactKind,
  AssessmentArtifactRecord,
  AssessmentGeneration,
  ThemeMode,
} from "@zootopia/shared-types";

import {
  deleteZootopiaPrivateObject,
  downloadZootopiaPrivateObject,
  hasRemoteBlobStorage,
  uploadZootopiaPrivateObject,
} from "@/lib/server/supabase-blob-storage";
import { buildAssessmentGeneratedFileName } from "@/lib/server/export-file-naming";
import {
  assertOwnerScopedStoragePath,
  buildAssessmentArtifactStoragePath,
  buildAssessmentResultStoragePath,
} from "@/lib/server/owner-scope";
import { getRetentionExpiryTimestamp } from "@/lib/server/assessment-retention";

function toBuffer(value: Buffer | string | Uint8Array) {
  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }

  return Buffer.isBuffer(value) ? value : Buffer.from(value);
}

export function getAssessmentArtifactRecordKey(input: {
  kind: AssessmentArtifactKind;
  locale: string;
  themeMode?: ThemeMode | null;
}) {
  return input.themeMode
    ? `${input.kind}:${input.locale}:${input.themeMode}`
    : `${input.kind}:${input.locale}`;
}

/* Generated assessment outputs and export artifacts are cached in owner-scoped Storage so
   every download remains server-authenticated, path-isolated, and eligible for the shared
   3-day cleanup policy. Future agents should add new artifact kinds through this helper
   instead of writing bucket paths directly inside route handlers. */
export async function persistAssessmentExportArtifact(input: {
  ownerUid: string;
  generationId: string;
  kind: AssessmentArtifactKind;
  locale: string;
  themeMode?: ThemeMode | null;
  fileName: string;
  versionTag?: string | null;
  fileExtension: string;
  contentType: string;
  body: Buffer | string | Uint8Array;
  createdAt: string;
  expiresAt?: string | null;
}) {
  if (!hasRemoteBlobStorage()) {
    return null;
  }

  const storagePath = buildAssessmentArtifactStoragePath({
    ownerUid: input.ownerUid,
    generationId: input.generationId,
    artifactKey: input.kind,
    locale: input.locale,
    themeMode: input.themeMode ?? null,
    fileExtension: input.fileExtension,
  });
  /* Export artifacts are always written into the same owner namespace they will later be read
     back from. Keep this assertion on the write path so Storage isolation stays explicit rather
     than assuming every future path-builder change is safe by default. */
  const assertedStoragePath = assertOwnerScopedStoragePath(storagePath, input.ownerUid, [
    "assessment-exports",
  ]);

  await uploadZootopiaPrivateObject({
    path: assertedStoragePath,
    body: toBuffer(input.body),
    contentType: input.contentType,
  });

  return {
    key: getAssessmentArtifactRecordKey({
      kind: input.kind,
      locale: input.locale,
      themeMode: input.themeMode ?? null,
    }),
    kind: input.kind,
    locale: input.locale === "ar" ? "ar" : "en",
    themeMode: input.themeMode ?? null,
    contentType: input.contentType,
    fileName: input.fileName,
    ...(input.versionTag
      ? {
          versionTag: input.versionTag,
        }
      : {}),
    storagePath: assertedStoragePath,
    status: "ready",
    createdAt: input.createdAt,
    expiresAt: input.expiresAt ?? getRetentionExpiryTimestamp(input.createdAt),
  } satisfies AssessmentArtifactRecord;
}

export async function persistAssessmentResultArtifact(
  generation: AssessmentGeneration,
) {
  if (!hasRemoteBlobStorage()) {
    return null;
  }

  const resultFileName = buildAssessmentGeneratedFileName({
    generation,
    extension: "json",
  });

  const storagePath = buildAssessmentResultStoragePath({
    ownerUid: generation.ownerUid,
    generationId: generation.id,
  });
  /* Canonical AI result artifacts must live under the same owner UID boundary as every export.
     Preserve this write-time assertion so generated result files never drift outside the proven
     namespace even if future refactors touch the path helper. */
  const assertedStoragePath = assertOwnerScopedStoragePath(storagePath, generation.ownerUid, [
    "assessment-results",
  ]);

  await uploadZootopiaPrivateObject({
    path: assertedStoragePath,
    body: Buffer.from(JSON.stringify(generation, null, 2)),
    contentType: "application/json; charset=utf-8",
  });

  return {
    key: "canonical-result",
    kind: "canonical-result",
    locale: generation.request.options.language,
    themeMode: null,
    contentType: "application/json; charset=utf-8",
    fileName: resultFileName,
    storagePath: assertedStoragePath,
    status: generation.status,
    createdAt: generation.createdAt,
    expiresAt: generation.expiresAt,
  } satisfies AssessmentArtifactRecord;
}

export async function loadAssessmentArtifact(
  artifact: Pick<AssessmentArtifactRecord, "storagePath">,
  ownerUid: string,
) {
  if (!artifact.storagePath || !hasRemoteBlobStorage()) {
    return null;
  }

  try {
    const storagePath = assertOwnerScopedStoragePath(artifact.storagePath, ownerUid, [
      "assessment-results",
      "assessment-exports",
    ]);
    return downloadZootopiaPrivateObject(storagePath);
  } catch {
    return null;
  }
}

export async function deleteAssessmentArtifact(
  artifact: Pick<AssessmentArtifactRecord, "storagePath">,
  ownerUid: string,
) {
  if (!artifact.storagePath || !hasRemoteBlobStorage()) {
    return;
  }

  try {
    const storagePath = assertOwnerScopedStoragePath(artifact.storagePath, ownerUid, [
      "assessment-results",
      "assessment-exports",
    ]);
    await deleteZootopiaPrivateObject(storagePath);
  } catch {
    // Artifact cleanup is best-effort. Route handlers still enforce owner validation via repository metadata first.
  }
}
