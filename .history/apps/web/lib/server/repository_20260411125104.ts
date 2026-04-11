import "server-only";

import type {
  AdminAssessmentCreditMutationInput,
  AdminAssessmentCreditState,
  AdminOverview,
  AssessmentCreditAccountRecord,
  AssessmentCreditGrantAdminView,
  AssessmentCreditGrantEffectiveStatus,
  AssessmentCreditGrantRecord,
  AssessmentDailyCreditsSummary,
  AssessmentGeneration,
  DocumentRecord,
  InfographicGeneration,
  SessionUser,
  UpdateUserProfileInput,
  UserDocument,
  UserRole,
  UserStatus,
} from "@zootopia/shared-types";
import {
  evaluateProfileCompletion,
  getPhoneNumberMetadata,
  toIsoTimestamp,
} from "@zootopia/shared-utils";
import { randomUUID } from "node:crypto";

import type { AuthUserRecord } from "@/lib/server/auth-types";

import { getModelById } from "@/lib/ai/models";
import {
  hasAdminAccessFromClaims,
  isAllowlistedAdminEmail,
} from "@/lib/server/admin-auth";
import {
  buildAssessmentDailyCreditDocumentId,
  buildAssessmentDailyCreditsSummary,
  filterActiveAssessmentDailyCreditReservations,
  getDefaultDailyAssessmentCreditsLimit,
  getAssessmentDailyCreditResetAt,
  isAssessmentDailyCreditsExempt,
  normalizeAssessmentDailyLimitOverride,
  normalizeAssessmentDailyCreditLedger,
  resolveAssessmentDailyCreditsLimit,
  resolveAssessmentDailyCreditWindow,
  type AssessmentDailyCreditLedgerDocument,
  type AssessmentDailyCreditReservation,
} from "@/lib/server/assessment-daily-credits";
import { deleteAssessmentArtifact } from "@/lib/server/assessment-artifact-storage";
import { normalizeAssessmentGenerationRecord } from "@/lib/server/assessment-records";
import {
  AUTH_STAGE_REPOSITORY_READ,
  AUTH_STAGE_REPOSITORY_WRITE,
  AUTH_STAGE_USER_LOOKUP,
  AUTH_STAGE_USER_UPSERT,
  createAuthTraceContext,
  logAuthStageFailure,
  logAuthStageStart,
  logAuthStageSuccess,
  type AuthTraceContext,
} from "@/lib/server/auth-tracing";
import { deleteDocumentBinaryFromStorage } from "@/lib/server/document-runtime";
import { getServerAuthAdmin } from "@/lib/server/server-auth";
import { hasSupabaseAdminRuntime } from "@/lib/server/supabase-admin";
import {
  getZootopiaFirestore,
  shouldUseZootopiaPostgresPersistence,
} from "@/lib/server/zootopia-firestore-pg";
import {
  getAssessmentStatus,
  getRetentionExpiryTimestamp,
} from "@/lib/server/assessment-retention";

type AdminLogEntry = {
  id: string;
  actorUid: string;
  actorRole?: UserRole;
  action: string;
  targetUid?: string;
  ownerUid?: string;
  ownerRole?: UserRole;
  resourceType?: string;
  resourceId?: string;
  route?: string;
  metadata?: Record<string, string | number | boolean | null>;
  createdAt: string;
};

