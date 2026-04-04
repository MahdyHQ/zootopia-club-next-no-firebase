import "server-only";

import type {
  AdminOverview,
  AssessmentGeneration,
  DocumentRecord,
  InfographicGeneration,
  RequiredUserProfile,
  SessionUser,
  UserDocument,
  UserRole,
  UserStatus,
} from "@zootopia/shared-types";
import { evaluateProfileCompletion, toIsoTimestamp } from "@zootopia/shared-utils";
import type { UserRecord } from "firebase-admin/auth";
import { randomUUID } from "node:crypto";

import {
  hasAdminAccessFromClaims,
  isAllowlistedAdminEmail,
} from "@/lib/server/admin-auth";
import { deleteAssessmentArtifact } from "@/lib/server/assessment-artifact-storage";
import { normalizeAssessmentGenerationRecord } from "@/lib/server/assessment-records";
import { deleteDocumentBinaryFromStorage } from "@/lib/server/document-runtime";
import {
  getFirebaseAdminAuth,
  getFirebaseAdminFirestore,
  hasFirebaseAdminRuntime,
} from "@/lib/server/firebase-admin";
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

type MemoryStore = {
  users: Map<string, UserDocument>;
  documents: Map<string, DocumentRecord>;
  assessments: Map<string, AssessmentGeneration>;
  infographics: Map<string, InfographicGeneration>;
  adminLogs: AdminLogEntry[];
};

declare global {
  var __ZOOTOPIA_MEMORY_STORE__: MemoryStore | undefined;
}

function getMemoryStore(): MemoryStore {
  if (!globalThis.__ZOOTOPIA_MEMORY_STORE__) {
    globalThis.__ZOOTOPIA_MEMORY_STORE__ = {
      users: new Map(),
      documents: new Map(),
      assessments: new Map(),
      infographics: new Map(),
      adminLogs: [],
    };
  }

  return globalThis.__ZOOTOPIA_MEMORY_STORE__;
}