type AssessmentGenerationIdempotencyStatus = "in_progress" | "completed";
type AssessmentGenerationIdempotencyRecord = {
  ownerUid: string;
  idempotencyKeyHash: string;
  requestFingerprint: string;
  generationId: string;
  status: AssessmentGenerationIdempotencyStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

export type ExpiredUploadSweepResult = {
  forced: boolean;
  skipped: boolean;
  runAt: string;
  scannedCount: number;
  deletedCount: number;
};

type MemoryStore = {
  users: Map<string, UserDocument>;
  documents: Map<string, DocumentRecord>;
  assessments: Map<string, AssessmentGeneration>;
  assessmentGenerationIdempotency: Map<string, AssessmentGenerationIdempotencyRecord>;
  assessmentDailyCredits: Map<string, AssessmentDailyCreditLedgerDocument>;
  assessmentCreditAccounts: Map<string, AssessmentCreditAccountRecord>;
  assessmentCreditGrants: Map<string, AssessmentCreditGrantRecord>;
  infographics: Map<string, InfographicGeneration>;
  adminLogs: AdminLogEntry[];
};

type OwnerScopedRecordCollection =
  | "documents"
  | "assessmentGenerations"
  | "infographicGenerations";
type AssessmentDailyCreditReservationFailure = {
  ok: false;
  code: "ASSESSMENT_DAILY_CREDITS_EXHAUSTED" | "ASSESSMENT_ACCESS_DISABLED";
  message: string;
  status: number;
  credits: AssessmentDailyCreditsSummary;
};
type AssessmentDailyCreditReservationSuccess = {
  ok: true;
  reservation: AssessmentDailyCreditReservation | null;
  credits: AssessmentDailyCreditsSummary;
};

const EXPIRED_UPLOAD_SWEEP_INTERVAL_MS = 60 * 1000;
const EXPIRED_UPLOAD_SWEEP_BATCH_LIMIT = 200;
const ASSESSMENT_GENERATION_IDEMPOTENCY_COLLECTION = "assessmentGenerationIdempotency";
const ASSESSMENT_GENERATION_IDEMPOTENCY_IN_PROGRESS_STALE_MS = 10 * 60 * 1000;
const ASSESSMENT_DAILY_CREDITS_COLLECTION = "assessmentDailyCredits";
const ASSESSMENT_CREDIT_ACCOUNTS_COLLECTION = "assessmentCreditAccounts";
const ASSESSMENT_CREDIT_GRANTS_COLLECTION = "assessmentCreditGrants";
const ASSESSMENT_DAILY_CREDITS_EXHAUSTED_MESSAGE =
  "Today's successful assessment attempts are exhausted. They renew automatically tomorrow.";
const ASSESSMENT_ACCESS_DISABLED_MESSAGE =
  "Assessment generation is currently disabled for this account.";
const ASSESSMENT_CREDIT_MANUAL_BALANCE_MIN = 0;
const ASSESSMENT_CREDIT_MANUAL_BALANCE_MAX = 1_000_000;
const ASSESSMENT_CREDIT_GRANT_MIN = 1;
const ASSESSMENT_CREDIT_GRANT_MAX = 100_000;

declare global {
  var __ZOOTOPIA_MEMORY_STORE__: MemoryStore | undefined;
  var __ZOOTOPIA_EXPIRED_UPLOAD_SWEEP_LAST_RUN_AT__: number | undefined;
}

function getMemoryStore(): MemoryStore {
  if (!globalThis.__ZOOTOPIA_MEMORY_STORE__) {
    globalThis.__ZOOTOPIA_MEMORY_STORE__ = {
      users: new Map(),
      documents: new Map(),
      assessments: new Map(),
      assessmentGenerationIdempotency: new Map(),
      assessmentDailyCredits: new Map(),
      assessmentCreditAccounts: new Map(),
      assessmentCreditGrants: new Map(),
      infographics: new Map(),
      adminLogs: [],
    };
  }

  return globalThis.__ZOOTOPIA_MEMORY_STORE__;
}

function shouldUseFirestore() {
  return shouldUseZootopiaPostgresPersistence();
}

function readStringClaim(claims: Record<string, unknown> | undefined, key: string) {
  const value = claims?.[key];
  return typeof value === "string" ? value : null;
}

function readBooleanClaim(claims: Record<string, unknown> | undefined, key: string) {
  const value = claims?.[key];
  return typeof value === "boolean" ? value : null;
}

function readStatusClaim(
  claims: Record<string, unknown> | undefined,
): UserStatus | null {
  const value = claims?.zc_status;
  if (value === "active" || value === "suspended") {
    return value;
  }

  return null;
}

function buildAuthCriticalClaimsFromUser(user: Pick<
  UserDocument,
  | "role"
  | "status"
  | "fullName"
  | "universityCode"
  | "phoneNumber"
  | "phoneCountryIso2"
  | "phoneCountryCallingCode"
  | "nationality"
  | "profileCompleted"
  | "profileCompletedAt"
>) {
  return {
    admin: user.role === "admin",
    role: user.role,
    zc_status: user.status,
    zc_full_name: user.fullName,
    zc_university_code: user.universityCode,
    zc_phone_number: user.phoneNumber,
    zc_phone_country_iso2: user.phoneCountryIso2,
    zc_phone_country_calling_code: user.phoneCountryCallingCode,
    zc_nationality: user.nationality,
    zc_profile_completed: user.profileCompleted,
    zc_profile_completed_at: user.profileCompletedAt,
  } satisfies Record<string, unknown>;
}

async function persistAuthCriticalUserClaims(
  user: UserDocument,
  traceContext: AuthTraceContext,
) {
  /* Auth-critical persistence is now Supabase-only: role/status/profile metadata is stored
     in app_metadata claims so callback/session flows never depend on zc_entities availability. */
  logAuthStageStart(traceContext, AUTH_STAGE_REPOSITORY_WRITE, {
    operation: "persistAuthCriticalUserClaims",
  });

  try {
    const auth = getServerAuthAdmin();
    const userRecord = await auth.getUser(user.uid);
    await auth.setCustomUserClaims(user.uid, {
      ...(userRecord.customClaims ?? {}),
      ...buildAuthCriticalClaimsFromUser(user),
    });

    logAuthStageSuccess(traceContext, AUTH_STAGE_REPOSITORY_WRITE, {
      operation: "persistAuthCriticalUserClaims",
      role: user.role,
      status: user.status,
    });
  } catch (error) {
    logAuthStageFailure(traceContext, AUTH_STAGE_REPOSITORY_WRITE, error, {
      operation: "persistAuthCriticalUserClaims",
    });
    throw error;
  }
}

function toSafeIsoTimestamp(value: string | null | undefined, fallback: string) {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(parsed) ? fallback : new Date(parsed).toISOString();
}

function canViewOwnerOwnedRecord(
  ownerUid: string,
  viewer: Pick<SessionUser, "uid" | "role">,
) {
  return viewer.role === "admin" || viewer.uid === ownerUid;
}

function normalizeStoredOwnerRole(value: unknown): UserRole | undefined {
  return value === "admin" || value === "user" ? value : undefined;
}

/* Legacy owner-scoped records can predate ownerRole persistence. Resolve that metadata only
   from authoritative server context so preview/result/export/upload flows can self-heal old
   records without silently pushing admin-owned history into user scope. */
async function resolvePersistedOwnerRole(input: {
  ownerUid: string;
  ownerRole?: unknown;
  viewer?: Pick<SessionUser, "uid" | "role"> | null;
}) {
  const storedOwnerRole = normalizeStoredOwnerRole(input.ownerRole);
  if (storedOwnerRole) {
    return storedOwnerRole;
  }

  if (input.viewer && input.viewer.uid === input.ownerUid) {
    return input.viewer.role;
  }

  const owner = await getUserByUid(input.ownerUid);
  return owner?.role;
}

/* Firestore rejects undefined fields, but unresolved legacy ownerRole values must stay
   intentionally unset until they can be inferred safely. Keep this write guard narrow so we
   preserve record truth instead of defaulting ambiguous metadata into the wrong role. */
function omitUndefinedOwnerRole<T extends { ownerRole?: UserRole }>(
  record: T,
): Omit<T, "ownerRole"> | T {
  if (record.ownerRole) {
    return record;
  }

  const nextRecord = { ...record };
  delete nextRecord.ownerRole;
  return nextRecord;
}

async function persistResolvedOwnerRoleBackfill(
  collectionName: OwnerScopedRecordCollection,
  recordId: string,
  ownerRole: UserRole,
) {
  if (shouldUseFirestore()) {
    await getZootopiaFirestore()
      .collection(collectionName)
      .doc(recordId)
      .set({ ownerRole }, { merge: true });
    return;
  }

  const store = getMemoryStore();
  if (collectionName === "documents") {
    const existing = store.documents.get(recordId);
    if (existing) {
      store.documents.set(recordId, {
        ...existing,
        ownerRole,
      });
    }
    return;
  }

  if (collectionName === "infographicGenerations") {
    const existing = store.infographics.get(recordId);
    if (existing) {
      store.infographics.set(recordId, {
        ...existing,
        ownerRole,
      });
    }
    return;
  }

  const existing = store.assessments.get(recordId);
  if (existing) {
    store.assessments.set(recordId, {
      ...existing,
      ownerRole,
    });
  }
}

/* Accessed legacy records should backfill their resolved ownerRole once the server can prove
   it from the owner account. This keeps future artifact refreshes deterministic while ensuring
   a temporary metadata repair never blocks the user-facing read path if Firestore is busy. */
async function backfillMissingOwnerRoles<T extends { id: string; ownerRole?: UserRole }>(
  collectionName: OwnerScopedRecordCollection,
  records: T[],
  resolvedOwnerRole: UserRole | undefined,
) {
  if (!resolvedOwnerRole) {
    return;
  }

  const missingRecordIds = records
    .filter((record) => !normalizeStoredOwnerRole(record.ownerRole))
    .map((record) => record.id);

  if (missingRecordIds.length === 0) {
    return;
  }

  try {
    await Promise.all(
      missingRecordIds.map((recordId) =>
        persistResolvedOwnerRoleBackfill(collectionName, recordId, resolvedOwnerRole),
      ),
    );
  } catch {
    // Legacy metadata repair is best-effort; read access should not fail because a backfill write lagged.
  }
}

function normalizeDocumentRecord(
  record: DocumentRecord,
  fallbackActiveId: string | null,
  resolvedOwnerRole?: UserRole,
): DocumentRecord {
  const isActive = record.isActive === true || record.id === fallbackActiveId;
  const expiresAt = record.expiresAt ?? getRetentionExpiryTimestamp(record.createdAt);

  return {
    ...record,
    ownerRole: normalizeStoredOwnerRole(record.ownerRole) ?? resolvedOwnerRole,
    isActive,
    supersededAt: isActive ? null : record.supersededAt ?? null,
    expiresAt,
  };
}

function normalizeDocumentRecordList(
  records: DocumentRecord[],
  resolvedOwnerRole?: UserRole,
) {
  const fallbackActiveId =
    records.find((record) => record.isActive === true)?.id ??
    records.find((record) => !record.supersededAt)?.id ??
    records[0]?.id ??
    null;

  return records.map((record) =>
    normalizeDocumentRecord(record, fallbackActiveId, resolvedOwnerRole),
  );
}

function isDocumentExpired(record: Pick<DocumentRecord, "createdAt" | "expiresAt">) {
  return Date.now() >= Date.parse(record.expiresAt ?? getRetentionExpiryTimestamp(record.createdAt));
}

async function purgeExpiredDocumentRecord(record: DocumentRecord) {
  await deleteDocumentBinaryFromStorage(record);

  if (shouldUseFirestore()) {
    await getZootopiaFirestore().collection("documents").doc(record.id).delete();
  } else {
    getMemoryStore().documents.delete(record.id);
  }

  await appendAdminLog({
    actorUid: "system",
    ownerUid: record.ownerUid,
    ownerRole: record.ownerRole,
    action: "document-expired-cleanup",
    resourceType: "document",
    resourceId: record.id,
    metadata: {
      fileName: record.fileName,
    },
  });
}

function normalizeDocumentCleanupCandidate(
  record: DocumentRecord,
  resolvedOwnerRole?: UserRole,
) {
  return normalizeDocumentRecord(
    {
      ...record,
      expiresAt: record.expiresAt ?? getRetentionExpiryTimestamp(record.createdAt),
    },
    record.isActive === true ? record.id : null,
    resolvedOwnerRole,
  );
}

/* Session-bound upload cleanup uses this throttled sweep so expired source files are removed
   even when users never revisit protected upload routes after session expiry. Keep the sweep
   batch-limited and owner-validated so high traffic does not create cross-owner side effects. */
export async function sweepExpiredUploadedSources(input: {
  force?: boolean;
} = {}): Promise<ExpiredUploadSweepResult> {
  const forced = input.force === true;
  const runAt = new Date().toISOString();
  const nowMs = Date.now();
  const lastRunAt = globalThis.__ZOOTOPIA_EXPIRED_UPLOAD_SWEEP_LAST_RUN_AT__ ?? 0;

  if (!forced && nowMs - lastRunAt < EXPIRED_UPLOAD_SWEEP_INTERVAL_MS) {
    return {
      forced,
      skipped: true,
      runAt,
      scannedCount: 0,
      deletedCount: 0,
    };
  }

  globalThis.__ZOOTOPIA_EXPIRED_UPLOAD_SWEEP_LAST_RUN_AT__ = nowMs;

  let candidates: DocumentRecord[] = [];

  if (shouldUseFirestore()) {
    const snapshot = await getZootopiaFirestore()
      .collection("documents")
      .where("expiresAt", "<=", runAt)
      .orderBy("expiresAt", "asc")
      .limit(EXPIRED_UPLOAD_SWEEP_BATCH_LIMIT)
      .get();

    candidates = snapshot.docs.map((documentSnapshot) => {
      const record = documentSnapshot.data() as unknown as DocumentRecord;
      const normalizedRecord: DocumentRecord = {
        ...record,
        id: record.id || documentSnapshot.id,
      };

      return normalizeDocumentCleanupCandidate(
        normalizedRecord,
        normalizeStoredOwnerRole(record.ownerRole),
      );
    });
  } else {
    candidates = [...getMemoryStore().documents.values()]
      .map((record) =>
        normalizeDocumentCleanupCandidate(
          record,
          normalizeStoredOwnerRole(record.ownerRole),
        ),
      )
      .filter((record) => isDocumentExpired(record))
      .slice(0, EXPIRED_UPLOAD_SWEEP_BATCH_LIMIT);
  }

  let deletedCount = 0;
  for (const candidate of candidates) {
    if (!isDocumentExpired(candidate)) {
      continue;
    }

    await purgeExpiredDocumentRecord(candidate);
    deletedCount += 1;
  }

  return {
    forced,
    skipped: false,
    runAt,
    scannedCount: candidates.length,
    deletedCount,
  };
}

/* Session termination must clear the owner's temporary upload workspace immediately so source
   binaries do not outlive the authenticated session boundary. Assessment result records/artifacts
   are intentionally preserved under their existing retention policy and are not touched here. */
export async function clearUploadWorkspaceForOwner(ownerUid: string) {
  const records = await listRawDocumentsForOwner(ownerUid);
  const normalizedRecords = normalizeDocumentRecordList(records);

  await Promise.all(normalizedRecords.map((record) => deleteDocumentBinaryFromStorage(record)));

  if (shouldUseFirestore()) {
    await Promise.all(
      normalizedRecords.map((record) =>
        getZootopiaFirestore().collection("documents").doc(record.id).delete(),
      ),
    );
  } else {
    const store = getMemoryStore();
    for (const record of normalizedRecords) {
      store.documents.delete(record.id);
    }
  }

  return {
    ownerUid,
    clearedDocumentCount: normalizedRecords.length,
  };
}

async function purgeExpiredAssessmentArtifacts(
  record: Pick<AssessmentGeneration, "ownerUid" | "artifacts">,
) {
  const artifacts = Object.values(record.artifacts ?? {});
  await Promise.all(
    artifacts.map((artifact) => deleteAssessmentArtifact(artifact, record.ownerUid)),
  );
}

async function purgeExpiredAssessmentGenerationRecord(record: AssessmentGeneration) {
  await purgeExpiredAssessmentArtifacts(record);

  if (shouldUseFirestore()) {
    await getZootopiaFirestore()
      .collection("assessmentGenerations")
      .doc(record.id)
      .delete();
  } else {
    getMemoryStore().assessments.delete(record.id);
  }

  await appendAdminLog({
    actorUid: "system",
    ownerUid: record.ownerUid,
    ownerRole: record.ownerRole,
    action: "assessment-expired-cleanup",
    resourceType: "assessment",
    resourceId: record.id,
  });
}

async function persistDocumentRecord(record: DocumentRecord) {
  if (shouldUseFirestore()) {
    await getZootopiaFirestore()
      .collection("documents")
      .doc(record.id)
      .set(omitUndefinedOwnerRole(record), { merge: true });
  } else {
    getMemoryStore().documents.set(record.id, record);
  }
}

async function markPreviousDocumentsInactive(input: {
  ownerUid: string;
  activeDocumentId: string;
  supersededAt: string;
}) {
  const supersededDocuments: DocumentRecord[] = [];

  if (shouldUseFirestore()) {
    const snapshot = await getZootopiaFirestore()
      .collection("documents")
      .where("ownerUid", "==", input.ownerUid)
      .orderBy("createdAt", "desc")
      .limit(30)
      .get();

    await Promise.all(
      snapshot.docs.map(async (documentSnapshot) => {
        if (documentSnapshot.id === input.activeDocumentId) {
          return;
        }

        const existing = documentSnapshot.data() as unknown as DocumentRecord;
        if (existing.isActive === false && existing.supersededAt) {
          return;
        }

        supersededDocuments.push(
          normalizeDocumentRecord(
            {
              ...existing,
              id: existing.id || documentSnapshot.id,
              isActive: false,
              supersededAt: existing.supersededAt ?? input.supersededAt,
              updatedAt: input.supersededAt,
            },
            null,
            normalizeStoredOwnerRole(existing.ownerRole),
          ),
        );

        await documentSnapshot.ref.set(
          {
            isActive: false,
            supersededAt: existing.supersededAt ?? input.supersededAt,
            updatedAt: input.supersededAt,
          } satisfies Partial<DocumentRecord>,
          { merge: true },
        );
      }),
    );

    return supersededDocuments;
  }

  const store = getMemoryStore();
  for (const [documentId, existing] of store.documents.entries()) {
    if (existing.ownerUid !== input.ownerUid || documentId === input.activeDocumentId) {
      continue;
    }

    store.documents.set(documentId, {
      ...existing,
      isActive: false,
      supersededAt: existing.supersededAt ?? input.supersededAt,
      updatedAt: input.supersededAt,
    });

    supersededDocuments.push(
      normalizeDocumentRecord(
        {
          ...existing,
          isActive: false,
          supersededAt: existing.supersededAt ?? input.supersededAt,
          updatedAt: input.supersededAt,
        },
        null,
        normalizeStoredOwnerRole(existing.ownerRole),
      ),
    );
  }

  return supersededDocuments;
}

function resolveProfileState(input: {
  role: UserRole;
  fullName: string | null;
  universityCode: string | null;
  phoneNumber: string | null;
  phoneCountryIso2: string | null;
  phoneCountryCallingCode: string | null;
  nationality: string | null;
  profileCompletedAt: string | null | undefined;
  now: string;
}) {
  const completion = evaluateProfileCompletion({
    role: input.role,
    fullName: input.fullName,
    universityCode: input.universityCode,
    phoneNumber: input.phoneNumber,
    nationality: input.nationality,
  });
  const phoneMetadata = completion.normalizedPhoneNumber
    ? getPhoneNumberMetadata(completion.normalizedPhoneNumber)
    : null;
  const resolvedPhoneCountryIso2 = completion.normalizedPhoneNumber
    ? phoneMetadata?.countryIso2 ?? input.phoneCountryIso2 ?? null
    : null;
  const resolvedPhoneCountryCallingCode = completion.normalizedPhoneNumber
    ? phoneMetadata?.countryCallingCode ?? input.phoneCountryCallingCode ?? null
    : null;

  return {
    fullName: completion.normalizedFullName ?? input.fullName ?? null,
    universityCode:
      completion.normalizedUniversityCode ?? input.universityCode ?? null,
    phoneNumber: completion.normalizedPhoneNumber ?? input.phoneNumber ?? null,
    phoneCountryIso2: resolvedPhoneCountryIso2,
    phoneCountryCallingCode: resolvedPhoneCountryCallingCode,
    nationality: completion.normalizedNationality ?? input.nationality ?? null,
    profileCompleted: completion.profileCompleted,
    profileCompletedAt: completion.profileCompleted
      ? input.profileCompletedAt ?? input.now
      : null,
  };
}

function buildUserDocumentFromAuthRecord(
  authUser: AuthUserRecord,
  existing: UserDocument | null,
) {
  const now = toIsoTimestamp(new Date());
  const customClaims = authUser.customClaims ?? {};
  const adminClaim =
    customClaims.admin ?? (customClaims.role === "admin" ? true : undefined);
  const role = getRoleFromAuthClaims({
    email: authUser.email ?? existing?.email ?? null,
    admin: adminClaim,
  });
  const createdAt = existing?.createdAt ?? toSafeIsoTimestamp(authUser.metadata.creationTime, now);
  const updatedAt =
    existing?.updatedAt ??
    toSafeIsoTimestamp(
      authUser.metadata.lastRefreshTime ??
        authUser.metadata.lastSignInTime ??
        authUser.metadata.creationTime,
      createdAt,
    );
  const profileState = resolveProfileState({
    role,
    fullName: existing?.fullName ?? readStringClaim(customClaims, "zc_full_name") ?? null,
    universityCode:
      existing?.universityCode
      ?? readStringClaim(customClaims, "zc_university_code")
      ?? null,
    phoneNumber:
      existing?.phoneNumber
      ?? readStringClaim(customClaims, "zc_phone_number")
      ?? null,
    phoneCountryIso2:
      existing?.phoneCountryIso2
      ?? readStringClaim(customClaims, "zc_phone_country_iso2")
      ?? null,
    phoneCountryCallingCode:
      existing?.phoneCountryCallingCode
      ?? readStringClaim(customClaims, "zc_phone_country_calling_code")
      ?? null,
    nationality:
      existing?.nationality
      ?? readStringClaim(customClaims, "zc_nationality")
      ?? null,
    profileCompletedAt:
      existing?.profileCompletedAt
      ?? readStringClaim(customClaims, "zc_profile_completed_at"),
    now,
  });
  const persistedProfileCompleted = readBooleanClaim(customClaims, "zc_profile_completed");
  const resolvedProfileCompleted = persistedProfileCompleted ?? profileState.profileCompleted;
  const resolvedProfileCompletedAt = resolvedProfileCompleted
    ? existing?.profileCompletedAt
      ?? readStringClaim(customClaims, "zc_profile_completed_at")
      ?? profileState.profileCompletedAt
      ?? now
    : null;
  const statusFromClaims = readStatusClaim(customClaims);

  return {
    uid: authUser.uid,
    email: authUser.email ?? existing?.email ?? null,
    displayName: authUser.displayName ?? existing?.displayName ?? null,
    photoURL: authUser.photoURL ?? existing?.photoURL ?? null,
    fullName: profileState.fullName,
    universityCode: profileState.universityCode,
    phoneNumber: profileState.phoneNumber,
    phoneCountryIso2: profileState.phoneCountryIso2,
    phoneCountryCallingCode: profileState.phoneCountryCallingCode,
    nationality: profileState.nationality,
    profileCompleted: resolvedProfileCompleted,
    profileCompletedAt: resolvedProfileCompletedAt,
    role,
    status:
      statusFromClaims === "suspended"
      || statusFromClaims === "active" && authUser.disabled
        ? ("suspended" as const)
        :
      existing?.status === "suspended" || authUser.disabled
        ? ("suspended" as const)
        : ("active" as const),
    preferences: existing?.preferences ?? {
      theme: "system",
      language: "en",
    },
    createdAt,
    updatedAt,
  } satisfies UserDocument;
}

async function listAllFirebaseAuthUsers() {
  const users: AuthUserRecord[] = [];
  let nextPageToken: string | undefined;

  do {
    const page = await getServerAuthAdmin().listUsers(1000, nextPageToken);
    users.push(...page.users);
    nextPageToken = page.pageToken;
  } while (nextPageToken);

  return users;
}

export function getRoleFromAuthClaims(claims: {
  role?: unknown;
  admin?: unknown;
  email?: string | null;
}): UserRole {
  if (
    hasAdminAccessFromClaims({
      email: claims.email,
      admin: claims.admin,
    })
  ) {
    return "admin";
  }

  return "user";
}

export async function getUserByUid(
  uid: string,
  options: {
    traceContext?: AuthTraceContext;
  } = {},
) {
  const traceContext = options.traceContext ?? createAuthTraceContext({
    flow: "system",
    provider: "repository",
    uid,
  });

  logAuthStageStart(traceContext, AUTH_STAGE_REPOSITORY_READ, {
    operation: "getUserByUid",
  });

  if (!hasSupabaseAdminRuntime()) {
    logAuthStageFailure(
      traceContext,
      AUTH_STAGE_REPOSITORY_READ,
      new Error("SUPABASE_ADMIN_UNAVAILABLE"),
      {
        operation: "getUserByUid",
      },
    );
    return null;
  }

  try {
    const authUser = await getServerAuthAdmin().getUser(uid);
    const user = buildUserDocumentFromAuthRecord(authUser, null);

    logAuthStageSuccess(traceContext, AUTH_STAGE_REPOSITORY_READ, {
      operation: "getUserByUid",
      role: user.role,
      status: user.status,
    });

    return user;
  } catch (error) {
    if (
      typeof error === "object"
      && error
      && "code" in error
      && error.code === "auth/user-not-found"
    ) {
      logAuthStageSuccess(traceContext, AUTH_STAGE_REPOSITORY_READ, {
        operation: "getUserByUid",
        result: "not_found",
      });
      return null;
    }

    logAuthStageFailure(traceContext, AUTH_STAGE_REPOSITORY_READ, error, {
      operation: "getUserByUid",
    });
    throw error;
  }
}

export async function upsertUserFromAuth(input: {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role?: UserRole;
  traceContext?: AuthTraceContext;
}) {
  const traceContext = input.traceContext ?? createAuthTraceContext({
    flow: input.role === "admin" ? "admin" : "user",
    provider: "repository",
    uid: input.uid,
    email: input.email,
  });

  const now = toIsoTimestamp(new Date());

  logAuthStageStart(traceContext, AUTH_STAGE_USER_LOOKUP, {
    operation: "upsertUserFromAuth.readExisting",
  });
  const existing = await getUserByUid(input.uid, {
    traceContext,
  });
  logAuthStageSuccess(traceContext, AUTH_STAGE_USER_LOOKUP, {
    operation: "upsertUserFromAuth.readExisting",
    hasExisting: Boolean(existing),
  });

  logAuthStageStart(traceContext, AUTH_STAGE_USER_UPSERT, {
    operation: "upsertUserFromAuth.build",
  });
  const role = input.role ?? existing?.role ?? "user";
  const profileState = resolveProfileState({
    role,
    fullName: existing?.fullName ?? null,
    universityCode: existing?.universityCode ?? null,
    phoneNumber: existing?.phoneNumber ?? null,
    phoneCountryIso2: existing?.phoneCountryIso2 ?? null,
    phoneCountryCallingCode: existing?.phoneCountryCallingCode ?? null,
    nationality: existing?.nationality ?? null,
    profileCompletedAt: existing?.profileCompletedAt,
    now,
  });

  const nextUser: UserDocument = {
    uid: input.uid,
    email: input.email,
    displayName: input.displayName,
    photoURL: input.photoURL,
    fullName: profileState.fullName,
    universityCode: profileState.universityCode,
    phoneNumber: profileState.phoneNumber,
    phoneCountryIso2: profileState.phoneCountryIso2,
    phoneCountryCallingCode: profileState.phoneCountryCallingCode,
    nationality: profileState.nationality,
    profileCompleted: profileState.profileCompleted,
    profileCompletedAt: profileState.profileCompletedAt,
    role,
    status: existing?.status ?? "active",
    preferences: existing?.preferences ?? {
      theme: "system",
      language: "en",
    },
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await persistAuthCriticalUserClaims(nextUser, traceContext);
  logAuthStageSuccess(traceContext, AUTH_STAGE_USER_UPSERT, {
    operation: "upsertUserFromAuth.persist",
    role: nextUser.role,
    status: nextUser.status,
  });

  return nextUser;
}

export async function listUsers() {
  if (shouldUseFirestore()) {
    const [snapshot, authUsers] = await Promise.all([
      getZootopiaFirestore().collection("users").get(),
      listAllFirebaseAuthUsers(),
    ]);
    const usersByUid = new Map<string, UserDocument>();

    for (const doc of snapshot.docs) {
      const user = doc.data() as unknown as UserDocument;
      usersByUid.set(user.uid, user);
    }

    // Admin visibility belongs to the full account inventory. Do not reintroduce a Firestore-only
    // or 100-user-limited view here, or blocking/auditing will silently miss real platform accounts.
    for (const authUser of authUsers) {
      usersByUid.set(
        authUser.uid,
        buildUserDocumentFromAuthRecord(authUser, usersByUid.get(authUser.uid) ?? null),
      );
    }

    return [...usersByUid.values()].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    );
  }

  return [...getMemoryStore().users.values()].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}

export async function setUserRole(uid: string, role: UserRole) {
  const user = await getUserByUid(uid);
  if (!user) {
    throw new Error("USER_NOT_FOUND");
  }

  if (role === "admin" && !isAllowlistedAdminEmail(user.email)) {
    throw new Error(
      "Only the allowlisted admin emails may hold the admin role in this workspace.",
    );
  }

  const now = toIsoTimestamp(new Date());
  const profileState = resolveProfileState({
    role,
    fullName: user.fullName,
    universityCode: user.universityCode,
    phoneNumber: user.phoneNumber,
    phoneCountryIso2: user.phoneCountryIso2 ?? null,
    phoneCountryCallingCode: user.phoneCountryCallingCode ?? null,
    nationality: user.nationality,
    profileCompletedAt: user.profileCompletedAt,
    now,
  });

  const nextUser: UserDocument = {
    ...user,
    role,
    fullName: profileState.fullName,
    universityCode: profileState.universityCode,
    phoneNumber: profileState.phoneNumber,
    phoneCountryIso2: profileState.phoneCountryIso2,
    phoneCountryCallingCode: profileState.phoneCountryCallingCode,
    nationality: profileState.nationality,
    profileCompleted: profileState.profileCompleted,
    profileCompletedAt: profileState.profileCompletedAt,
    updatedAt: now,
  };

  if (shouldUseFirestore()) {
    const auth = getServerAuthAdmin();
    const userRecord = await auth.getUser(uid);
    await auth.setCustomUserClaims(uid, {
      ...(userRecord.customClaims ?? {}),
      role,
      admin: role === "admin",
    });
    await auth.revokeRefreshTokens(uid);
    await getZootopiaFirestore()
      .collection("users")
      .doc(uid)
      .set(nextUser, { merge: true });
  } else {
    getMemoryStore().users.set(uid, nextUser);
  }

  return nextUser;
}

export async function setUserStatus(uid: string, status: UserStatus) {
  const user = await getUserByUid(uid);
  if (!user) {
    throw new Error("USER_NOT_FOUND");
  }

  const nextUser: UserDocument = {
    ...user,
    status,
    updatedAt: toIsoTimestamp(new Date()),
  };

  if (shouldUseFirestore()) {
    // Blocking stays server-authoritative here: we mirror the workspace status into Firebase Auth
    // itself and revoke refresh tokens so an old session cannot keep bypassing the admin decision.
    await getServerAuthAdmin().updateUser(uid, {
      disabled: status === "suspended",
    });
    await getServerAuthAdmin().revokeRefreshTokens(uid);
    await getZootopiaFirestore()
      .collection("users")
      .doc(uid)
      .set(nextUser, { merge: true });
  } else {
    getMemoryStore().users.set(uid, nextUser);
  }

  return nextUser;
}

export async function updateUserProfile(
  uid: string,
  profile: UpdateUserProfileInput,
) {
  const user = await getUserByUid(uid);
  if (!user) {
    throw new Error("USER_NOT_FOUND");
  }

  const now = toIsoTimestamp(new Date());
  // Settings keeps profile ownership server-authoritative by persisting only
  // normalized profile fields from this repository path.
  const profileState = resolveProfileState({
    role: user.role,
    fullName: profile.fullName,
    universityCode: profile.universityCode,
    phoneNumber: profile.phoneNumber ?? null,
    phoneCountryIso2: profile.phoneCountryIso2 ?? user.phoneCountryIso2 ?? null,
    phoneCountryCallingCode:
      profile.phoneCountryCallingCode ?? user.phoneCountryCallingCode ?? null,
    nationality: profile.nationality,
    profileCompletedAt: user.profileCompletedAt,
    now,
  });

  const nextUser: UserDocument = {
    ...user,
    fullName: profileState.fullName,
    universityCode: profileState.universityCode,
    phoneNumber: profileState.phoneNumber,
    phoneCountryIso2: profileState.phoneCountryIso2,
    phoneCountryCallingCode: profileState.phoneCountryCallingCode,
    nationality: profileState.nationality,
    profileCompleted: profileState.profileCompleted,
    profileCompletedAt: profileState.profileCompletedAt,
    updatedAt: now,
  };

  if (shouldUseFirestore()) {
    await getZootopiaFirestore()
      .collection("users")
      .doc(uid)
      .set(nextUser, { merge: true });
  } else {
    getMemoryStore().users.set(uid, nextUser);
  }

  return nextUser;
}

export async function appendAdminLog(input: Omit<AdminLogEntry, "id" | "createdAt">) {
  const entry: AdminLogEntry = {
    id: randomUUID(),
    createdAt: toIsoTimestamp(new Date()),
    ...input,
  };

  try {
    if (shouldUseFirestore()) {
      await getZootopiaFirestore()
        .collection("adminActivityLogs")
        .doc(entry.id)
        .set(entry);
    } else {
      getMemoryStore().adminLogs.unshift(entry);
    }
  } catch {
    // Audit logging should stay observable but never break the primary auth/storage/export path.
  }
}

export async function listAdminActivityLogs(limit = 40) {
  if (shouldUseFirestore()) {
    const snapshot = await getZootopiaFirestore()
      .collection("adminActivityLogs")
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => doc.data() as unknown as AdminLogEntry);
  }

  return getMemoryStore().adminLogs
    .slice()
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, limit);
}

async function listRawDocumentsForOwner(ownerUid: string) {
  if (shouldUseFirestore()) {
    const snapshot = await getZootopiaFirestore()
      .collection("documents")
      .where("ownerUid", "==", ownerUid)
      .get();

    return snapshot.docs.map((doc) => {
      const record = doc.data() as unknown as DocumentRecord;
      return {
        ...record,
        id: record.id || doc.id,
      } as DocumentRecord;
    });
  }

  return [...getMemoryStore().documents.values()].filter(
    (record) => record.ownerUid === ownerUid,
  );
}

async function listRawAssessmentGenerationsForOwner(ownerUid: string) {
  if (shouldUseFirestore()) {
    const snapshot = await getZootopiaFirestore()
      .collection("assessmentGenerations")
      .where("ownerUid", "==", ownerUid)
      .get();

    return snapshot.docs.map((doc) => doc.data() as unknown as AssessmentGeneration);
  }

  return [...getMemoryStore().assessments.values()].filter(
    (record) => record.ownerUid === ownerUid,
  );
}

async function listRawInfographicGenerationsForOwner(ownerUid: string) {
  if (shouldUseFirestore()) {
    const snapshot = await getZootopiaFirestore()
      .collection("infographicGenerations")
      .where("ownerUid", "==", ownerUid)
      .get();

    return snapshot.docs.map((doc) => doc.data() as unknown as InfographicGeneration);
  }

  return [...getMemoryStore().infographics.values()].filter(
    (record) => record.ownerUid === ownerUid,
  );
}

/* This explicit maintenance helper lets future admin-safe migrations backfill whole owner
   histories from authoritative role context instead of relying on repeated request-time repair.
   Keep it role-aware and ownerUid-scoped so admin/user datasets never bleed across owners. */
export async function backfillLegacyOwnerRolesForOwner(ownerUid: string) {
  const resolvedOwnerRole = await resolvePersistedOwnerRole({ ownerUid });
  if (!resolvedOwnerRole) {
    return {
      ownerUid,
      ownerRole: null,
      documentsUpdated: 0,
      assessmentsUpdated: 0,
      infographicsUpdated: 0,
    };
  }

  const [documents, assessments, infographics] = await Promise.all([
    listRawDocumentsForOwner(ownerUid),
    listRawAssessmentGenerationsForOwner(ownerUid),
    listRawInfographicGenerationsForOwner(ownerUid),
  ]);
  const missingDocuments = documents.filter(
    (record) => !normalizeStoredOwnerRole(record.ownerRole),
  );
  const missingAssessments = assessments.filter(
    (record) => !normalizeStoredOwnerRole(record.ownerRole),
  );
  const missingInfographics = infographics.filter(
    (record) => !normalizeStoredOwnerRole(record.ownerRole),
  );

  await Promise.all([
    ...missingDocuments.map((record) =>
      persistResolvedOwnerRoleBackfill("documents", record.id, resolvedOwnerRole),
    ),
    ...missingAssessments.map((record) =>
      persistResolvedOwnerRoleBackfill(
        "assessmentGenerations",
        record.id,
        resolvedOwnerRole,
      ),
    ),
    ...missingInfographics.map((record) =>
      persistResolvedOwnerRoleBackfill(
        "infographicGenerations",
        record.id,
        resolvedOwnerRole,
      ),
    ),
  ]);

  return {
    ownerUid,
    ownerRole: resolvedOwnerRole,
    documentsUpdated: missingDocuments.length,
    assessmentsUpdated: missingAssessments.length,
    infographicsUpdated: missingInfographics.length,
  };
}

export async function saveDocument(record: DocumentRecord) {
  const resolvedOwnerRole = await resolvePersistedOwnerRole({
    ownerUid: record.ownerUid,
    ownerRole: record.ownerRole,
  });
  const nextRecord: DocumentRecord = {
    ...record,
    ownerRole: resolvedOwnerRole,
    isActive: record.isActive !== false,
    supersededAt: record.isActive === false ? record.supersededAt ?? record.updatedAt : null,
    expiresAt: record.expiresAt ?? getRetentionExpiryTimestamp(record.createdAt),
  };

  await persistDocumentRecord(nextRecord);

  if (nextRecord.isActive) {
    const supersededDocuments = await markPreviousDocumentsInactive({
      ownerUid: nextRecord.ownerUid,
      activeDocumentId: nextRecord.id,
      supersededAt: nextRecord.updatedAt,
    });

    /* Replacing the active upload must retire the old source binary immediately so workspace
       uploads stay session-scoped and owner-isolated. Metadata can remain for history/readback,
       but the superseded source file itself must not linger in Storage after replacement. */
    await Promise.allSettled(
      supersededDocuments.map((supersededDocument) =>
        deleteDocumentBinaryFromStorage(supersededDocument),
      ),
    );
  }

  return nextRecord;
}

export async function listDocumentsForUser(ownerUid: string, limit = 20) {
  const resolvedOwnerRole = await resolvePersistedOwnerRole({ ownerUid });

  if (shouldUseFirestore()) {
    const snapshot = await getZootopiaFirestore()
      .collection("documents")
      .where("ownerUid", "==", ownerUid)
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();

    const rawDocuments = snapshot.docs.map((doc) => doc.data() as unknown as DocumentRecord);
    await backfillMissingOwnerRoles("documents", rawDocuments, resolvedOwnerRole);
    const documents = normalizeDocumentRecordList(rawDocuments, resolvedOwnerRole);
    const activeDocuments: DocumentRecord[] = [];

    for (const document of documents) {
      if (isDocumentExpired(document)) {
        await purgeExpiredDocumentRecord(document);
        continue;
      }

      activeDocuments.push(document);
    }

    return activeDocuments;
  }

  const rawDocuments = [...getMemoryStore().documents.values()]
    .filter((record) => record.ownerUid === ownerUid)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, limit);
  await backfillMissingOwnerRoles("documents", rawDocuments, resolvedOwnerRole);
  const documents = normalizeDocumentRecordList(rawDocuments, resolvedOwnerRole);

  const activeDocuments: DocumentRecord[] = [];
  for (const document of documents) {
    if (isDocumentExpired(document)) {
      await purgeExpiredDocumentRecord(document);
      continue;
    }

    activeDocuments.push(document);
  }

  return activeDocuments;
}

export async function getDocumentById(id: string) {
  if (shouldUseFirestore()) {
    const snapshot = await getZootopiaFirestore()
      .collection("documents")
      .doc(id)
      .get();

    if (!snapshot.exists) {
      return null;
    }

    const document = snapshot.data() as unknown as DocumentRecord;
    const fallbackDocuments = await listDocumentsForUser(document.ownerUid, 10);
    const fallbackActiveId =
      fallbackDocuments.find((record) => record.isActive)?.id ?? null;
    const resolvedOwnerRole = await resolvePersistedOwnerRole({
      ownerUid: document.ownerUid,
      ownerRole: document.ownerRole,
    });
    await backfillMissingOwnerRoles("documents", [document], resolvedOwnerRole);

    const normalizedDocument = normalizeDocumentRecord(
      document,
      fallbackActiveId,
      resolvedOwnerRole,
    );
    if (isDocumentExpired(normalizedDocument)) {
      await purgeExpiredDocumentRecord(normalizedDocument);
      return null;
    }

    return normalizedDocument;
  }

  const record = getMemoryStore().documents.get(id);
  if (!record) {
    return null;
  }

  const fallbackDocuments = await listDocumentsForUser(record.ownerUid, 10);
  const fallbackActiveId = fallbackDocuments.find((document) => document.isActive)?.id ?? null;
  const resolvedOwnerRole = await resolvePersistedOwnerRole({
    ownerUid: record.ownerUid,
    ownerRole: record.ownerRole,
  });
  await backfillMissingOwnerRoles("documents", [record], resolvedOwnerRole);

  const normalizedDocument = normalizeDocumentRecord(
    record,
    fallbackActiveId,
    resolvedOwnerRole,
  );
  if (isDocumentExpired(normalizedDocument)) {
    await purgeExpiredDocumentRecord(normalizedDocument);
    return null;
  }

  return normalizedDocument;
}

export async function getDocumentByIdForOwner(id: string, ownerUid: string) {
  const document = await getDocumentById(id);
  if (!document || document.ownerUid !== ownerUid) {
    return null;
  }

  return document;
}

export async function getActiveDocumentForOwner(ownerUid: string) {
  const documents = await listDocumentsForUser(ownerUid, 20);
  return documents.find((document) => document.isActive) ?? documents[0] ?? null;
}