function shouldUseFirestore() {
  return hasFirebaseAdminRuntime();
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

function normalizeDocumentRecord(
  record: DocumentRecord,
  fallbackActiveId: string | null,
): DocumentRecord {
  const isActive = record.isActive === true || record.id === fallbackActiveId;
  const expiresAt = record.expiresAt ?? getRetentionExpiryTimestamp(record.createdAt);

  return {
    ...record,
    ownerRole: record.ownerRole ?? "user",
    isActive,
    supersededAt: isActive ? null : record.supersededAt ?? null,
    expiresAt,
  };
}

function normalizeDocumentRecordList(records: DocumentRecord[]) {
  const fallbackActiveId =
    records.find((record) => record.isActive === true)?.id ??
    records.find((record) => !record.supersededAt)?.id ??
    records[0]?.id ??
    null;

  return records.map((record) => normalizeDocumentRecord(record, fallbackActiveId));
}

function isDocumentExpired(record: Pick<DocumentRecord, "createdAt" | "expiresAt">) {
  return Date.now() >= Date.parse(record.expiresAt ?? getRetentionExpiryTimestamp(record.createdAt));
}

async function purgeExpiredDocumentRecord(record: DocumentRecord) {
  await deleteDocumentBinaryFromStorage(record);

  if (shouldUseFirestore()) {
    await getFirebaseAdminFirestore().collection("documents").doc(record.id).delete();
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
    await getFirebaseAdminFirestore()
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
    await getFirebaseAdminFirestore()
      .collection("documents")
      .doc(record.id)
      .set(record, { merge: true });
  } else {
    getMemoryStore().documents.set(record.id, record);
  }
}

async function markPreviousDocumentsInactive(input: {
  ownerUid: string;
  activeDocumentId: string;
  supersededAt: string;
}) {
  if (shouldUseFirestore()) {
    const snapshot = await getFirebaseAdminFirestore()
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

        const existing = documentSnapshot.data() as DocumentRecord;
        if (existing.isActive === false && existing.supersededAt) {
          return;
        }

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

    return;
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
  }
}

function resolveProfileState(input: {
  role: UserRole;
  fullName: string | null;
  universityCode: string | null;
  profileCompletedAt: string | null | undefined;
  now: string;
}) {
  const completion = evaluateProfileCompletion({
    role: input.role,
    fullName: input.fullName,
    universityCode: input.universityCode,
  });

  return {
    fullName: completion.normalizedFullName ?? input.fullName ?? null,
    universityCode:
      completion.normalizedUniversityCode ?? input.universityCode ?? null,
    profileCompleted: completion.profileCompleted,
    profileCompletedAt: completion.profileCompleted
      ? input.profileCompletedAt ?? input.now
      : null,
  };
}

function buildUserDocumentFromAuthRecord(
  authUser: UserRecord,
  existing: UserDocument | null,
) {
  const now = toIsoTimestamp(new Date());
  const role = getRoleFromAuthClaims({
    email: authUser.email ?? existing?.email ?? null,
    admin: authUser.customClaims?.admin,
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
    fullName: existing?.fullName ?? null,
    universityCode: existing?.universityCode ?? null,
    profileCompletedAt: existing?.profileCompletedAt,
    now,
  });

  return {
    uid: authUser.uid,
    email: authUser.email ?? existing?.email ?? null,
    displayName: authUser.displayName ?? existing?.displayName ?? null,
    photoURL: authUser.photoURL ?? existing?.photoURL ?? null,
    fullName: profileState.fullName,
    universityCode: profileState.universityCode,
    profileCompleted: profileState.profileCompleted,
    profileCompletedAt: profileState.profileCompletedAt,
    role,
    status:
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
  const users: UserRecord[] = [];
  let nextPageToken: string | undefined;

  do {
    const page = await getFirebaseAdminAuth().listUsers(1000, nextPageToken);
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

export async function getUserByUid(uid: string) {
  if (shouldUseFirestore()) {
    const snapshot = await getFirebaseAdminFirestore()
      .collection("users")
      .doc(uid)
      .get();

    if (!snapshot.exists) {
      try {
        // Admin user management must be able to act on real Firebase Auth accounts even before
        // those accounts have hydrated a Firestore user document through a normal sign-in flow.
        const authUser = await getFirebaseAdminAuth().getUser(uid);
        const hydratedUser = buildUserDocumentFromAuthRecord(authUser, null);
        await getFirebaseAdminFirestore()
          .collection("users")
          .doc(uid)
          .set(hydratedUser, { merge: true });
        return hydratedUser;
      } catch (error) {
        if (
          typeof error === "object" &&
          error &&
          "code" in error &&
          error.code === "auth/user-not-found"
        ) {
          return null;
        }

        throw error;
      }
    }

    return snapshot.data() as UserDocument;
  }

  return getMemoryStore().users.get(uid) ?? null;
}

export async function upsertUserFromAuth(input: {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role?: UserRole;
}) {
  const now = toIsoTimestamp(new Date());
  const existing = await getUserByUid(input.uid);
  const role = input.role ?? existing?.role ?? "user";
  const profileState = resolveProfileState({
    role,
    fullName: existing?.fullName ?? null,
    universityCode: existing?.universityCode ?? null,
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

  if (shouldUseFirestore()) {
    await getFirebaseAdminFirestore()
      .collection("users")
      .doc(input.uid)
      .set(nextUser, { merge: true });
  } else {
    getMemoryStore().users.set(input.uid, nextUser);
  }

  return nextUser;
}

export async function listUsers() {
  if (shouldUseFirestore()) {
    const [snapshot, authUsers] = await Promise.all([
      getFirebaseAdminFirestore().collection("users").get(),
      listAllFirebaseAuthUsers(),
    ]);
    const usersByUid = new Map<string, UserDocument>();

    for (const doc of snapshot.docs) {
      const user = doc.data() as UserDocument;
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
    profileCompletedAt: user.profileCompletedAt,
    now,
  });

  const nextUser: UserDocument = {
    ...user,
    role,
    fullName: profileState.fullName,
    universityCode: profileState.universityCode,
    profileCompleted: profileState.profileCompleted,
    profileCompletedAt: profileState.profileCompletedAt,
    updatedAt: now,
  };

  if (shouldUseFirestore()) {
    const auth = getFirebaseAdminAuth();
    const userRecord = await auth.getUser(uid);
    await auth.setCustomUserClaims(uid, {
      ...(userRecord.customClaims ?? {}),
      role,
      admin: role === "admin",
    });
    await auth.revokeRefreshTokens(uid);
    await getFirebaseAdminFirestore()
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
    await getFirebaseAdminAuth().updateUser(uid, {
      disabled: status === "suspended",
    });
    await getFirebaseAdminAuth().revokeRefreshTokens(uid);
    await getFirebaseAdminFirestore()
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
  profile: RequiredUserProfile,
) {
  const user = await getUserByUid(uid);
  if (!user) {
    throw new Error("USER_NOT_FOUND");
  }

  const now = toIsoTimestamp(new Date());
  const profileState = resolveProfileState({
    role: user.role,
    fullName: profile.fullName,
    universityCode: profile.universityCode,
    profileCompletedAt: user.profileCompletedAt,
    now,
  });

  const nextUser: UserDocument = {
    ...user,
    fullName: profileState.fullName,
    universityCode: profileState.universityCode,
    profileCompleted: profileState.profileCompleted,
    profileCompletedAt: profileState.profileCompletedAt,
    updatedAt: now,
  };

  if (shouldUseFirestore()) {
    await getFirebaseAdminFirestore()
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
      await getFirebaseAdminFirestore()
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
    const snapshot = await getFirebaseAdminFirestore()
      .collection("adminActivityLogs")
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => doc.data() as AdminLogEntry);
  }

  return getMemoryStore().adminLogs
    .slice()
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, limit);
}

export async function saveDocument(record: DocumentRecord) {
  const nextRecord: DocumentRecord = {
    ...record,
    ownerRole: record.ownerRole ?? "user",
    isActive: record.isActive !== false,
    supersededAt: record.isActive === false ? record.supersededAt ?? record.updatedAt : null,
    expiresAt: record.expiresAt ?? getRetentionExpiryTimestamp(record.createdAt),
  };

  await persistDocumentRecord(nextRecord);

  if (nextRecord.isActive) {
    await markPreviousDocumentsInactive({
      ownerUid: nextRecord.ownerUid,
      activeDocumentId: nextRecord.id,
      supersededAt: nextRecord.updatedAt,
    });
  }

  return nextRecord;
}

export async function listDocumentsForUser(ownerUid: string, limit = 20) {
  if (shouldUseFirestore()) {
    const snapshot = await getFirebaseAdminFirestore()
      .collection("documents")
      .where("ownerUid", "==", ownerUid)
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();

    const documents = normalizeDocumentRecordList(
      snapshot.docs.map((doc) => doc.data() as DocumentRecord),
    );
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

  const documents = normalizeDocumentRecordList(
    [...getMemoryStore().documents.values()]
      .filter((record) => record.ownerUid === ownerUid)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit),
  );

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
    const snapshot = await getFirebaseAdminFirestore()
      .collection("documents")
      .doc(id)
      .get();

    if (!snapshot.exists) {
      return null;
    }

    const document = snapshot.data() as DocumentRecord;
    const fallbackDocuments = await listDocumentsForUser(document.ownerUid, 10);
    const fallbackActiveId =
      fallbackDocuments.find((record) => record.isActive)?.id ?? null;

    const normalizedDocument = normalizeDocumentRecord(document, fallbackActiveId);
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

  const normalizedDocument = normalizeDocumentRecord(record, fallbackActiveId);
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
    const snapshot = await getFirebaseAdminFirestore()
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

    return nextDocument.data() as DocumentRecord;
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
    await getFirebaseAdminFirestore()
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

export async function saveAssessmentGeneration(record: AssessmentGeneration) {
  const normalizedRecord = normalizeAssessmentGenerationRecord(record);

  if (shouldUseFirestore()) {
    await getFirebaseAdminFirestore()
      .collection("assessmentGenerations")
      .doc(normalizedRecord.id)
      .set(normalizedRecord, { merge: true });
  } else {
    getMemoryStore().assessments.set(normalizedRecord.id, normalizedRecord);
  }

  return normalizedRecord;
}

export async function listAssessmentGenerationsForUser(ownerUid: string, limit = 20) {
  if (shouldUseFirestore()) {
    const snapshot = await getFirebaseAdminFirestore()
      .collection("assessmentGenerations")
      .where("ownerUid", "==", ownerUid)
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();

    const generations = snapshot.docs.map((doc) =>
      normalizeAssessmentGenerationRecord(doc.data() as AssessmentGeneration),
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

  const generations = [...getMemoryStore().assessments.values()]
    .filter((record) => record.ownerUid === ownerUid)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, limit)
    .map((record) => normalizeAssessmentGenerationRecord(record));

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
    const snapshot = await getFirebaseAdminFirestore()
      .collection("assessmentGenerations")
      .doc(id)
      .get();

    return snapshot.exists
      ? normalizeAssessmentGenerationRecord(snapshot.data() as AssessmentGeneration)
      : null;
  }

  const record = getMemoryStore().assessments.get(id);
  return record ? normalizeAssessmentGenerationRecord(record) : null;
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

export async function saveInfographicGeneration(record: InfographicGeneration) {
  if (shouldUseFirestore()) {
    await getFirebaseAdminFirestore()
      .collection("infographicGenerations")
      .doc(record.id)
      .set(record, { merge: true });
  } else {
    getMemoryStore().infographics.set(record.id, record);
  }

  return record;
}

export async function listInfographicGenerationsForUser(ownerUid: string, limit = 20) {
  if (shouldUseFirestore()) {
    const snapshot = await getFirebaseAdminFirestore()
      .collection("infographicGenerations")
      .where("ownerUid", "==", ownerUid)
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => doc.data() as InfographicGeneration);
  }

  return [...getMemoryStore().infographics.values()]
    .filter((record) => record.ownerUid === ownerUid)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, limit);
}

export async function getInfographicGenerationById(id: string) {
  if (shouldUseFirestore()) {
    const snapshot = await getFirebaseAdminFirestore()
      .collection("infographicGenerations")
      .doc(id)
      .get();

    return snapshot.exists ? (snapshot.data() as InfographicGeneration) : null;
  }

  return getMemoryStore().infographics.get(id) ?? null;
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

async function countCollection(collectionName: string) {
  if (shouldUseFirestore()) {
    const snapshot = await getFirebaseAdminFirestore()
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