async function promoteMostRecentDocumentActive(ownerUid: string) {
  const promotedAt = toIsoTimestamp(new Date());

  if (shouldUseFirestore()) {
    const snapshot = await getZootopiaFirestore()
      .collection("documents")
      .where("ownerUid", "==", ownerUid)
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();

    const nextDocument = snapshot.docs[0];
    if (!nextDocument) {
      return null;
    }

    await nextDocument.ref.set(
      {
        isActive: true,
        supersededAt: null,
        updatedAt: promotedAt,
      } satisfies Partial<DocumentRecord>,
      { merge: true },
    );

    return nextDocument.data() as unknown as DocumentRecord;
  }

  const store = getMemoryStore();
  const nextDocument = [...store.documents.values()]
    .filter((document) => document.ownerUid === ownerUid)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];

  if (!nextDocument) {
    return null;
  }

  store.documents.set(nextDocument.id, {
    ...nextDocument,
    isActive: true,
    supersededAt: null,
    updatedAt: promotedAt,
  });

  return nextDocument;
}

export async function deleteDocumentForOwner(documentId: string, ownerUid: string) {
  const record = await getDocumentByIdForOwner(documentId, ownerUid);
  if (!record) {
    return null;
  }

  if (shouldUseFirestore()) {
    await getZootopiaFirestore()
      .collection("documents")
      .doc(documentId)
      .delete();
  } else {
    getMemoryStore().documents.delete(documentId);
  }

  /* Removing the active upload should leave the workspace with one stable active source when older documents still exist.
     Future agents should preserve this promotion step so Upload and Assessment keep the current active-document contract. */
  if (record.isActive) {
    await promoteMostRecentDocumentActive(ownerUid);
  }

  return record;
}

function clampManualCredits(value: number) {
  return Math.min(
    ASSESSMENT_CREDIT_MANUAL_BALANCE_MAX,
    Math.max(ASSESSMENT_CREDIT_MANUAL_BALANCE_MIN, value),
  );
}

function clampGrantCredits(value: number) {
  return Math.min(ASSESSMENT_CREDIT_GRANT_MAX, Math.max(ASSESSMENT_CREDIT_GRANT_MIN, value));
}

function parseOptionalIsoTimestamp(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function normalizeAssessmentCreditAccountRecord(input: {
  ownerUid: string;
  record: Partial<AssessmentCreditAccountRecord> | null | undefined;
  nowIso: string;
}) {
  return {
    ownerUid: input.ownerUid,
    assessmentAccess: input.record?.assessmentAccess === "disabled" ? "disabled" : "enabled",
    dailyLimitOverride: normalizeAssessmentDailyLimitOverride(input.record?.dailyLimitOverride),
    manualCredits: clampManualCredits(
      typeof input.record?.manualCredits === "number" && Number.isFinite(input.record.manualCredits)
        ? Math.round(input.record.manualCredits)
        : 0,
    ),
    createdAt: String(input.record?.createdAt || input.nowIso),
    updatedAt: String(input.record?.updatedAt || input.nowIso),
  } satisfies AssessmentCreditAccountRecord;
}

function normalizeAssessmentCreditGrantRecord(input: {
  ownerUid: string;
  grantId: string;
  record: Partial<AssessmentCreditGrantRecord> | null | undefined;
  nowIso: string;
}) {
  const credits = clampGrantCredits(
    typeof input.record?.credits === "number" && Number.isFinite(input.record.credits)
      ? Math.round(input.record.credits)
      : ASSESSMENT_CREDIT_GRANT_MIN,
  );
  const consumedRaw =
    typeof input.record?.consumed === "number" && Number.isFinite(input.record.consumed)
      ? Math.round(input.record.consumed)
      : 0;

  return {
    id: input.grantId,
    ownerUid: input.ownerUid,
    credits,
    consumed: Math.max(0, Math.min(consumedRaw, credits)),
    status: input.record?.status === "revoked" ? "revoked" : "active",
    expiresAt: parseOptionalIsoTimestamp(input.record?.expiresAt),
    reason:
      typeof input.record?.reason === "string" && input.record.reason.trim()
        ? input.record.reason.trim()
        : null,
    note:
      typeof input.record?.note === "string" && input.record.note.trim()
        ? input.record.note.trim()
        : null,
    createdByUid:
      typeof input.record?.createdByUid === "string" && input.record.createdByUid.trim()
        ? input.record.createdByUid.trim()
        : "system",
    createdByRole:
      input.record?.createdByRole === "admin" || input.record?.createdByRole === "user"
        ? input.record.createdByRole
        : undefined,
    createdAt: String(input.record?.createdAt || input.nowIso),
    updatedAt: String(input.record?.updatedAt || input.nowIso),
    revokedAt: parseOptionalIsoTimestamp(input.record?.revokedAt),
    revokedByUid:
      typeof input.record?.revokedByUid === "string" && input.record.revokedByUid.trim()
        ? input.record.revokedByUid.trim()
        : null,
    revokeReason:
      typeof input.record?.revokeReason === "string" && input.record.revokeReason.trim()
        ? input.record.revokeReason.trim()
        : null,
  } satisfies AssessmentCreditGrantRecord;
}

function resolveAssessmentCreditGrantAvailableAmount(
  grant: AssessmentCreditGrantRecord,
  nowMs = Date.now(),
) {
  if (grant.status !== "active") {
    return 0;
  }

  const expiresAtMs = grant.expiresAt ? Date.parse(grant.expiresAt) : Number.NaN;
  if (Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs) {
    return 0;
  }

  return Math.max(grant.credits - grant.consumed, 0);
}

function resolveAssessmentCreditGrantEffectiveStatus(
  grant: AssessmentCreditGrantRecord,
  nowMs = Date.now(),
): AssessmentCreditGrantEffectiveStatus {
  if (grant.status === "revoked") {
    return "revoked";
  }

  const expiresAtMs = grant.expiresAt ? Date.parse(grant.expiresAt) : Number.NaN;
  if (Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs) {
    return "expired";
  }

  return resolveAssessmentCreditGrantAvailableAmount(grant, nowMs) > 0
    ? "active"
    : "exhausted";
}

function sortGrantsForConsumption(grants: AssessmentCreditGrantRecord[]) {
  return [...grants].sort((left, right) => {
    const leftExpiresAt = left.expiresAt ? Date.parse(left.expiresAt) : Number.POSITIVE_INFINITY;
    const rightExpiresAt = right.expiresAt
      ? Date.parse(right.expiresAt)
      : Number.POSITIVE_INFINITY;

    if (leftExpiresAt !== rightExpiresAt) {
      return leftExpiresAt - rightExpiresAt;
    }

    return left.createdAt.localeCompare(right.createdAt);
  });
}

function buildAssessmentCreditGrantAdminView(
  grant: AssessmentCreditGrantRecord,
  nowMs = Date.now(),
) {
  return {
    ...grant,
    effectiveStatus: resolveAssessmentCreditGrantEffectiveStatus(grant, nowMs),
    available: resolveAssessmentCreditGrantAvailableAmount(grant, nowMs),
  } satisfies AssessmentCreditGrantAdminView;
}

function buildAssessmentCreditComputation(input: {
  role: UserRole;
  dayKey: string;
  resetsAt: string;
  ledger: AssessmentDailyCreditLedgerDocument;
  account: AssessmentCreditAccountRecord;
  grants: AssessmentCreditGrantRecord[];
  dailyReservationCount?: number;
  extraReservationCount?: number;
}) {
  const nowMs = Date.now();
  const dailyDefaultLimit = getDefaultDailyAssessmentCreditsLimit();
  const dailyLimit = resolveAssessmentDailyCreditsLimit({
    override: input.account.dailyLimitOverride,
    fallback: input.ledger.dailyLimit || dailyDefaultLimit,
  });
  const grantCreditsAvailable = input.grants.reduce(
    (total, grant) => total + resolveAssessmentCreditGrantAvailableAmount(grant, nowMs),
    0,
  );
  const activeGrantCount = input.grants.filter(
    (grant) => resolveAssessmentCreditGrantEffectiveStatus(grant, nowMs) === "active",
  ).length;
  const dailyLimitSource = input.account.dailyLimitOverride ? "override" : "default";

  const summary = buildAssessmentDailyCreditsSummary({
    role: input.role,
    dayKey: input.dayKey,
    usedCount: input.ledger.successfulGenerationIds.length,
    resetsAt: input.resetsAt,
    assessmentAccess: input.account.assessmentAccess,
    dailyDefaultLimit,
    dailyLimit,
    dailyLimitSource,
    dailyReservationCount: input.dailyReservationCount,
    manualCreditsAvailable: input.account.manualCredits,
    grantCreditsAvailable,
    extraReservationCount: input.extraReservationCount,
    activeGrantCount,
  });

  return {
    dailyLimit,
    summary,
    manualCreditsAvailable: input.account.manualCredits,
    grantCreditsAvailable,
    activeGrantCount,
  };
}

async function readAssessmentCreditAccount(input: { ownerUid: string; nowIso: string }) {
  if (shouldUseFirestore()) {
    const snapshot = await getZootopiaFirestore()
      .collection(ASSESSMENT_CREDIT_ACCOUNTS_COLLECTION)
      .doc(input.ownerUid)
      .get();

    return normalizeAssessmentCreditAccountRecord({
      ownerUid: input.ownerUid,
      record: snapshot.exists
        ? (snapshot.data() as Partial<AssessmentCreditAccountRecord>)
        : null,
      nowIso: input.nowIso,
    });
  }

  return normalizeAssessmentCreditAccountRecord({
    ownerUid: input.ownerUid,
    record: getMemoryStore().assessmentCreditAccounts.get(input.ownerUid) ?? null,
    nowIso: input.nowIso,
  });
}

async function listAssessmentCreditGrantsForOwner(input: { ownerUid: string; nowIso: string }) {
  if (shouldUseFirestore()) {
    const snapshot = await getZootopiaFirestore()
      .collection(ASSESSMENT_CREDIT_GRANTS_COLLECTION)
      .where("ownerUid", "==", input.ownerUid)
      .limit(400)
      .get();

    return snapshot.docs.map((documentSnapshot) =>
      normalizeAssessmentCreditGrantRecord({
        ownerUid: input.ownerUid,
        grantId: documentSnapshot.id,
        record: documentSnapshot.data() as Partial<AssessmentCreditGrantRecord>,
        nowIso: input.nowIso,
      }),
    );
  }

  return [...getMemoryStore().assessmentCreditGrants.values()]
    .filter((grant) => grant.ownerUid === input.ownerUid)
    .map((grant) =>
      normalizeAssessmentCreditGrantRecord({
        ownerUid: input.ownerUid,
        grantId: grant.id,
        record: grant,
        nowIso: input.nowIso,
      }),
    );
}

async function readAssessmentDailyCreditLedger(input: {
  ownerUid: string;
  dayKey: string;
  nowIso: string;
}) {
  const documentId = buildAssessmentDailyCreditDocumentId(input.ownerUid, input.dayKey);

  if (shouldUseFirestore()) {
    const snapshot = await getZootopiaFirestore()
      .collection(ASSESSMENT_DAILY_CREDITS_COLLECTION)
      .doc(documentId)
      .get();

    return normalizeAssessmentDailyCreditLedger({
      ownerUid: input.ownerUid,
      dayKey: input.dayKey,
      record: snapshot.exists
        ? (snapshot.data() as Partial<AssessmentDailyCreditLedgerDocument>)
        : null,
      nowIso: input.nowIso,
    });
  }

  return normalizeAssessmentDailyCreditLedger({
    ownerUid: input.ownerUid,
    dayKey: input.dayKey,
    record: getMemoryStore().assessmentDailyCredits.get(documentId) ?? null,
    nowIso: input.nowIso,
  });
}

type AssessmentCreditStateSnapshot = {
  account: AssessmentCreditAccountRecord;
  grants: AssessmentCreditGrantRecord[];
  ledger: AssessmentDailyCreditLedgerDocument;
  activeReservations: AssessmentDailyCreditReservation[];
  creditWindow: ReturnType<typeof resolveAssessmentDailyCreditWindow>;
  dailyReservationCount: number;
  extraReservationCount: number;
  summary: AssessmentDailyCreditsSummary;
  dailyLimit: number;
};

async function resolveAssessmentCreditStateForUser(
  user: Pick<SessionUser, "uid" | "role">,
  now = new Date(),
): Promise<AssessmentCreditStateSnapshot> {
  const nowIso = toIsoTimestamp(now);
  const creditWindow = resolveAssessmentDailyCreditWindow(now);
  const [account, grants, ledger] = await Promise.all([
    readAssessmentCreditAccount({
      ownerUid: user.uid,
      nowIso,
    }),
    listAssessmentCreditGrantsForOwner({
      ownerUid: user.uid,
      nowIso,
    }),
    readAssessmentDailyCreditLedger({
      ownerUid: user.uid,
      dayKey: creditWindow.dayKey,
      nowIso,
    }),
  ]);
  const activeReservations = filterActiveAssessmentDailyCreditReservations(
    ledger.pendingReservations,
    now.getTime(),
  );
  const dailyReservationCount = activeReservations.filter(
    (reservation) => reservation.source === "daily",
  ).length;
  const extraReservationCount = activeReservations.filter(
    (reservation) => reservation.source === "extra",
  ).length;
  const computation = buildAssessmentCreditComputation({
    role: user.role,
    dayKey: creditWindow.dayKey,
    resetsAt: creditWindow.resetsAt,
    ledger,
    account,
    grants,
    dailyReservationCount,
    extraReservationCount,
  });

  return {
    account,
    grants,
    ledger,
    activeReservations,
    creditWindow,
    dailyReservationCount,
    extraReservationCount,
    summary: computation.summary,
    dailyLimit: computation.dailyLimit,
  };
}

/* Assessment Studio and the protected header read this summary as server-owned truth. Keep this
   helper read-only so browser state stays informational and all consumption authority remains in
   reserve/commit transaction paths. */
export async function getAssessmentDailyCreditsSummaryForUser(
  user: Pick<SessionUser, "uid" | "role">,
) {
  const state = await resolveAssessmentCreditStateForUser(user);
  return state.summary;
}

export async function getAdminAssessmentCreditStateForUser(ownerUid: string) {
  const owner = await getUserByUid(ownerUid);
  if (!owner) {
    return null;
  }

  const state = await resolveAssessmentCreditStateForUser({
    uid: ownerUid,
    role: owner.role,
  });
  const nowMs = Date.now();

  return {
    ownerUid,
    account: state.account,
    credits: state.summary,
    grants: state.grants
      .map((grant) => buildAssessmentCreditGrantAdminView(grant, nowMs))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
  } satisfies AdminAssessmentCreditState;
}

function sanitizeCreditMutationText(value: unknown, maxLength = 320) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  return normalized.slice(0, maxLength);
}

function parseMutationPositiveAmount(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  const rounded = Math.round(value);
  return rounded > 0 ? rounded : null;
}

function parseMutationNonNegativeAmount(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  const rounded = Math.round(value);
  return rounded >= 0 ? rounded : null;
}

function buildAssessmentGenerationIdempotencyDocumentId(input: {
  ownerUid: string;
  idempotencyKeyHash: string;
}) {
  return `${input.ownerUid}_${input.idempotencyKeyHash}`;
}

function isAssessmentGenerationIdempotencyInProgressStale(input: {
  updatedAt: string | null;
  createdAt: string | null;
  nowMs: number;
}) {
  const referenceTimestamp = input.updatedAt ?? input.createdAt;
  if (!referenceTimestamp) {
    return false;
  }

  const referenceMs = Date.parse(referenceTimestamp);
  if (!Number.isFinite(referenceMs)) {
    return false;
  }

  return input.nowMs - referenceMs >= ASSESSMENT_GENERATION_IDEMPOTENCY_IN_PROGRESS_STALE_MS;
}

export type AssessmentGenerationIdempotencyToken = {
  docId: string;
  ownerUid: string;
  idempotencyKeyHash: string;
  requestFingerprint: string;
  generationId: string;
};

type BeginAssessmentGenerationIdempotencyResult =
  | {
      status: "started";
      token: AssessmentGenerationIdempotencyToken;
    }
  | {
      status: "replay";
      generation: AssessmentGeneration;
      credits: AssessmentDailyCreditsSummary;
    }
  | {
      status: "in-progress";
    }
  | {
      status: "key-conflict";
    };

/* Idempotency keys are owner-scoped and transaction-backed to collapse browser retries,
   duplicate submits, and network replay into a single persisted assessment commit. */
export async function beginAssessmentGenerationIdempotency(input: {
  user: Pick<SessionUser, "uid" | "role">;
  idempotencyKeyHash: string;
  requestFingerprint: string;
  generationId: string;
}): Promise<BeginAssessmentGenerationIdempotencyResult> {
  const now = new Date();
  const nowIso = toIsoTimestamp(now);
  const docId = buildAssessmentGenerationIdempotencyDocumentId({
    ownerUid: input.user.uid,
    idempotencyKeyHash: input.idempotencyKeyHash,
  });
  const token: AssessmentGenerationIdempotencyToken = {
    docId,
    ownerUid: input.user.uid,
    idempotencyKeyHash: input.idempotencyKeyHash,
    requestFingerprint: input.requestFingerprint,
    generationId: input.generationId,
  };
  let outcome: "started" | "replay" | "in-progress" | "key-conflict" = "started";
  let replayGenerationId: string | null = null;

  if (shouldUseFirestore()) {
    await getZootopiaFirestore().runTransaction(async (transaction) => {
      const lockRef = getZootopiaFirestore()
        .collection(ASSESSMENT_GENERATION_IDEMPOTENCY_COLLECTION)
        .doc(docId);
      const lockSnapshot = await transaction.get(lockRef);
      const existing = lockSnapshot.exists
        ? (lockSnapshot.data() as Partial<AssessmentGenerationIdempotencyRecord>)
        : null;

      if (existing) {
        const existingRequestFingerprint =
          typeof existing.requestFingerprint === "string"
            ? existing.requestFingerprint
            : "";
        if (
          existingRequestFingerprint &&
          existingRequestFingerprint !== input.requestFingerprint
        ) {
          outcome = "key-conflict";
          return;
        }

        const existingStatus: AssessmentGenerationIdempotencyStatus =
          existing.status === "completed" ? "completed" : "in_progress";

        if (
          existingStatus === "completed" &&
          typeof existing.generationId === "string" &&
          existing.generationId
        ) {
          const generationSnapshot = await transaction.get(
            getZootopiaFirestore()
              .collection("assessmentGenerations")
              .doc(existing.generationId),
          );

          if (generationSnapshot.exists) {
            replayGenerationId = existing.generationId;
            outcome = "replay";
            return;
          }
        }

        if (
          existingStatus === "in_progress" &&
          !isAssessmentGenerationIdempotencyInProgressStale({
            updatedAt: typeof existing.updatedAt === "string" ? existing.updatedAt : null,
            createdAt: typeof existing.createdAt === "string" ? existing.createdAt : null,
            nowMs: now.getTime(),
          })
        ) {
          outcome = "in-progress";
          return;
        }
      }

      const nextRecord: AssessmentGenerationIdempotencyRecord = {
        ownerUid: input.user.uid,
        idempotencyKeyHash: input.idempotencyKeyHash,
        requestFingerprint: input.requestFingerprint,
        generationId: input.generationId,
        status: "in_progress",
        createdAt:
          existing && typeof existing.createdAt === "string" && existing.createdAt
            ? existing.createdAt
            : nowIso,
        updatedAt: nowIso,
        expiresAt: getRetentionExpiryTimestamp(nowIso),
      };

      transaction.set(lockRef, nextRecord, { merge: true });
      outcome = "started";
    });
  } else {
    const store = getMemoryStore();
    const existing = store.assessmentGenerationIdempotency.get(docId) ?? null;

    if (existing && existing.requestFingerprint !== input.requestFingerprint) {
      outcome = "key-conflict";
    } else if (
      existing?.status === "completed" &&
      existing.generationId &&
      store.assessments.get(existing.generationId)?.ownerUid === input.user.uid
    ) {
      replayGenerationId = existing.generationId;
      outcome = "replay";
    } else if (
      existing?.status === "in_progress" &&
      !isAssessmentGenerationIdempotencyInProgressStale({
        updatedAt: existing.updatedAt,
        createdAt: existing.createdAt,
        nowMs: now.getTime(),
      })
    ) {
      outcome = "in-progress";
    } else {
      store.assessmentGenerationIdempotency.set(docId, {
        ownerUid: input.user.uid,
        idempotencyKeyHash: input.idempotencyKeyHash,
        requestFingerprint: input.requestFingerprint,
        generationId: input.generationId,
        status: "in_progress",
        createdAt: existing?.createdAt ?? nowIso,
        updatedAt: nowIso,
        expiresAt: getRetentionExpiryTimestamp(nowIso),
      });
      outcome = "started";
    }
  }

  if (outcome === "replay" && replayGenerationId) {
    const generation = await getAssessmentGenerationForOwner(
      replayGenerationId,
      input.user.uid,
    );
    if (generation) {
      return {
        status: "replay",
        generation,
        credits: await getAssessmentDailyCreditsSummaryForUser(input.user),
      };
    }
  }

  if (outcome === "in-progress") {
    return { status: "in-progress" };
  }

  if (outcome === "key-conflict") {
    return { status: "key-conflict" };
  }

  return {
    status: "started",
    token,
  };
}

/* Mark the lock completed only after generation save+credit commit succeeds, so key replays can
   return the already persisted generation instead of re-running the model path. */
export async function completeAssessmentGenerationIdempotency(input: {
  token: AssessmentGenerationIdempotencyToken;
  generation: Pick<AssessmentGeneration, "id" | "ownerUid" | "expiresAt">;
}) {
  if (
    input.generation.id !== input.token.generationId ||
    input.generation.ownerUid !== input.token.ownerUid
  ) {
    return;
  }

  const nowIso = toIsoTimestamp(new Date());

  if (shouldUseFirestore()) {
    await getZootopiaFirestore().runTransaction(async (transaction) => {
      const lockRef = getZootopiaFirestore()
        .collection(ASSESSMENT_GENERATION_IDEMPOTENCY_COLLECTION)
        .doc(input.token.docId);
      const lockSnapshot = await transaction.get(lockRef);
      if (!lockSnapshot.exists) {
        return;
      }

      const existing = lockSnapshot.data() as Partial<AssessmentGenerationIdempotencyRecord>;
      if (existing.requestFingerprint !== input.token.requestFingerprint) {
        return;
      }

      transaction.set(
        lockRef,
        {
          ownerUid: input.token.ownerUid,
          idempotencyKeyHash: input.token.idempotencyKeyHash,
          requestFingerprint: input.token.requestFingerprint,
          generationId: input.token.generationId,
          status: "completed",
          createdAt:
            typeof existing.createdAt === "string" && existing.createdAt
              ? existing.createdAt
              : nowIso,
          updatedAt: nowIso,
          expiresAt: input.generation.expiresAt || getRetentionExpiryTimestamp(nowIso),
        } satisfies AssessmentGenerationIdempotencyRecord,
        { merge: true },
      );
    });
    return;
  }

  const store = getMemoryStore();
  const existing = store.assessmentGenerationIdempotency.get(input.token.docId);
  if (existing && existing.requestFingerprint !== input.token.requestFingerprint) {
    return;
  }

  store.assessmentGenerationIdempotency.set(input.token.docId, {
    ownerUid: input.token.ownerUid,
    idempotencyKeyHash: input.token.idempotencyKeyHash,
    requestFingerprint: input.token.requestFingerprint,
    generationId: input.token.generationId,
    status: "completed",
    createdAt: existing?.createdAt ?? nowIso,
    updatedAt: nowIso,
    expiresAt: input.generation.expiresAt || getRetentionExpiryTimestamp(nowIso),
  });
}

/* Failed or cancelled attempts should release the in-progress idempotency lock so the user can
   safely retry with the same key after transient errors. */
export async function clearAssessmentGenerationIdempotencyLock(input: {
  token: AssessmentGenerationIdempotencyToken;
}) {
  if (shouldUseFirestore()) {
    await getZootopiaFirestore().runTransaction(async (transaction) => {
      const lockRef = getZootopiaFirestore()
        .collection(ASSESSMENT_GENERATION_IDEMPOTENCY_COLLECTION)
        .doc(input.token.docId);
      const lockSnapshot = await transaction.get(lockRef);
      if (!lockSnapshot.exists) {
        return;
      }

      const existing = lockSnapshot.data() as Partial<AssessmentGenerationIdempotencyRecord>;
      if (
        existing.requestFingerprint !== input.token.requestFingerprint ||
        existing.status === "completed"
      ) {
        return;
      }

      if (existing.generationId !== input.token.generationId) {
        return;
      }

      transaction.delete(lockRef);
    });
    return;
  }

  const store = getMemoryStore();
  const existing = store.assessmentGenerationIdempotency.get(input.token.docId);
  if (!existing) {
    return;
  }

  if (
    existing.requestFingerprint !== input.token.requestFingerprint ||
    existing.status === "completed" ||
    existing.generationId !== input.token.generationId
  ) {
    return;
  }

  store.assessmentGenerationIdempotency.delete(input.token.docId);
}

export async function applyAdminAssessmentCreditMutation(input: {
  ownerUid: string;
  admin: Pick<SessionUser, "uid" | "role">;
  mutation: AdminAssessmentCreditMutationInput;
}) {
  const owner = await getUserByUid(input.ownerUid);
  if (!owner) {
    throw new Error("USER_NOT_FOUND");
  }

  if (input.ownerUid === input.admin.uid) {
    throw new Error("ASSESSMENT_CREDIT_SELF_MUTATION_FORBIDDEN");
  }

  const nowIso = toIsoTimestamp(new Date());
  const mutation = input.mutation;

  if (shouldUseFirestore()) {
    await getZootopiaFirestore().runTransaction(async (transaction) => {
      const accountRef = getZootopiaFirestore()
        .collection(ASSESSMENT_CREDIT_ACCOUNTS_COLLECTION)
        .doc(input.ownerUid);
      const accountSnapshot = await transaction.get(accountRef);
      const account = normalizeAssessmentCreditAccountRecord({
        ownerUid: input.ownerUid,
        record: accountSnapshot.exists
          ? (accountSnapshot.data() as Partial<AssessmentCreditAccountRecord>)
          : null,
        nowIso,
      });

      switch (mutation.action) {
        case "set_access": {
          if (mutation.access !== "enabled" && mutation.access !== "disabled") {
            throw new Error("ASSESSMENT_CREDIT_ACCESS_INVALID");
          }

          transaction.set(
            accountRef,
            {
              ...account,
              assessmentAccess: mutation.access,
              updatedAt: nowIso,
            } satisfies AssessmentCreditAccountRecord,
            { merge: true },
          );
          return;
        }

        case "set_daily_override": {
          const override = normalizeAssessmentDailyLimitOverride(
            mutation.dailyLimitOverride,
          );
          if (!override) {
            throw new Error("ASSESSMENT_DAILY_OVERRIDE_INVALID");
          }

          transaction.set(
            accountRef,
            {
              ...account,
              dailyLimitOverride: override,
              updatedAt: nowIso,
            } satisfies AssessmentCreditAccountRecord,
            { merge: true },
          );
          return;
        }

        case "clear_daily_override": {
          transaction.set(
            accountRef,
            {
              ...account,
              dailyLimitOverride: null,
              updatedAt: nowIso,
            } satisfies AssessmentCreditAccountRecord,
            { merge: true },
          );
          return;
        }

        case "add_manual_credits": {
          const amount = parseMutationPositiveAmount(mutation.amount);
          if (!amount) {
            throw new Error("ASSESSMENT_CREDIT_AMOUNT_INVALID");
          }

          transaction.set(
            accountRef,
            {
              ...account,
              manualCredits: clampManualCredits(account.manualCredits + amount),
              updatedAt: nowIso,
            } satisfies AssessmentCreditAccountRecord,
            { merge: true },
          );
          return;
        }

        case "subtract_manual_credits": {
          const amount = parseMutationPositiveAmount(mutation.amount);
          if (!amount) {
            throw new Error("ASSESSMENT_CREDIT_AMOUNT_INVALID");
          }

          transaction.set(
            accountRef,
            {
              ...account,
              manualCredits: clampManualCredits(account.manualCredits - amount),
              updatedAt: nowIso,
            } satisfies AssessmentCreditAccountRecord,
            { merge: true },
          );
          return;
        }

        case "set_manual_credits": {
          const amount = parseMutationNonNegativeAmount(mutation.amount);
          if (amount === null) {
            throw new Error("ASSESSMENT_CREDIT_AMOUNT_INVALID");
          }

          transaction.set(
            accountRef,
            {
              ...account,
              manualCredits: clampManualCredits(amount),
              updatedAt: nowIso,
            } satisfies AssessmentCreditAccountRecord,
            { merge: true },
          );
          return;
        }

        case "grant_credits": {
          const amount = parseMutationPositiveAmount(mutation.amount);
          if (!amount) {
            throw new Error("ASSESSMENT_CREDIT_AMOUNT_INVALID");
          }

          const expiresAt = parseOptionalIsoTimestamp(mutation.expiresAt ?? null);
          if (mutation.expiresAt && !expiresAt) {
            throw new Error("ASSESSMENT_CREDIT_GRANT_EXPIRY_INVALID");
          }

          if (expiresAt && Date.parse(expiresAt) <= Date.now()) {
            throw new Error("ASSESSMENT_CREDIT_GRANT_EXPIRY_INVALID");
          }

          const grantId = randomUUID();
          const grantRecord: AssessmentCreditGrantRecord = {
            id: grantId,
            ownerUid: input.ownerUid,
            credits: clampGrantCredits(amount),
            consumed: 0,
            status: "active",
            expiresAt,
            reason: sanitizeCreditMutationText(mutation.reason),
            note: sanitizeCreditMutationText(mutation.note, 1000),
            createdByUid: input.admin.uid,
            createdByRole: input.admin.role,
            createdAt: nowIso,
            updatedAt: nowIso,
            revokedAt: null,
            revokedByUid: null,
            revokeReason: null,
          };

          transaction.set(
            getZootopiaFirestore()
              .collection(ASSESSMENT_CREDIT_GRANTS_COLLECTION)
              .doc(grantId),
            grantRecord,
            { merge: true },
          );
          return;
        }

        case "revoke_grant": {
          const grantId = String(mutation.grantId || "").trim();
          if (!grantId) {
            throw new Error("ASSESSMENT_CREDIT_GRANT_ID_REQUIRED");
          }

          const grantRef = getZootopiaFirestore()
            .collection(ASSESSMENT_CREDIT_GRANTS_COLLECTION)
            .doc(grantId);
          const grantSnapshot = await transaction.get(grantRef);
          if (!grantSnapshot.exists) {
            throw new Error("ASSESSMENT_CREDIT_GRANT_NOT_FOUND");
          }

          const grant = normalizeAssessmentCreditGrantRecord({
            ownerUid: input.ownerUid,
            grantId,
            record: grantSnapshot.data() as Partial<AssessmentCreditGrantRecord>,
            nowIso,
          });

          if (grant.ownerUid !== input.ownerUid) {
            throw new Error("ASSESSMENT_CREDIT_GRANT_OWNER_MISMATCH");
          }

          if (grant.status === "revoked") {
            throw new Error("ASSESSMENT_CREDIT_GRANT_ALREADY_REVOKED");
          }

          transaction.set(
            grantRef,
            {
              ...grant,
              status: "revoked",
              revokedAt: nowIso,
              revokedByUid: input.admin.uid,
              revokeReason: sanitizeCreditMutationText(mutation.reason),
              updatedAt: nowIso,
            } satisfies AssessmentCreditGrantRecord,
            { merge: true },
          );
          return;
        }

        default:
          throw new Error("ASSESSMENT_CREDIT_ACTION_UNSUPPORTED");
      }
    });
  } else {
    const store = getMemoryStore();
    const account = normalizeAssessmentCreditAccountRecord({
      ownerUid: input.ownerUid,
      record: store.assessmentCreditAccounts.get(input.ownerUid) ?? null,
      nowIso,
    });

    switch (mutation.action) {
      case "set_access": {
        if (mutation.access !== "enabled" && mutation.access !== "disabled") {
          throw new Error("ASSESSMENT_CREDIT_ACCESS_INVALID");
        }

        store.assessmentCreditAccounts.set(input.ownerUid, {
          ...account,
          assessmentAccess: mutation.access,
          updatedAt: nowIso,
        });
        break;
      }

      case "set_daily_override": {
        const override = normalizeAssessmentDailyLimitOverride(
          mutation.dailyLimitOverride,
        );
        if (!override) {
          throw new Error("ASSESSMENT_DAILY_OVERRIDE_INVALID");
        }

        store.assessmentCreditAccounts.set(input.ownerUid, {
          ...account,
          dailyLimitOverride: override,
          updatedAt: nowIso,
        });
        break;
      }

      case "clear_daily_override": {
        store.assessmentCreditAccounts.set(input.ownerUid, {
          ...account,
          dailyLimitOverride: null,
          updatedAt: nowIso,
        });
        break;
      }

      case "add_manual_credits": {
        const amount = parseMutationPositiveAmount(mutation.amount);
        if (!amount) {
          throw new Error("ASSESSMENT_CREDIT_AMOUNT_INVALID");
        }

        store.assessmentCreditAccounts.set(input.ownerUid, {
          ...account,
          manualCredits: clampManualCredits(account.manualCredits + amount),
          updatedAt: nowIso,
        });
        break;
      }

      case "subtract_manual_credits": {
        const amount = parseMutationPositiveAmount(mutation.amount);
        if (!amount) {
          throw new Error("ASSESSMENT_CREDIT_AMOUNT_INVALID");
        }

        store.assessmentCreditAccounts.set(input.ownerUid, {
          ...account,
          manualCredits: clampManualCredits(account.manualCredits - amount),
          updatedAt: nowIso,
        });
        break;
      }

      case "set_manual_credits": {
        const amount = parseMutationNonNegativeAmount(mutation.amount);
        if (amount === null) {
          throw new Error("ASSESSMENT_CREDIT_AMOUNT_INVALID");
        }

        store.assessmentCreditAccounts.set(input.ownerUid, {
          ...account,
          manualCredits: clampManualCredits(amount),
          updatedAt: nowIso,
        });
        break;
      }

      case "grant_credits": {
        const amount = parseMutationPositiveAmount(mutation.amount);
        if (!amount) {
          throw new Error("ASSESSMENT_CREDIT_AMOUNT_INVALID");
        }

        const expiresAt = parseOptionalIsoTimestamp(mutation.expiresAt ?? null);
        if (mutation.expiresAt && !expiresAt) {
          throw new Error("ASSESSMENT_CREDIT_GRANT_EXPIRY_INVALID");
        }

        if (expiresAt && Date.parse(expiresAt) <= Date.now()) {
          throw new Error("ASSESSMENT_CREDIT_GRANT_EXPIRY_INVALID");
        }

        const grantId = randomUUID();
        store.assessmentCreditGrants.set(grantId, {
          id: grantId,
          ownerUid: input.ownerUid,
          credits: clampGrantCredits(amount),
          consumed: 0,
          status: "active",
          expiresAt,
          reason: sanitizeCreditMutationText(mutation.reason),
          note: sanitizeCreditMutationText(mutation.note, 1000),
          createdByUid: input.admin.uid,
          createdByRole: input.admin.role,
          createdAt: nowIso,
          updatedAt: nowIso,
          revokedAt: null,
          revokedByUid: null,
          revokeReason: null,
        });
        break;
      }

      case "revoke_grant": {
        const grantId = String(mutation.grantId || "").trim();
        if (!grantId) {
          throw new Error("ASSESSMENT_CREDIT_GRANT_ID_REQUIRED");
        }

        const existingGrant = store.assessmentCreditGrants.get(grantId);
        if (!existingGrant) {
          throw new Error("ASSESSMENT_CREDIT_GRANT_NOT_FOUND");
        }

        if (existingGrant.ownerUid !== input.ownerUid) {
          throw new Error("ASSESSMENT_CREDIT_GRANT_OWNER_MISMATCH");
        }

        if (existingGrant.status === "revoked") {
          throw new Error("ASSESSMENT_CREDIT_GRANT_ALREADY_REVOKED");
        }

        store.assessmentCreditGrants.set(grantId, {
          ...existingGrant,
          status: "revoked",
          revokedAt: nowIso,
          revokedByUid: input.admin.uid,
          revokeReason: sanitizeCreditMutationText(mutation.reason),
          updatedAt: nowIso,
        });
        break;
      }

      default:
        throw new Error("ASSESSMENT_CREDIT_ACTION_UNSUPPORTED");
    }
  }

  const state = await getAdminAssessmentCreditStateForUser(input.ownerUid);
  if (!state) {
    throw new Error("ASSESSMENT_CREDIT_STATE_UNAVAILABLE");
  }

  return state;
}

/* Reserving a short-lived slot before model execution prevents duplicate in-flight requests from
   oversubscribing either daily allowance or admin-managed extra credits while still charging only
   on durable success commits. */
export async function reserveAssessmentDailyCreditAttempt(
  user: Pick<SessionUser, "uid" | "role">,
): Promise<AssessmentDailyCreditReservationFailure | AssessmentDailyCreditReservationSuccess> {
  const now = new Date();
  const nowIso = toIsoTimestamp(now);
  const creditWindow = resolveAssessmentDailyCreditWindow(now);

  if (isAssessmentDailyCreditsExempt(user.role)) {
    return {
      ok: true,
      reservation: null,
      credits: buildAssessmentDailyCreditsSummary({
        role: user.role,
        dayKey: creditWindow.dayKey,
        usedCount: 0,
        resetsAt: creditWindow.resetsAt,
      }),
    };
  }

  const documentId = buildAssessmentDailyCreditDocumentId(user.uid, creditWindow.dayKey);
  let summary: AssessmentDailyCreditsSummary | null = null;
  let reservation: AssessmentDailyCreditReservation | null = null;
  let failure: AssessmentDailyCreditReservationFailure | null = null;

  if (shouldUseFirestore()) {
    await getZootopiaFirestore().runTransaction(async (transaction) => {
      const creditsRef = getZootopiaFirestore()
        .collection(ASSESSMENT_DAILY_CREDITS_COLLECTION)
        .doc(documentId);
      const accountRef = getZootopiaFirestore()
        .collection(ASSESSMENT_CREDIT_ACCOUNTS_COLLECTION)
        .doc(user.uid);
      const grantsQuery = getZootopiaFirestore()
        .collection(ASSESSMENT_CREDIT_GRANTS_COLLECTION)
        .where("ownerUid", "==", user.uid)
        .limit(400);

      const [creditsSnapshot, accountSnapshot, grantsSnapshot] = await Promise.all([
        transaction.get(creditsRef),
        transaction.get(accountRef),
        transaction.get(grantsQuery),
      ]);

      const account = normalizeAssessmentCreditAccountRecord({
        ownerUid: user.uid,
        record: accountSnapshot.exists
          ? (accountSnapshot.data() as Partial<AssessmentCreditAccountRecord>)
          : null,
        nowIso,
      });
      const grants = grantsSnapshot.docs.map((grantSnapshot) =>
        normalizeAssessmentCreditGrantRecord({
          ownerUid: user.uid,
          grantId: grantSnapshot.id,
          record: grantSnapshot.data() as Partial<AssessmentCreditGrantRecord>,
          nowIso,
        }),
      );
      const ledger = normalizeAssessmentDailyCreditLedger({
        ownerUid: user.uid,
        dayKey: creditWindow.dayKey,
        record: creditsSnapshot.exists
          ? (creditsSnapshot.data() as Partial<AssessmentDailyCreditLedgerDocument>)
          : null,
        nowIso,
      });
      const activeReservations = filterActiveAssessmentDailyCreditReservations(
        ledger.pendingReservations,
        now.getTime(),
      );
      const dailyReservationCount = activeReservations.filter(
        (entry) => entry.source === "daily",
      ).length;
      const extraReservationCount = activeReservations.filter(
        (entry) => entry.source === "extra",
      ).length;
      const computation = buildAssessmentCreditComputation({
        role: user.role,
        dayKey: creditWindow.dayKey,
        resetsAt: creditWindow.resetsAt,
        ledger,
        account,
        grants,
        dailyReservationCount,
        extraReservationCount,
      });

      if (account.assessmentAccess === "disabled") {
        failure = {
          ok: false,
          code: "ASSESSMENT_ACCESS_DISABLED",
          message: ASSESSMENT_ACCESS_DISABLED_MESSAGE,
          status: 403,
          credits: computation.summary,
        };

        if (
          activeReservations.length !== ledger.pendingReservations.length ||
          ledger.dailyLimit !== computation.dailyLimit
        ) {
          transaction.set(
            creditsRef,
            {
              ...ledger,
              dailyLimit: computation.dailyLimit,
              pendingReservations: activeReservations,
              updatedAt: nowIso,
            } satisfies AssessmentDailyCreditLedgerDocument,
            { merge: true },
          );
        }

        return;
      }

      const hasDailyAvailability = (computation.summary.dailyRemainingCount ?? 0) > 0;
      const hasExtraAvailability = computation.summary.extraCreditsAvailable > 0;

      if (!hasDailyAvailability && !hasExtraAvailability) {
        failure = {
          ok: false,
          code: "ASSESSMENT_DAILY_CREDITS_EXHAUSTED",
          message: ASSESSMENT_DAILY_CREDITS_EXHAUSTED_MESSAGE,
          status: 429,
          credits: computation.summary,
        };

        if (
          activeReservations.length !== ledger.pendingReservations.length ||
          ledger.dailyLimit !== computation.dailyLimit
        ) {
          transaction.set(
            creditsRef,
            {
              ...ledger,
              dailyLimit: computation.dailyLimit,
              pendingReservations: activeReservations,
              updatedAt: nowIso,
            } satisfies AssessmentDailyCreditLedgerDocument,
            { merge: true },
          );
        }

        return;
      }

      reservation = {
        id: randomUUID(),
        dayKey: creditWindow.dayKey,
        reservedAt: nowIso,
        source: hasDailyAvailability ? "daily" : "extra",
      };

      const nextReservations = [...activeReservations, reservation];
      const nextDailyReservationCount = nextReservations.filter(
        (entry) => entry.source === "daily",
      ).length;
      const nextExtraReservationCount = nextReservations.filter(
        (entry) => entry.source === "extra",
      ).length;

      transaction.set(
        creditsRef,
        {
          ...ledger,
          dailyLimit: computation.dailyLimit,
          pendingReservations: nextReservations,
          updatedAt: nowIso,
        } satisfies AssessmentDailyCreditLedgerDocument,
        { merge: true },
      );

      summary = buildAssessmentCreditComputation({
        role: user.role,
        dayKey: creditWindow.dayKey,
        resetsAt: creditWindow.resetsAt,
        ledger: {
          ...ledger,
          dailyLimit: computation.dailyLimit,
          pendingReservations: nextReservations,
        },
        account,
        grants,
        dailyReservationCount: nextDailyReservationCount,
        extraReservationCount: nextExtraReservationCount,
      }).summary;
    });
  } else {
    const store = getMemoryStore();
    const account = normalizeAssessmentCreditAccountRecord({
      ownerUid: user.uid,
      record: store.assessmentCreditAccounts.get(user.uid) ?? null,
      nowIso,
    });
    const grants = [...store.assessmentCreditGrants.values()]
      .filter((grant) => grant.ownerUid === user.uid)
      .map((grant) =>
        normalizeAssessmentCreditGrantRecord({
          ownerUid: user.uid,
          grantId: grant.id,
          record: grant,
          nowIso,
        }),
      );
    const ledger = normalizeAssessmentDailyCreditLedger({
      ownerUid: user.uid,
      dayKey: creditWindow.dayKey,
      record: store.assessmentDailyCredits.get(documentId) ?? null,
      nowIso,
    });
    const activeReservations = filterActiveAssessmentDailyCreditReservations(
      ledger.pendingReservations,
      now.getTime(),
    );
    const dailyReservationCount = activeReservations.filter(
      (entry) => entry.source === "daily",
    ).length;
    const extraReservationCount = activeReservations.filter(
      (entry) => entry.source === "extra",
    ).length;
    const computation = buildAssessmentCreditComputation({
      role: user.role,
      dayKey: creditWindow.dayKey,
      resetsAt: creditWindow.resetsAt,
      ledger,
      account,
      grants,
      dailyReservationCount,
      extraReservationCount,
    });

    if (account.assessmentAccess === "disabled") {
      store.assessmentDailyCredits.set(documentId, {
        ...ledger,
        dailyLimit: computation.dailyLimit,
        pendingReservations: activeReservations,
        updatedAt: nowIso,
      });

      failure = {
        ok: false,
        code: "ASSESSMENT_ACCESS_DISABLED",
        message: ASSESSMENT_ACCESS_DISABLED_MESSAGE,
        status: 403,
        credits: computation.summary,
      };
    } else {
      const hasDailyAvailability = (computation.summary.dailyRemainingCount ?? 0) > 0;
      const hasExtraAvailability = computation.summary.extraCreditsAvailable > 0;

      if (!hasDailyAvailability && !hasExtraAvailability) {
        store.assessmentDailyCredits.set(documentId, {
          ...ledger,
          dailyLimit: computation.dailyLimit,
          pendingReservations: activeReservations,
          updatedAt: nowIso,
        });

        failure = {
          ok: false,
          code: "ASSESSMENT_DAILY_CREDITS_EXHAUSTED",
          message: ASSESSMENT_DAILY_CREDITS_EXHAUSTED_MESSAGE,
          status: 429,
          credits: computation.summary,
        };
      } else {
        reservation = {
          id: randomUUID(),
          dayKey: creditWindow.dayKey,
          reservedAt: nowIso,
          source: hasDailyAvailability ? "daily" : "extra",
        };

        const nextReservations = [...activeReservations, reservation];
        store.assessmentDailyCredits.set(documentId, {
          ...ledger,
          dailyLimit: computation.dailyLimit,
          pendingReservations: nextReservations,
          updatedAt: nowIso,
        });

        summary = buildAssessmentCreditComputation({
          role: user.role,
          dayKey: creditWindow.dayKey,
          resetsAt: creditWindow.resetsAt,
          ledger: {
            ...ledger,
            dailyLimit: computation.dailyLimit,
            pendingReservations: nextReservations,
          },
          account,
          grants,
          dailyReservationCount: nextReservations.filter(
            (entry) => entry.source === "daily",
          ).length,
          extraReservationCount: nextReservations.filter(
            (entry) => entry.source === "extra",
          ).length,
        }).summary;
      }
    }
  }

  if (failure) {
    return failure;
  }

  return {
    ok: true,
    reservation,
    credits: summary!,
  };
}

/* Reservations must be released whenever generation fails before durable save. Keep this
   idempotent so failed attempts cannot burn credits. */
export async function releaseAssessmentDailyCreditReservation(input: {
  user: Pick<SessionUser, "uid" | "role">;
  reservation: AssessmentDailyCreditReservation | null;
}) {
  if (!input.reservation || isAssessmentDailyCreditsExempt(input.user.role)) {
    return;
  }

  const now = new Date();
  const nowIso = toIsoTimestamp(now);
  const reservation = input.reservation;
  const documentId = buildAssessmentDailyCreditDocumentId(
    input.user.uid,
    reservation.dayKey,
  );

  if (shouldUseFirestore()) {
    await getZootopiaFirestore().runTransaction(async (transaction) => {
      const documentRef = getZootopiaFirestore()
        .collection(ASSESSMENT_DAILY_CREDITS_COLLECTION)
        .doc(documentId);
      const snapshot = await transaction.get(documentRef);
      if (!snapshot.exists) {
        return;
      }

      const ledger = normalizeAssessmentDailyCreditLedger({
        ownerUid: input.user.uid,
        dayKey: reservation.dayKey,
        record: snapshot.data() as Partial<AssessmentDailyCreditLedgerDocument>,
        nowIso,
      });
      const nextReservations = filterActiveAssessmentDailyCreditReservations(
        ledger.pendingReservations,
        now.getTime(),
      ).filter((entry) => entry.id !== reservation.id);

      if (nextReservations.length === ledger.pendingReservations.length) {
        return;
      }

      transaction.set(
        documentRef,
        {
          ...ledger,
          pendingReservations: nextReservations,
          updatedAt: nowIso,
        } satisfies AssessmentDailyCreditLedgerDocument,
        { merge: true },
      );
    });
    return;
  }

  const store = getMemoryStore();
  const ledger = normalizeAssessmentDailyCreditLedger({
    ownerUid: input.user.uid,
    dayKey: reservation.dayKey,
    record: store.assessmentDailyCredits.get(documentId) ?? null,
    nowIso,
  });
  store.assessmentDailyCredits.set(documentId, {
    ...ledger,
    pendingReservations: filterActiveAssessmentDailyCreditReservations(
      ledger.pendingReservations,
      now.getTime(),
    ).filter((entry) => entry.id !== reservation.id),
    updatedAt: nowIso,
  });
}

function consumeOneExtraCredit(input: {
  account: AssessmentCreditAccountRecord;
  grants: AssessmentCreditGrantRecord[];
  nowIso: string;
}) {
  const nowMs = Date.parse(input.nowIso);
  const nextAccount: AssessmentCreditAccountRecord = {
    ...input.account,
  };
  const grantsById = new Map(
    input.grants.map((grant) => [
      grant.id,
      {
        ...grant,
      },
    ]),
  );
  let remaining = 1;

  for (const grant of sortGrantsForConsumption(input.grants)) {
    if (remaining <= 0) {
      break;
    }

    const nextGrant = grantsById.get(grant.id);
    if (!nextGrant) {
      continue;
    }

    const available = resolveAssessmentCreditGrantAvailableAmount(nextGrant, nowMs);
    if (available <= 0) {
      continue;
    }

    nextGrant.consumed += 1;
    nextGrant.updatedAt = input.nowIso;
    remaining -= 1;
  }

  if (remaining > 0) {
    if (nextAccount.manualCredits < remaining) {
      return null;
    }

    nextAccount.manualCredits = clampManualCredits(nextAccount.manualCredits - remaining);
    nextAccount.updatedAt = input.nowIso;
  }

  return {
    account: nextAccount,
    grants: input.grants.map((grant) => grantsById.get(grant.id) ?? grant),
  };
}

/* The final Assessment save and one-credit consumption commit together in one transaction so
   durable success and quota accounting cannot drift apart. */
export async function saveAssessmentGenerationWithCreditCommit(input: {
  generation: AssessmentGeneration;
  user: Pick<SessionUser, "uid" | "role">;
  reservation: AssessmentDailyCreditReservation | null;
}) {
  if (input.generation.ownerUid !== input.user.uid) {
    throw new Error("ASSESSMENT_OWNER_MISMATCH");
  }

  const resolvedOwnerRole = await resolvePersistedOwnerRole({
    ownerUid: input.generation.ownerUid,
    ownerRole: input.generation.ownerRole,
  });
  const normalizedRecord = normalizeAssessmentGenerationRecord(input.generation, {
    resolvedOwnerRole,
  });

  if (isAssessmentDailyCreditsExempt(input.user.role)) {
    if (shouldUseFirestore()) {
      await getZootopiaFirestore()
        .collection("assessmentGenerations")
        .doc(normalizedRecord.id)
        .set(omitUndefinedOwnerRole(normalizedRecord), { merge: true });
    } else {
      getMemoryStore().assessments.set(normalizedRecord.id, normalizedRecord);
    }

    const creditWindow = resolveAssessmentDailyCreditWindow(new Date());
    return {
      generation: normalizedRecord,
      credits: buildAssessmentDailyCreditsSummary({
        role: input.user.role,
        dayKey: creditWindow.dayKey,
        usedCount: 0,
        resetsAt: creditWindow.resetsAt,
      }),
    };
  }

  if (!input.reservation) {
    throw new Error("ASSESSMENT_DAILY_CREDIT_RESERVATION_REQUIRED");
  }

  const reservation = input.reservation;
  const nowIso = normalizedRecord.updatedAt;
  const documentId = buildAssessmentDailyCreditDocumentId(
    input.user.uid,
    reservation.dayKey,
  );
  const resetsAt = getAssessmentDailyCreditResetAt(reservation.dayKey);

  if (shouldUseFirestore()) {
    let credits: AssessmentDailyCreditsSummary | null = null;

    await getZootopiaFirestore().runTransaction(async (transaction) => {
      const generationRef = getZootopiaFirestore()
        .collection("assessmentGenerations")
        .doc(normalizedRecord.id);
      const creditsRef = getZootopiaFirestore()
        .collection(ASSESSMENT_DAILY_CREDITS_COLLECTION)
        .doc(documentId);
      const accountRef = getZootopiaFirestore()
        .collection(ASSESSMENT_CREDIT_ACCOUNTS_COLLECTION)
        .doc(input.user.uid);
      const grantsQuery = getZootopiaFirestore()
        .collection(ASSESSMENT_CREDIT_GRANTS_COLLECTION)
        .where("ownerUid", "==", input.user.uid)
        .limit(400);

      const [creditsSnapshot, accountSnapshot, grantsSnapshot] = await Promise.all([
        transaction.get(creditsRef),
        transaction.get(accountRef),
        transaction.get(grantsQuery),
      ]);

      const account = normalizeAssessmentCreditAccountRecord({
        ownerUid: input.user.uid,
        record: accountSnapshot.exists
          ? (accountSnapshot.data() as Partial<AssessmentCreditAccountRecord>)
          : null,
        nowIso,
      });
      /* Access can be disabled by admin while a generation is in-flight. Re-check inside
         the commit transaction so final persistence and credit consumption stop immediately
         once the account is disabled, not only at initial reservation time. */
      if (account.assessmentAccess === "disabled") {
        throw new Error("ASSESSMENT_ACCESS_DISABLED");
      }
      const grantRefsById = new Map(
        grantsSnapshot.docs.map((grantSnapshot) => [grantSnapshot.id, grantSnapshot.ref]),
      );
      const grants = grantsSnapshot.docs.map((grantSnapshot) =>
        normalizeAssessmentCreditGrantRecord({
          ownerUid: input.user.uid,
          grantId: grantSnapshot.id,
          record: grantSnapshot.data() as Partial<AssessmentCreditGrantRecord>,
          nowIso,
        }),
      );
      const ledger = normalizeAssessmentDailyCreditLedger({
        ownerUid: input.user.uid,
        dayKey: reservation.dayKey,
        record: creditsSnapshot.exists
          ? (creditsSnapshot.data() as Partial<AssessmentDailyCreditLedgerDocument>)
          : null,
        nowIso,
      });
      const activeReservations = filterActiveAssessmentDailyCreditReservations(
        ledger.pendingReservations,
        Date.parse(nowIso),
      );
      const reservationExists = activeReservations.some((entry) => entry.id === reservation.id);
      if (!reservationExists) {
        throw new Error("ASSESSMENT_DAILY_CREDIT_RESERVATION_MISSING");
      }

      const computation = buildAssessmentCreditComputation({
        role: input.user.role,
        dayKey: reservation.dayKey,
        resetsAt,
        ledger,
        account,
        grants,
        dailyReservationCount: activeReservations.filter((entry) => entry.source === "daily")
          .length,
        extraReservationCount: activeReservations.filter((entry) => entry.source === "extra")
          .length,
      });
      const successfulGenerationIds = [...ledger.successfulGenerationIds];
      let nextAccount: AssessmentCreditAccountRecord = {
        ...account,
      };
      let nextGrants: AssessmentCreditGrantRecord[] = grants.map((grant) => ({
        ...grant,
      }));

      const consumeDaily = () => {
        if (successfulGenerationIds.length >= computation.dailyLimit) {
          return false;
        }

        if (!successfulGenerationIds.includes(normalizedRecord.id)) {
          successfulGenerationIds.push(normalizedRecord.id);
        }

        return true;
      };

      const consumeExtra = () => {
        const consumed = consumeOneExtraCredit({
          account: nextAccount,
          grants: nextGrants,
          nowIso,
        });
        if (!consumed) {
          return false;
        }

        nextAccount = consumed.account;
        nextGrants = consumed.grants;
        return true;
      };

      if (!successfulGenerationIds.includes(normalizedRecord.id)) {
        const consumed =
          reservation.source === "daily"
            ? consumeDaily() || consumeExtra()
            : consumeExtra() || consumeDaily();

        if (!consumed) {
          throw new Error("ASSESSMENT_DAILY_CREDIT_LIMIT_CONFLICT");
        }
      }

      const nextReservations = activeReservations.filter((entry) => entry.id !== reservation.id);
      const nextLedger: AssessmentDailyCreditLedgerDocument = {
        ...ledger,
        dailyLimit: computation.dailyLimit,
        successfulGenerationIds,
        pendingReservations: nextReservations,
        updatedAt: nowIso,
      };

      transaction.set(generationRef, omitUndefinedOwnerRole(normalizedRecord), {
        merge: true,
      });
      transaction.set(creditsRef, nextLedger, { merge: true });

      if (
        nextAccount.manualCredits !== account.manualCredits ||
        nextAccount.assessmentAccess !== account.assessmentAccess ||
        nextAccount.dailyLimitOverride !== account.dailyLimitOverride
      ) {
        transaction.set(
          accountRef,
          {
            ...nextAccount,
            updatedAt: nowIso,
          } satisfies AssessmentCreditAccountRecord,
          { merge: true },
        );
      }

      for (const nextGrant of nextGrants) {
        const previousGrant = grants.find((grant) => grant.id === nextGrant.id);
        if (!previousGrant || previousGrant.consumed === nextGrant.consumed) {
          continue;
        }

        const grantRef =
          grantRefsById.get(nextGrant.id)
          ?? getZootopiaFirestore()
            .collection(ASSESSMENT_CREDIT_GRANTS_COLLECTION)
            .doc(nextGrant.id);
        transaction.set(
          grantRef,
          {
            ...nextGrant,
            updatedAt: nowIso,
          } satisfies AssessmentCreditGrantRecord,
          { merge: true },
        );
      }

      credits = buildAssessmentCreditComputation({
        role: input.user.role,
        dayKey: reservation.dayKey,
        resetsAt,
        ledger: nextLedger,
        account: nextAccount,
        grants: nextGrants,
        dailyReservationCount: nextReservations.filter((entry) => entry.source === "daily")
          .length,
        extraReservationCount: nextReservations.filter((entry) => entry.source === "extra")
          .length,
      }).summary;
    });

    return {
      generation: normalizedRecord,
      credits: credits!,
    };
  }

  const store = getMemoryStore();
  const account = normalizeAssessmentCreditAccountRecord({
    ownerUid: input.user.uid,
    record: store.assessmentCreditAccounts.get(input.user.uid) ?? null,
    nowIso,
  });
  /* Keep in-memory behavior aligned with Firestore transactions so admin access toggles
     remain authoritative even when tests/dev run without Firebase Admin runtime. */
  if (account.assessmentAccess === "disabled") {
    throw new Error("ASSESSMENT_ACCESS_DISABLED");
  }
  const grants = [...store.assessmentCreditGrants.values()]
    .filter((grant) => grant.ownerUid === input.user.uid)
    .map((grant) =>
      normalizeAssessmentCreditGrantRecord({
        ownerUid: input.user.uid,
        grantId: grant.id,
        record: grant,
        nowIso,
      }),
    );
  const ledger = normalizeAssessmentDailyCreditLedger({
    ownerUid: input.user.uid,
    dayKey: reservation.dayKey,
    record: store.assessmentDailyCredits.get(documentId) ?? null,
    nowIso,
  });
  const activeReservations = filterActiveAssessmentDailyCreditReservations(
    ledger.pendingReservations,
    Date.parse(nowIso),
  );
  const reservationExists = activeReservations.some((entry) => entry.id === reservation.id);
  if (!reservationExists) {
    throw new Error("ASSESSMENT_DAILY_CREDIT_RESERVATION_MISSING");
  }

  const computation = buildAssessmentCreditComputation({
    role: input.user.role,
    dayKey: reservation.dayKey,
    resetsAt,
    ledger,
    account,
    grants,
    dailyReservationCount: activeReservations.filter((entry) => entry.source === "daily").length,
    extraReservationCount: activeReservations.filter((entry) => entry.source === "extra").length,
  });
  const successfulGenerationIds = [...ledger.successfulGenerationIds];
  let nextAccount: AssessmentCreditAccountRecord = {
    ...account,
  };
  let nextGrants: AssessmentCreditGrantRecord[] = grants.map((grant) => ({
    ...grant,
  }));

  const consumeDaily = () => {
    if (successfulGenerationIds.length >= computation.dailyLimit) {
      return false;
    }

    if (!successfulGenerationIds.includes(normalizedRecord.id)) {
      successfulGenerationIds.push(normalizedRecord.id);
    }

    return true;
  };

  const consumeExtra = () => {
    const consumed = consumeOneExtraCredit({
      account: nextAccount,
      grants: nextGrants,
      nowIso,
    });
    if (!consumed) {
      return false;
    }

    nextAccount = consumed.account;
    nextGrants = consumed.grants;
    return true;
  };

  if (!successfulGenerationIds.includes(normalizedRecord.id)) {
    const consumed =
      reservation.source === "daily"
        ? consumeDaily() || consumeExtra()
        : consumeExtra() || consumeDaily();
    if (!consumed) {
      throw new Error("ASSESSMENT_DAILY_CREDIT_LIMIT_CONFLICT");
    }
  }

  const nextReservations = activeReservations.filter((entry) => entry.id !== reservation.id);
  const nextLedger: AssessmentDailyCreditLedgerDocument = {
    ...ledger,
    dailyLimit: computation.dailyLimit,
    successfulGenerationIds,
    pendingReservations: nextReservations,
    updatedAt: nowIso,
  };

  store.assessments.set(normalizedRecord.id, normalizedRecord);
  store.assessmentDailyCredits.set(documentId, nextLedger);
  store.assessmentCreditAccounts.set(input.user.uid, {
    ...nextAccount,
    updatedAt: nowIso,
  });
  for (const grant of nextGrants) {
    store.assessmentCreditGrants.set(grant.id, {
      ...grant,
      updatedAt: nowIso,
    });
  }

  return {
    generation: normalizedRecord,
    credits: buildAssessmentCreditComputation({
      role: input.user.role,
      dayKey: reservation.dayKey,
      resetsAt,
      ledger: nextLedger,
      account: nextAccount,
      grants: nextGrants,
      dailyReservationCount: nextReservations.filter((entry) => entry.source === "daily").length,
      extraReservationCount: nextReservations.filter((entry) => entry.source === "extra").length,
    }).summary,
  };
}

export async function saveAssessmentGeneration(record: AssessmentGeneration) {
  const resolvedOwnerRole = await resolvePersistedOwnerRole({
    ownerUid: record.ownerUid,
    ownerRole: record.ownerRole,
  });
  const normalizedRecord = normalizeAssessmentGenerationRecord(record, {
    resolvedOwnerRole,
  });

  if (shouldUseFirestore()) {
    await getZootopiaFirestore()
      .collection("assessmentGenerations")
      .doc(normalizedRecord.id)
      .set(omitUndefinedOwnerRole(normalizedRecord), { merge: true });
  } else {
    getMemoryStore().assessments.set(normalizedRecord.id, normalizedRecord);
  }

  return normalizedRecord;
}

export async function listAssessmentGenerationsForUser(ownerUid: string, limit = 20) {
  const resolvedOwnerRole = await resolvePersistedOwnerRole({ ownerUid });

  if (shouldUseFirestore()) {
    const snapshot = await getZootopiaFirestore()
      .collection("assessmentGenerations")
      .where("ownerUid", "==", ownerUid)
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();

    const rawGenerations = snapshot.docs.map((doc) => doc.data() as unknown as AssessmentGeneration);
    await backfillMissingOwnerRoles(
      "assessmentGenerations",
      rawGenerations,
      resolvedOwnerRole,
    );
    const generations = rawGenerations.map((record) =>
      normalizeAssessmentGenerationRecord(record, {
        resolvedOwnerRole,
      }),
    );
    const activeGenerations: AssessmentGeneration[] = [];

    for (const generation of generations) {
      if (generation.status === "expired") {
        await purgeExpiredAssessmentGenerationRecord(generation);
        continue;
      }

      activeGenerations.push(generation);
    }

    return activeGenerations;
  }

  const rawGenerations = [...getMemoryStore().assessments.values()]
    .filter((record) => record.ownerUid === ownerUid)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, limit);
  await backfillMissingOwnerRoles(
    "assessmentGenerations",
    rawGenerations,
    resolvedOwnerRole,
  );
  const generations = rawGenerations.map((record) =>
    normalizeAssessmentGenerationRecord(record, {
      resolvedOwnerRole,
    }),
  );

  const activeGenerations: AssessmentGeneration[] = [];
  for (const generation of generations) {
    if (generation.status === "expired") {
      await purgeExpiredAssessmentGenerationRecord(generation);
      continue;
    }

    activeGenerations.push(generation);
  }

  return activeGenerations;
}

export async function getAssessmentGenerationById(id: string) {
  if (shouldUseFirestore()) {
    const snapshot = await getZootopiaFirestore()
      .collection("assessmentGenerations")
      .doc(id)
      .get();

    if (!snapshot.exists) {
      return null;
    }

    const record = snapshot.data() as unknown as AssessmentGeneration;
    const resolvedOwnerRole = await resolvePersistedOwnerRole({
      ownerUid: record.ownerUid,
      ownerRole: record.ownerRole,
    });
    await backfillMissingOwnerRoles(
      "assessmentGenerations",
      [record],
      resolvedOwnerRole,
    );

    return normalizeAssessmentGenerationRecord(record, {
      resolvedOwnerRole,
    });
  }

  const record = getMemoryStore().assessments.get(id);
  if (!record) {
    return null;
  }

  const resolvedOwnerRole = await resolvePersistedOwnerRole({
    ownerUid: record.ownerUid,
    ownerRole: record.ownerRole,
  });
  await backfillMissingOwnerRoles("assessmentGenerations", [record], resolvedOwnerRole);

  return normalizeAssessmentGenerationRecord(record, {
    resolvedOwnerRole,
  });
}

export async function getAssessmentGenerationForViewer(
  id: string,
  viewer: Pick<SessionUser, "uid" | "role">,
  options: {
    includeExpired?: boolean;
  } = {},
) {
  const generation = await getAssessmentGenerationById(id);
  if (!generation || !canViewOwnerOwnedRecord(generation.ownerUid, viewer)) {
    return null;
  }

  const lifecycle = getAssessmentStatus(generation);
  if (!options.includeExpired && lifecycle.status === "expired") {
    await purgeExpiredAssessmentGenerationRecord(generation);
    return null;
  }

  if (lifecycle.status === "expired") {
    await purgeExpiredAssessmentGenerationRecord(generation);
  }

  return generation;
}

export async function getAssessmentGenerationForOwner(
  id: string,
  ownerUid: string,
  options: {
    includeExpired?: boolean;
  } = {},
) {
  /* Regular preview/result/export/history routes must stay owner-only even when admins exist.
     Keep admin observation on separate code paths so platform oversight never piggybacks on
     the normal user artifact surfaces. */
  const generation = await getAssessmentGenerationById(id);
  if (!generation || generation.ownerUid !== ownerUid) {
    return null;
  }

  const lifecycle = getAssessmentStatus(generation);
  if (!options.includeExpired && lifecycle.status === "expired") {
    await purgeExpiredAssessmentGenerationRecord(generation);
    return null;
  }

  if (lifecycle.status === "expired") {
    await purgeExpiredAssessmentGenerationRecord(generation);
  }

  return generation;
}

export async function getAssessmentGenerationForAdminObservation(
  id: string,
  options: {
    includeExpired?: boolean;
  } = {},
) {
  /* ADMIN OBSERVATION LANE (Separate from User Routes):
     
     Design Principle: Admin oversight does NOT share code paths with user-facing routes.
     
     User-facing routes (/api/assessment/results/[id], /api/assessment/export/*):
     - Always check: session.uid === record.ownerUid
     - Return 404 if ownership doesn't match
     - Cannot be used by admins to inspect other users' files
     
     Admin observation lane (this function):
     - Intentionally NO ownership check
     - Retrieves ANY record regardless of owner
     - Reserved for explicitly admin-gated routes (when implemented)
     
     When to use each:
     1. NEVER use this function in `/api/assessment/results/[id]` et al (would leak cross-owner access)
     2. Use this ONLY in admin-only routes like `/api/admin/assessment/[id]` (if added)
     3. Always gatekeep with getAdminSessionUser() before calling this
     
     Current Phase 1 State:
     - This lane exists but is unused
     - Admin observability currently limited to activity log feed
     - Future Phase 2: Wire this into explicit admin inspection endpoints
     
     Example future usage:
       export async function GET /api/admin/assessment/[id] {
         const admin = await getAdminSessionUser();  // ← MUST check admin first
         if (!admin) return 401;
         const generation = await getAssessmentGenerationForAdminObservation(id);
         // admin can now inspect any assessment, download results, view metadata
       }
  */
  // This explicit admin lane exists so admin-safe observability can be implemented without
  // reopening the user-facing preview/result/export routes to cross-owner access.
  const generation = await getAssessmentGenerationById(id);
  if (!generation) {
    return null;
  }

  const lifecycle = getAssessmentStatus(generation);
  if (!options.includeExpired && lifecycle.status === "expired") {
    await purgeExpiredAssessmentGenerationRecord(generation);
    return null;
  }

  if (lifecycle.status === "expired") {
    await purgeExpiredAssessmentGenerationRecord(generation);
  }

  return generation;
}

type InfographicGenerationLike = Partial<InfographicGeneration> & {
  meta?: Partial<InfographicGeneration["meta"]> & {
    sourceDocument?:
      | Partial<NonNullable<InfographicGeneration["meta"]["sourceDocument"]>>
      | null;
  };
};

function normalizeInfographicText(value: unknown) {
  return String(value || "").trim();
}

function normalizeInfographicStyle(
  value: unknown,
): InfographicGeneration["meta"]["style"] {
  if (value === "academic" || value === "balanced" || value === "bold") {
    return value;
  }

  return "balanced";
}

function normalizeInfographicInputMode(
  value: unknown,
  hasSourceDocument: boolean,
): InfographicGeneration["meta"]["inputMode"] {
  if (value === "prompt-only" || value === "text-context") {
    return value;
  }

  return hasSourceDocument ? "text-context" : "prompt-only";
}

function normalizeInfographicProvider(
  value: unknown,
  fallback: InfographicGeneration["meta"]["provider"],
): InfographicGeneration["meta"]["provider"] {
  return value === "qwen" || value === "google" ? value : fallback;
}

function normalizeInfographicSourceDocument(
  value: unknown,
): InfographicGeneration["meta"]["sourceDocument"] {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as {
    id?: unknown;
    fileName?: unknown;
    status?: unknown;
  };
  const id = normalizeInfographicText(source.id);
  const fileName = normalizeInfographicText(source.fileName);
  const status =
    source.status === "received" ||
    source.status === "processing" ||
    source.status === "ready" ||
    source.status === "failed"
      ? source.status
      : null;

  if (!id || !fileName || !status) {
    return null;
  }

  return {
    id,
    fileName,
    status,
  };
}

function normalizeInfographicGenerationRecord(
  record: InfographicGenerationLike,
  options: {
    resolvedOwnerRole?: UserRole;
  } = {},
): InfographicGeneration {
  const fallbackTimestamp = new Date().toISOString();
  const createdAt = toSafeIsoTimestamp(record.createdAt, fallbackTimestamp);
  const updatedAt = toSafeIsoTimestamp(record.updatedAt ?? record.createdAt, createdAt);
  const model = getModelById(String(record.modelId || ""));
  const sourceDocument = normalizeInfographicSourceDocument(record.meta?.sourceDocument);
  const hasSourceDocument = Boolean(sourceDocument);
  const resolvedOwnerRole =
    normalizeStoredOwnerRole(record.ownerRole) ?? options.resolvedOwnerRole;

  const normalizedGeneration: InfographicGeneration = {
    id: normalizeInfographicText(record.id) || `infographic-${createdAt}`,
    ownerUid: normalizeInfographicText(record.ownerUid),
    topic: normalizeInfographicText(record.topic) || "Untitled infographic",
    modelId: model.id,
    imageSvg: String(record.imageSvg || ""),
    status: "ready",
    meta: {
      toolName: "infographic",
      style: normalizeInfographicStyle(record.meta?.style),
      provider: normalizeInfographicProvider(record.meta?.provider, model.provider),
      modelLabel: normalizeInfographicText(record.meta?.modelLabel) || model.label,
      inputMode: normalizeInfographicInputMode(record.meta?.inputMode, hasSourceDocument),
      sourceDocument,
      artifactType: "inline-svg",
    },
    createdAt,
    updatedAt,
  };

  if (resolvedOwnerRole) {
    normalizedGeneration.ownerRole = resolvedOwnerRole;
  }

  return normalizedGeneration;
}

export async function saveInfographicGeneration(record: InfographicGeneration) {
  const resolvedOwnerRole = await resolvePersistedOwnerRole({
    ownerUid: record.ownerUid,
    ownerRole: record.ownerRole,
  });
  const normalizedRecord = normalizeInfographicGenerationRecord(record, {
    resolvedOwnerRole,
  });

  if (shouldUseFirestore()) {
    await getZootopiaFirestore()
      .collection("infographicGenerations")
      .doc(normalizedRecord.id)
      .set(omitUndefinedOwnerRole(normalizedRecord), { merge: true });
  } else {
    getMemoryStore().infographics.set(normalizedRecord.id, normalizedRecord);
  }

  return normalizedRecord;
}

export async function listInfographicGenerationsForUser(ownerUid: string, limit = 20) {
  const resolvedOwnerRole = await resolvePersistedOwnerRole({ ownerUid });

  if (shouldUseFirestore()) {
    const snapshot = await getZootopiaFirestore()
      .collection("infographicGenerations")
      .where("ownerUid", "==", ownerUid)
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();

    const rawRecords = snapshot.docs.map((doc) => {
      const record = doc.data() as unknown as InfographicGenerationLike;
      return {
        ...record,
        id: normalizeInfographicText(record.id) || doc.id,
      };
    });

    await backfillMissingOwnerRoles(
      "infographicGenerations",
      rawRecords,
      resolvedOwnerRole,
    );

    return rawRecords.map((record) =>
      normalizeInfographicGenerationRecord(record, {
        resolvedOwnerRole,
      }),
    );
  }

  return [...getMemoryStore().infographics.values()]
    .filter((record) => record.ownerUid === ownerUid)
    .map((record) =>
      normalizeInfographicGenerationRecord(record, {
        resolvedOwnerRole,
      }),
    )
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, limit);
}

export async function getInfographicGenerationById(id: string) {
  if (shouldUseFirestore()) {
    const snapshot = await getZootopiaFirestore()
      .collection("infographicGenerations")
      .doc(id)
      .get();

    if (!snapshot.exists) {
      return null;
    }

    const rawRecord = snapshot.data() as unknown as InfographicGenerationLike;
    const normalizedRecord = {
      ...rawRecord,
      id: normalizeInfographicText(rawRecord.id) || snapshot.id,
    };
    const resolvedOwnerRole = await resolvePersistedOwnerRole({
      ownerUid: normalizedRecord.ownerUid ?? "",
      ownerRole: normalizedRecord.ownerRole,
    });
    await backfillMissingOwnerRoles(
      "infographicGenerations",
      [normalizedRecord],
      resolvedOwnerRole,
    );

    return normalizeInfographicGenerationRecord(normalizedRecord, {
      resolvedOwnerRole,
    });
  }

  const record = getMemoryStore().infographics.get(id);
  if (!record) {
    return null;
  }

  const resolvedOwnerRole = await resolvePersistedOwnerRole({
    ownerUid: record.ownerUid,
    ownerRole: record.ownerRole,
  });

  return normalizeInfographicGenerationRecord(record, {
    resolvedOwnerRole,
  });
}

export async function getInfographicGenerationForViewer(
  id: string,
  viewer: Pick<SessionUser, "uid" | "role">,
) {
  const generation = await getInfographicGenerationById(id);
  if (!generation || !canViewOwnerOwnedRecord(generation.ownerUid, viewer)) {
    return null;
  }

  return generation;
}

export async function getInfographicGenerationForOwner(
  id: string,
  ownerUid: string,
) {
  /* Keep user-facing infographic readback owner-only so admin observation can evolve on a
     separate path without turning the normal user endpoint into a cross-owner surface. */
  const generation = await getInfographicGenerationById(id);
  if (!generation || generation.ownerUid !== ownerUid) {
    return null;
  }

  return generation;
}

async function countCollection(collectionName: string) {
  if (shouldUseFirestore()) {
    const snapshot = await getZootopiaFirestore()
      .collection(collectionName)
      .limit(500)
      .get();

    return snapshot.size;
  }

  const store = getMemoryStore();
  switch (collectionName) {
    case "documents":
      return store.documents.size;
    case "assessmentGenerations":
      return store.assessments.size;
    case "infographicGenerations":
      return store.infographics.size;
    default:
      return 0;
  }
}

export async function getAdminOverviewData(
  preloadedUsers?: UserDocument[],
): Promise<AdminOverview> {
  const users = preloadedUsers ?? await listUsers();

  return {
    totalUsers: users.length,
    activeUsers: users.filter((user) => user.status === "active").length,
    totalDocuments: await countCollection("documents"),
    totalAssessmentGenerations: await countCollection("assessmentGenerations"),
    totalInfographicGenerations: await countCollection("infographicGenerations"),
  };
}
