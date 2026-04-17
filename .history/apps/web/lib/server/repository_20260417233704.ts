import "server-only";

import type {
  AdminAssessmentCreditMutationBalanceSnapshot,
  AdminAssessmentCreditMutationInput,
  AdminAssessmentCreditMutationRecord,
  AdminAssessmentCreditState,
  AdminOverview,
  AdminUserDeletionSummary,
  AssessmentArtifactRecord,
  AssessmentCreditAccountRecord,
  AssessmentCreditGrantAdminView,
  AssessmentCreditGrantEffectiveStatus,
  AssessmentCreditGrantRecord,
  AssessmentPromptEntitlement,
  AssessmentDailyCreditsSummary,
  AssessmentGeneration,
  DocumentRecord,
  InfographicGeneration,
  SessionUser,
  StorageLayoutVersion,
  UpdateUserProfileInput,
  UserClientBestEffortNetworkMetadata,
  UserClientBestEffortScreenMetadata,
  UserClientBestEffortSignInMetadata,
  UserClientBestEffortUserAgentDataHints,
  UserClientBestEffortViewportMetadata,
  UserDocument,
  UserRole,
  UserServerObservedRequestGeoMetadata,
  UserServerObservedSignInMetadata,
  UserStatus,
} from "@zootopia/shared-types";
import {
  evaluateProfileCompletion,
  getPhoneNumberMetadata,
  normalizeUploadExtension,
  toIsoTimestamp,
  validateUserGender,
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
import {
  buildAssessmentCreditSummaryDiagnosticSnapshot,
  createAssessmentCreditTraceId,
  logAssessmentCreditDiagnostic,
} from "@/lib/server/assessment-credit-diagnostics";
import {
  deleteDocumentBinaryFromStorage,
  resolveUploadWorkspaceExpiryTimestamp,
} from "@/lib/server/document-runtime";
import { inferOwnerScopedStoragePathMetadata } from "@/lib/server/owner-scope";
import { getServerAuthAdmin } from "@/lib/server/server-auth";
import { hasSupabaseAdminRuntime } from "@/lib/server/supabase-admin";
import {
  getZootopiaPersistenceRuntimeState,
  getZootopiaDatabase,
  type PgTransaction,
} from "@/lib/server/zootopia-postgres-adapter";
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

type AssessmentCreditSqlExecutor = ReturnType<typeof getZootopiaDatabase>["sql"];

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

type AssessmentArtifactMetadataRecord = AssessmentArtifactRecord & {
  id: string;
  ownerUid: string;
  ownerRole?: UserRole;
  generationId: string;
  generationStatus: AssessmentGeneration["status"];
  generationCreatedAt: string;
  generationUpdatedAt: string;
  generationExpiresAt: string;
  artifactKey: string;
  updatedAt: string;
};

type UploadPreparationRecord = {
  id: string;
  ownerUid: string;
  ownerRole?: UserRole;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  storageDataClass?: "upload-source";
  storageOwnerUid?: string;
  storageLayoutVersion?: StorageLayoutVersion;
  status: "prepared";
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
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
  uploadPreparations: Map<string, UploadPreparationRecord>;
  assessments: Map<string, AssessmentGeneration>;
  assessmentArtifactMetadata: Map<string, AssessmentArtifactMetadataRecord>;
  assessmentGenerationIdempotency: Map<string, AssessmentGenerationIdempotencyRecord>;
  assessmentDailyCredits: Map<string, AssessmentDailyCreditLedgerDocument>;
  assessmentCreditAccounts: Map<string, AssessmentCreditAccountRecord>;
  assessmentCreditGrants: Map<string, AssessmentCreditGrantRecord>;
  assessmentCreditMutationHistory: Map<string, AdminAssessmentCreditMutationRecord>;
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
const UPLOAD_PREPARATION_COLLECTION = "uploadPreparations";
const ASSESSMENT_GENERATION_IDEMPOTENCY_COLLECTION = "assessmentGenerationIdempotency";
const ASSESSMENT_ARTIFACT_METADATA_COLLECTION = "assessmentArtifactMetadata";
const ASSESSMENT_GENERATION_IDEMPOTENCY_IN_PROGRESS_STALE_MS = 10 * 60 * 1000;
const ASSESSMENT_DAILY_CREDITS_COLLECTION = "assessmentDailyCredits";
const ASSESSMENT_CREDIT_ACCOUNTS_COLLECTION = "assessmentCreditAccounts";
const ASSESSMENT_CREDIT_GRANTS_COLLECTION = "assessmentCreditGrants";
const ASSESSMENT_CREDIT_MUTATION_HISTORY_COLLECTION = "assessmentCreditMutationHistory";
const ASSESSMENT_CREDIT_MUTATION_HISTORY_LIMIT = 40;
const ASSESSMENT_DAILY_CREDITS_EXHAUSTED_MESSAGE =
  "Assessment generation credits are currently exhausted. Daily and extra credits renew at the next reset window.";
const ASSESSMENT_ACCESS_DISABLED_MESSAGE =
  "Assessment generation is currently disabled for this account.";
const ASSESSMENT_CREDIT_MANUAL_BALANCE_MIN = 0;
const ASSESSMENT_CREDIT_MANUAL_BALANCE_MAX = 1_000_000;
const ASSESSMENT_CREDIT_GRANT_MIN = 1;
const ASSESSMENT_CREDIT_GRANT_MAX = 100_000;
const DEVICE_LABEL_MAX_LENGTH = 120;
const DEVICE_LABEL_SOURCE_MAX_LENGTH = 80;
const SIGNIN_METADATA_STRING_MAX_LENGTH = 512;
const SIGNIN_METADATA_USER_AGENT_MAX_LENGTH = 1024;
const SIGNIN_METADATA_IP_MAX_LENGTH = 120;

declare global {
  var __ZOOTOPIA_MEMORY_STORE__: MemoryStore | undefined;
  var __ZOOTOPIA_EXPIRED_UPLOAD_SWEEP_LAST_RUN_AT__: number | undefined;
  var __ZOOTOPIA_MEMORY_FALLBACK_WARNED__: boolean | undefined;
  var __ZOOTOPIA_DURABLE_PERSISTENCE_BLOCK_LOGGED__: boolean | undefined;
}

function getMemoryStore(): MemoryStore {
  if (!globalThis.__ZOOTOPIA_MEMORY_STORE__) {
    globalThis.__ZOOTOPIA_MEMORY_STORE__ = {
      users: new Map(),
      documents: new Map(),
      uploadPreparations: new Map(),
      assessments: new Map(),
      assessmentArtifactMetadata: new Map(),
      assessmentGenerationIdempotency: new Map(),
      assessmentDailyCredits: new Map(),
      assessmentCreditAccounts: new Map(),
      assessmentCreditGrants: new Map(),
      assessmentCreditMutationHistory: new Map(),
      infographics: new Map(),
      adminLogs: [],
    };
  }

  return globalThis.__ZOOTOPIA_MEMORY_STORE__;
}

/**
 * Determine whether to use the Supabase Postgres persistence layer.
 * Production defaults to fail-closed when durable persistence prerequisites are missing.
 * Development/test can still use the in-memory fallback for local degraded runtime.
 */
function shouldUseDatabase() {
  const runtimeState = getZootopiaPersistenceRuntimeState();
  if (runtimeState.usingPostgres) {
    return true;
  }

  if (runtimeState.requiresDurablePersistence) {
    const missingRequirements: string[] = [];
    if (!runtimeState.hasSupabaseAdminRuntime) {
      missingRequirements.push("supabase_admin_runtime");
    }
    if (!runtimeState.hasDatabaseUrl) {
      missingRequirements.push("supabase_database_url");
    }

    /* Isolation hardening: production must never silently degrade to process-local memory,
       because that breaks durable ownership guarantees and can fragment admin/user truth across instances. */
    if (!globalThis.__ZOOTOPIA_DURABLE_PERSISTENCE_BLOCK_LOGGED__) {
      globalThis.__ZOOTOPIA_DURABLE_PERSISTENCE_BLOCK_LOGGED__ = true;
      console.error("[repository-persistence] blocked in-memory fallback in production", {
        nodeEnv: process.env.NODE_ENV ?? "unknown",
        missingRequirements,
        overrideEnvKey: "ZOOTOPIA_ALLOW_PRODUCTION_MEMORY_FALLBACK",
      });
    }

    const error = new Error("ZOOTOPIA_DURABLE_PERSISTENCE_REQUIRED") as Error & {
      code: string;
      missingRequirements: string[];
    };
    error.code = "ZOOTOPIA_DURABLE_PERSISTENCE_REQUIRED";
    error.missingRequirements = missingRequirements;
    throw error;
  }

  if (!globalThis.__ZOOTOPIA_MEMORY_FALLBACK_WARNED__) {
    globalThis.__ZOOTOPIA_MEMORY_FALLBACK_WARNED__ = true;
    console.warn("[repository-persistence] using in-memory fallback", {
      nodeEnv: process.env.NODE_ENV ?? "unknown",
      hasSupabaseAdminRuntime: runtimeState.hasSupabaseAdminRuntime,
      hasDatabaseUrl: runtimeState.hasDatabaseUrl,
    });
  }

  return false;
}

function readStringClaim(claims: Record<string, unknown> | undefined, key: string) {
  const value = claims?.[key];
  return typeof value === "string" ? value : null;
}

function readBooleanClaim(claims: Record<string, unknown> | undefined, key: string) {
  const value = claims?.[key];
  return typeof value === "boolean" ? value : null;
}

function readNumberClaim(claims: Record<string, unknown> | undefined, key: string) {
  const value = claims?.[key];

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function readObjectClaim(claims: Record<string, unknown> | undefined, key: string) {
  const value = claims?.[key];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function normalizeDeviceMetadataString(
  value: string | null | undefined,
  maxLength: number,
) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, maxLength);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeMetadataString(value: unknown, maxLength = SIGNIN_METADATA_STRING_MAX_LENGTH) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, maxLength);
}

function normalizeMetadataStringArray(
  value: unknown,
  maxItems = 8,
  maxLength = 200,
) {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalized = value
    .map((entry) => normalizeMetadataString(entry, maxLength))
    .filter((entry): entry is string => entry !== null)
    .slice(0, maxItems);

  return normalized.length > 0 ? normalized : null;
}

function normalizeMetadataNumber(
  value: unknown,
  options: {
    min?: number;
    max?: number;
    precision?: number;
  } = {},
) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : Number.NaN;

  if (!Number.isFinite(parsed)) {
    return null;
  }

  if (typeof options.min === "number" && parsed < options.min) {
    return null;
  }

  if (typeof options.max === "number" && parsed > options.max) {
    return null;
  }

  if (typeof options.precision === "number") {
    return Number(parsed.toFixed(options.precision));
  }

  return parsed;
}

function normalizeMetadataBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function normalizeMetadataIsoTimestamp(value: unknown, fallbackValue: string) {
  if (typeof value !== "string") {
    return fallbackValue;
  }

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return fallbackValue;
  }

  return new Date(parsed).toISOString();
}

function sanitizeUserAgentDataHints(
  value: unknown,
): UserClientBestEffortUserAgentDataHints | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const hints: UserClientBestEffortUserAgentDataHints = {
    brands: normalizeMetadataStringArray(value.brands, 8, 200),
    mobile: normalizeMetadataBoolean(value.mobile),
    platform: normalizeMetadataString(value.platform, 120),
    architecture: normalizeMetadataString(value.architecture, 64),
    bitness: normalizeMetadataString(value.bitness, 32),
    model: normalizeMetadataString(value.model, 120),
    platformVersion: normalizeMetadataString(value.platformVersion, 64),
    uaFullVersion: normalizeMetadataString(value.uaFullVersion, 64),
    wow64: normalizeMetadataBoolean(value.wow64),
    fullVersionList: normalizeMetadataStringArray(value.fullVersionList, 12, 200),
  };

  const hasValue = Boolean(
    hints.brands
    || typeof hints.mobile === "boolean"
    || hints.platform
    || hints.architecture
    || hints.bitness
    || hints.model
    || hints.platformVersion
    || hints.uaFullVersion
    || typeof hints.wow64 === "boolean"
    || hints.fullVersionList,
  );

  return hasValue ? hints : null;
}

function sanitizeScreenMetadata(value: unknown): UserClientBestEffortScreenMetadata | null {
  if (!isPlainObject(value)) {
    return null;
  }

  return {
    width: normalizeMetadataNumber(value.width, { min: 0, max: 20_000 }),
    height: normalizeMetadataNumber(value.height, { min: 0, max: 20_000 }),
    pixelRatio: normalizeMetadataNumber(value.pixelRatio, { min: 0, max: 20, precision: 2 }),
    colorDepth: normalizeMetadataNumber(value.colorDepth, { min: 0, max: 64 }),
  };
}

function sanitizeViewportMetadata(value: unknown): UserClientBestEffortViewportMetadata | null {
  if (!isPlainObject(value)) {
    return null;
  }

  return {
    width: normalizeMetadataNumber(value.width, { min: 0, max: 20_000 }),
    height: normalizeMetadataNumber(value.height, { min: 0, max: 20_000 }),
  };
}

function sanitizeNetworkMetadata(value: unknown): UserClientBestEffortNetworkMetadata | null {
  if (!isPlainObject(value)) {
    return null;
  }

  return {
    effectiveType: normalizeMetadataString(value.effectiveType, 32),
    downlinkMbps: normalizeMetadataNumber(value.downlinkMbps, {
      min: 0,
      max: 10_000,
      precision: 2,
    }),
    rttMs: normalizeMetadataNumber(value.rttMs, { min: 0, max: 60_000 }),
    saveData: normalizeMetadataBoolean(value.saveData),
  };
}

function sanitizeClientBestEffortSignInMetadata(
  value: unknown,
  fallbackCapturedAt: string,
): UserClientBestEffortSignInMetadata | null {
  if (!isPlainObject(value)) {
    return null;
  }

  return {
    nonAuthoritative: true,
    capturedAt: normalizeMetadataIsoTimestamp(value.capturedAt, fallbackCapturedAt),
    userAgent: normalizeMetadataString(value.userAgent, SIGNIN_METADATA_USER_AGENT_MAX_LENGTH),
    browser: normalizeMetadataString(value.browser, 120),
    operatingSystem: normalizeMetadataString(value.operatingSystem, 120),
    platform: normalizeMetadataString(value.platform, 120),
    language: normalizeMetadataString(value.language, 64),
    languages: normalizeMetadataStringArray(value.languages, 8, 64),
    timezone: normalizeMetadataString(value.timezone, 120),
    maxTouchPoints: normalizeMetadataNumber(value.maxTouchPoints, { min: 0, max: 32 }),
    touchCapable: normalizeMetadataBoolean(value.touchCapable),
    deviceMemoryGb: normalizeMetadataNumber(value.deviceMemoryGb, {
      min: 0,
      max: 1024,
      precision: 2,
    }),
    hardwareConcurrency: normalizeMetadataNumber(value.hardwareConcurrency, {
      min: 0,
      max: 1024,
    }),
    userAgentData: sanitizeUserAgentDataHints(value.userAgentData),
    screen: sanitizeScreenMetadata(value.screen),
    viewport: sanitizeViewportMetadata(value.viewport),
    network: sanitizeNetworkMetadata(value.network),
    approximateDeviceLabel: normalizeMetadataString(value.approximateDeviceLabel, DEVICE_LABEL_MAX_LENGTH),
    approximateDeviceLabelSource: normalizeMetadataString(
      value.approximateDeviceLabelSource,
      DEVICE_LABEL_SOURCE_MAX_LENGTH,
    ),
    approximateDeviceLabelConfidence: normalizeMetadataNumber(
      value.approximateDeviceLabelConfidence,
      {
        min: 0,
        max: 1,
        precision: 2,
      },
    ),
  };
}

function sanitizeRequestGeoMetadata(value: unknown): UserServerObservedRequestGeoMetadata | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const normalized: UserServerObservedRequestGeoMetadata = {
    source: normalizeMetadataString(value.source, 64),
    countryCode: normalizeMetadataString(value.countryCode, 16),
    region: normalizeMetadataString(value.region, 64),
    city: normalizeMetadataString(value.city, 128),
    latitude: normalizeMetadataNumber(value.latitude, {
      min: -90,
      max: 90,
      precision: 6,
    }),
    longitude: normalizeMetadataNumber(value.longitude, {
      min: -180,
      max: 180,
      precision: 6,
    }),
  };

  const hasValue = Boolean(
    normalized.source
    || normalized.countryCode
    || normalized.region
    || normalized.city
    || typeof normalized.latitude === "number"
    || typeof normalized.longitude === "number",
  );

  return hasValue ? normalized : null;
}

function sanitizeServerObservedSignInMetadata(
  value: unknown,
  fallbackObservedAt: string,
): UserServerObservedSignInMetadata | null {
  if (!isPlainObject(value)) {
    return null;
  }

  return {
    nonAuthoritative: true,
    observedAt: normalizeMetadataIsoTimestamp(value.observedAt, fallbackObservedAt),
    publicIp: normalizeMetadataString(value.publicIp, SIGNIN_METADATA_IP_MAX_LENGTH),
    forwardedIpChain: normalizeMetadataStringArray(value.forwardedIpChain, 12, SIGNIN_METADATA_IP_MAX_LENGTH),
    acceptLanguage: normalizeMetadataString(value.acceptLanguage, 256),
    requestGeo: sanitizeRequestGeoMetadata(value.requestGeo),
  };
}

function normalizeDeviceLabelConfidence(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  if (value < 0 || value > 1) {
    return null;
  }

  return Math.round(value * 100) / 100;
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
  | "serverObservedSignInMetadata"
  | "clientBestEffortSignInMetadata"
  | "deviceLabel"
  | "deviceLabelSource"
  | "deviceLabelConfidence"
  | "fullName"
  | "universityCode"
  | "phoneNumber"
  | "phoneCountryIso2"
  | "phoneCountryCallingCode"
  | "gender"
  | "nationality"
  | "profileCompleted"
  | "profileCompletedAt"
>, options: {
  includeObservabilityMetadata?: boolean;
} = {}) {
  const includeObservabilityMetadata = options.includeObservabilityMetadata !== false;

  const baseClaims = {
    admin: user.role === "admin",
    role: user.role,
    zc_status: user.status,
    zc_full_name: user.fullName,
    zc_university_code: user.universityCode,
    zc_phone_number: user.phoneNumber,
    zc_phone_country_iso2: user.phoneCountryIso2,
    zc_phone_country_calling_code: user.phoneCountryCallingCode,
    zc_gender: user.gender,
    zc_nationality: user.nationality,
    zc_profile_completed: user.profileCompleted,
    zc_profile_completed_at: user.profileCompletedAt,
  } satisfies Record<string, unknown>;

  if (!includeObservabilityMetadata) {
    return baseClaims;
  }

  return {
    ...baseClaims,
    zc_server_observed_signin_metadata: user.serverObservedSignInMetadata,
    zc_client_best_effort_signin_metadata: user.clientBestEffortSignInMetadata,
    zc_device_label: user.deviceLabel,
    zc_device_label_source: user.deviceLabelSource,
    zc_device_label_confidence: user.deviceLabelConfidence,
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
    const currentClaims = userRecord.customClaims ?? {};
    const hasObservabilityMetadata = Boolean(
      user.serverObservedSignInMetadata
      || user.clientBestEffortSignInMetadata
      || user.deviceLabel
      || user.deviceLabelSource
      || typeof user.deviceLabelConfidence === "number",
    );

    try {
      await auth.setCustomUserClaims(user.uid, {
        ...currentClaims,
        ...buildAuthCriticalClaimsFromUser(user, {
          includeObservabilityMetadata: true,
        }),
      });
    } catch (observabilityWriteError) {
      if (!hasObservabilityMetadata) {
        throw observabilityWriteError;
      }

      /* Observability metadata is explicitly non-authoritative: if claim size/shape limits
         reject it, persist only auth-critical claims so sign-in and onboarding flows never fail. */
      await auth.setCustomUserClaims(user.uid, {
        ...currentClaims,
        ...buildAuthCriticalClaimsFromUser(user, {
          includeObservabilityMetadata: false,
        }),
      });
    }

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

/* Durable persistence adapters reject undefined fields, but unresolved legacy ownerRole values
  must stay intentionally unset until they can be inferred safely. Keep this write guard narrow
  so we preserve record truth instead of defaulting ambiguous metadata into the wrong role. */
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
  if (shouldUseDatabase()) {
    await getZootopiaDatabase()
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
  a temporary metadata repair never blocks the user-facing read path if the durable store is busy. */
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
  const normalizedExtensionSource =
    typeof record.fileExtension === "string" && record.fileExtension.trim().length > 0
      ? record.fileExtension
      : normalizeUploadExtension(record.fileName);
  const normalizedFileExtension = normalizedExtensionSource
    .trim()
    .toLowerCase()
    .replace(/^\.+/, "");
  const safeFileExtension = /^[a-z0-9]{1,16}$/.test(normalizedFileExtension)
    ? normalizedFileExtension
    : undefined;
  const normalizedContentSha256 =
    typeof record.contentSha256 === "string" && /^[a-f0-9]{64}$/i.test(record.contentSha256)
      ? record.contentSha256.toLowerCase()
      : undefined;
  const isActive = record.isActive === true || record.id === fallbackActiveId;
  // getRetentionExpiryTimestamp now returns string | null (env-driven retention).
  // Fall back to undefined when null so the DocumentRecord type stays consistent.
  const computedExpiry = getRetentionExpiryTimestamp(record.createdAt, "uploads");
  const expiresAt = record.expiresAt ?? (computedExpiry ?? undefined);
  const storageMetadata = record.storagePath
    ? inferOwnerScopedStoragePathMetadata({
        storagePath: record.storagePath,
        ownerUid: record.ownerUid,
        allowedNamespaces: ["documents"],
      })
    : null;

  return {
    ...record,
    ownerRole: normalizeStoredOwnerRole(record.ownerRole) ?? resolvedOwnerRole,
    fileExtension: safeFileExtension,
    contentSha256: normalizedContentSha256,
    sourceBinaryRetained: record.sourceBinaryRetained ?? Boolean(record.storagePath),
    storageDataClass:
      storageMetadata?.storageDataClass === "upload-source"
        ? "upload-source"
        : (record.storageDataClass ?? undefined),
    storageOwnerUid: storageMetadata?.ownerUid ?? record.storageOwnerUid,
    storageLayoutVersion: storageMetadata?.storageLayoutVersion ?? record.storageLayoutVersion,
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
  const computedExpiry = getRetentionExpiryTimestamp(record.createdAt, "uploads");
  // When mode is "none", computedExpiry is null → never expired.
  if (!computedExpiry) return false;
  const expiryMs = Date.parse(record.expiresAt ?? computedExpiry);
  if (!Number.isFinite(expiryMs)) return false;
  return Date.now() >= expiryMs;
}

async function purgeExpiredDocumentRecord(record: DocumentRecord) {
  await deleteDocumentBinaryFromStorage(record);

  if (shouldUseDatabase()) {
    await getZootopiaDatabase().collection("documents").doc(record.id).delete();
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
  const computedExpiry = getRetentionExpiryTimestamp(record.createdAt, "uploads");
  return normalizeDocumentRecord(
    {
      ...record,
      expiresAt: record.expiresAt ?? (computedExpiry ?? undefined),
    },
    record.isActive === true ? record.id : null,
    resolvedOwnerRole,
  );
}

function normalizeUploadPreparationRecord(
  record: UploadPreparationRecord,
  resolvedOwnerRole?: UserRole,
): UploadPreparationRecord {
  const expiresAt =
    record.expiresAt
    ?? resolveUploadWorkspaceExpiryTimestamp({
      createdAt: record.createdAt,
    });
  const storageMetadata = inferOwnerScopedStoragePathMetadata({
    storagePath: record.storagePath,
    ownerUid: record.ownerUid,
    allowedNamespaces: ["documents"],
  });

  return {
    ...record,
    ownerRole: normalizeStoredOwnerRole(record.ownerRole) ?? resolvedOwnerRole,
    storageDataClass:
      storageMetadata?.storageDataClass === "upload-source"
        ? "upload-source"
        : record.storageDataClass,
    storageOwnerUid: storageMetadata?.ownerUid ?? record.storageOwnerUid,
    storageLayoutVersion: storageMetadata?.storageLayoutVersion ?? record.storageLayoutVersion,
    status: "prepared",
    expiresAt,
  };
}

function isUploadPreparationExpired(
  record: Pick<UploadPreparationRecord, "createdAt" | "expiresAt">,
) {
  const computedExpiry = getRetentionExpiryTimestamp(record.createdAt, "uploads");
  if (!computedExpiry) {
    return false;
  }

  const expiryMs = Date.parse(record.expiresAt ?? computedExpiry);
  if (!Number.isFinite(expiryMs)) {
    return false;
  }

  return Date.now() >= expiryMs;
}

async function persistUploadPreparationRecord(record: UploadPreparationRecord) {
  if (shouldUseDatabase()) {
    await getZootopiaDatabase()
      .collection(UPLOAD_PREPARATION_COLLECTION)
      .doc(record.id)
      .set(omitUndefinedOwnerRole(record), { merge: true });
    return;
  }

  getMemoryStore().uploadPreparations.set(record.id, record);
}

async function purgeExpiredUploadPreparationRecord(record: UploadPreparationRecord) {
  const finalizedDocument = await getDocumentByIdForOwner(record.id, record.ownerUid);

  /* Direct signed uploads can persist a binary before any document row exists. This cleanup path
     owns those pre-finalize objects so abandoned prepare/upload attempts do not leak owner-scoped
     files in Storage after the workspace/session retention window closes. */
  if (!finalizedDocument || finalizedDocument.storagePath !== record.storagePath) {
    await deleteDocumentBinaryFromStorage(record);
  }

  if (shouldUseDatabase()) {
    await getZootopiaDatabase()
      .collection(UPLOAD_PREPARATION_COLLECTION)
      .doc(record.id)
      .delete();
  } else {
    getMemoryStore().uploadPreparations.delete(record.id);
  }

  await appendAdminLog({
    actorUid: "system",
    ownerUid: record.ownerUid,
    ownerRole: record.ownerRole,
    action: "upload-preparation-expired-cleanup",
    resourceType: "uploadPreparation",
    resourceId: record.id,
    metadata: {
      fileName: record.fileName,
      finalizedDocumentFound: Boolean(finalizedDocument),
    },
  });
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

  let documentCandidates: DocumentRecord[] = [];
  let uploadPreparationCandidates: UploadPreparationRecord[] = [];

  if (shouldUseDatabase()) {
    const documentSnapshot = await getZootopiaDatabase()
      .collection("documents")
      .where("expiresAt", "<=", runAt)
      .orderBy("expiresAt", "asc")
      .limit(EXPIRED_UPLOAD_SWEEP_BATCH_LIMIT)
      .get();

    documentCandidates = documentSnapshot.docs.map((documentRecordSnapshot) => {
      const record = documentRecordSnapshot.data() as unknown as DocumentRecord;
      const normalizedRecord: DocumentRecord = {
        ...record,
        id: record.id || documentRecordSnapshot.id,
      };

      return normalizeDocumentCleanupCandidate(
        normalizedRecord,
        normalizeStoredOwnerRole(record.ownerRole),
      );
    });

    const uploadPreparationSnapshot = await getZootopiaDatabase()
      .collection(UPLOAD_PREPARATION_COLLECTION)
      .where("expiresAt", "<=", runAt)
      .orderBy("expiresAt", "asc")
      .limit(EXPIRED_UPLOAD_SWEEP_BATCH_LIMIT)
      .get();

    uploadPreparationCandidates = uploadPreparationSnapshot.docs.map((preparationSnapshot) => {
      const record = preparationSnapshot.data() as unknown as UploadPreparationRecord;
      const normalizedRecord: UploadPreparationRecord = {
        ...record,
        id: record.id || preparationSnapshot.id,
      };

      return normalizeUploadPreparationRecord(
        normalizedRecord,
        normalizeStoredOwnerRole(record.ownerRole),
      );
    });
  } else {
    documentCandidates = [...getMemoryStore().documents.values()]
      .map((record) =>
        normalizeDocumentCleanupCandidate(
          record,
          normalizeStoredOwnerRole(record.ownerRole),
        ),
      )
      .filter((record) => isDocumentExpired(record))
      .slice(0, EXPIRED_UPLOAD_SWEEP_BATCH_LIMIT);

    uploadPreparationCandidates = [...getMemoryStore().uploadPreparations.values()]
      .map((record) =>
        normalizeUploadPreparationRecord(
          record,
          normalizeStoredOwnerRole(record.ownerRole),
        ),
      )
      .filter((record) => isUploadPreparationExpired(record))
      .slice(0, EXPIRED_UPLOAD_SWEEP_BATCH_LIMIT);
  }

  let deletedCount = 0;
  for (const candidate of documentCandidates) {
    if (!isDocumentExpired(candidate)) {
      continue;
    }

    await purgeExpiredDocumentRecord(candidate);
    deletedCount += 1;
  }

  for (const candidate of uploadPreparationCandidates) {
    if (!isUploadPreparationExpired(candidate)) {
      continue;
    }

    await purgeExpiredUploadPreparationRecord(candidate);
    deletedCount += 1;
  }

  return {
    forced,
    skipped: false,
    runAt,
    scannedCount: documentCandidates.length + uploadPreparationCandidates.length,
    deletedCount,
  };
}

/* Session termination must clear the owner's temporary upload workspace immediately so source
   binaries do not outlive the authenticated session boundary. Assessment result records/artifacts
   are intentionally preserved under their existing retention policy and are not touched here. */
export async function clearUploadWorkspaceForOwner(ownerUid: string) {
  const [records, uploadPreparations] = await Promise.all([
    listRawDocumentsForOwner(ownerUid),
    listRawUploadPreparationsForOwner(ownerUid),
  ]);
  const normalizedRecords = normalizeDocumentRecordList(records);
  const normalizedUploadPreparations = uploadPreparations.map((record) =>
    normalizeUploadPreparationRecord(record),
  );

  await Promise.all([
    ...normalizedRecords.map((record) => deleteDocumentBinaryFromStorage(record)),
    ...normalizedUploadPreparations.map((record) => deleteDocumentBinaryFromStorage(record)),
  ]);

  if (shouldUseDatabase()) {
    await Promise.all(
      [
        ...normalizedRecords.map((record) =>
          getZootopiaDatabase().collection("documents").doc(record.id).delete(),
        ),
        ...normalizedUploadPreparations.map((record) =>
          getZootopiaDatabase()
            .collection(UPLOAD_PREPARATION_COLLECTION)
            .doc(record.id)
            .delete(),
        ),
      ],
    );
  } else {
    const store = getMemoryStore();
    for (const record of normalizedRecords) {
      store.documents.delete(record.id);
    }

    for (const record of normalizedUploadPreparations) {
      store.uploadPreparations.delete(record.id);
    }
  }

  return {
    ownerUid,
    clearedDocumentCount: normalizedRecords.length,
    clearedPreparedUploadCount: normalizedUploadPreparations.length,
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

function buildAssessmentArtifactMetadataRecordId(input: {
  generationId: string;
  artifactKey: string;
}) {
  return `${input.generationId}::${input.artifactKey}`;
}

function buildAssessmentArtifactMetadataRecords(
  generation: AssessmentGeneration,
): AssessmentArtifactMetadataRecord[] {
  return Object.values(generation.artifacts ?? {}).map((artifact) => ({
    ...artifact,
    id: buildAssessmentArtifactMetadataRecordId({
      generationId: generation.id,
      artifactKey: artifact.key,
    }),
    ownerUid: generation.ownerUid,
    ownerRole: generation.ownerRole,
    generationId: generation.id,
    generationStatus: generation.status,
    generationCreatedAt: generation.createdAt,
    generationUpdatedAt: generation.updatedAt,
    generationExpiresAt: generation.expiresAt,
    artifactKey: artifact.key,
    updatedAt: generation.updatedAt,
  }));
}

/* Assessment artifact metadata is intentionally duplicated into a dedicated collection so
   retention/admin/reporting queries can filter by owner/kind/expiry without scanning dynamic
   `artifacts` map keys inside generation blobs. Keep this in lockstep with generation writes. */
async function syncAssessmentArtifactMetadataForGeneration(input: {
  generation: AssessmentGeneration;
  transaction?: PgTransaction;
}) {
  const nextRecords = buildAssessmentArtifactMetadataRecords(input.generation);

  if (shouldUseDatabase()) {
    const database = getZootopiaDatabase();
    const metadataCollection = database.collection(ASSESSMENT_ARTIFACT_METADATA_COLLECTION);
    const existingQuery = metadataCollection
      .where("generationId", "==", input.generation.id)
      .limit(400);
    const existingSnapshot = input.transaction
      ? await input.transaction.get(existingQuery)
      : await existingQuery.get();
    const staleIds = new Set(existingSnapshot.docs.map((doc) => doc.id));

    if (input.transaction) {
      // Keep transaction writes sequential so finalization fails deterministically on the first
      // bad metadata mutation instead of leaving floating write promises inside one commit scope.
      for (const record of nextRecords) {
        const recordRef = metadataCollection.doc(record.id);
        await input.transaction.set(recordRef, omitUndefinedOwnerRole(record), {
          merge: true,
        });
        staleIds.delete(record.id);
      }

      for (const staleId of staleIds) {
        const staleRef = metadataCollection.doc(staleId);
        await input.transaction.delete(staleRef);
      }

      return;
    }

    const writes: Promise<void>[] = [];

    for (const record of nextRecords) {
      const recordRef = metadataCollection.doc(record.id);
      writes.push(recordRef.set(omitUndefinedOwnerRole(record), { merge: true }));
      staleIds.delete(record.id);
    }

    for (const staleId of staleIds) {
      const staleRef = metadataCollection.doc(staleId);
      writes.push(staleRef.delete());
    }

    await Promise.all(writes);
    return;
  }

  const store = getMemoryStore();
  for (const [recordId, record] of store.assessmentArtifactMetadata.entries()) {
    if (record.generationId === input.generation.id) {
      store.assessmentArtifactMetadata.delete(recordId);
    }
  }

  for (const record of nextRecords) {
    store.assessmentArtifactMetadata.set(record.id, record);
  }
}

async function deleteAssessmentArtifactMetadataForGeneration(input: {
  generationId: string;
  transaction?: PgTransaction;
}) {
  if (shouldUseDatabase()) {
    const database = getZootopiaDatabase();
    const metadataCollection = database.collection(ASSESSMENT_ARTIFACT_METADATA_COLLECTION);
    const existingQuery = metadataCollection
      .where("generationId", "==", input.generationId)
      .limit(400);
    const snapshot = input.transaction
      ? await input.transaction.get(existingQuery)
      : await existingQuery.get();

    if (snapshot.docs.length === 0) {
      return;
    }

    if (input.transaction) {
      for (const doc of snapshot.docs) {
        const docRef = metadataCollection.doc(doc.id);
        await input.transaction.delete(docRef);
      }
      return;
    }

    const deletions = snapshot.docs.map((doc) => {
      const docRef = metadataCollection.doc(doc.id);
      return docRef.delete();
    });
    await Promise.all(deletions);
    return;
  }

  const store = getMemoryStore();
  for (const [recordId, record] of store.assessmentArtifactMetadata.entries()) {
    if (record.generationId === input.generationId) {
      store.assessmentArtifactMetadata.delete(recordId);
    }
  }
}

async function purgeExpiredAssessmentGenerationRecord(record: AssessmentGeneration) {
  await purgeExpiredAssessmentArtifacts(record);

  if (shouldUseDatabase()) {
    await Promise.all([
      getZootopiaDatabase()
        .collection("assessmentGenerations")
        .doc(record.id)
        .delete(),
      deleteAssessmentArtifactMetadataForGeneration({
        generationId: record.id,
      }),
    ]);
  } else {
    getMemoryStore().assessments.delete(record.id);
    await deleteAssessmentArtifactMetadataForGeneration({
      generationId: record.id,
    });
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
  if (shouldUseDatabase()) {
    await getZootopiaDatabase()
      .collection("documents")
      .doc(record.id)
      .set(omitUndefinedOwnerRole(record), { merge: true });
  } else {
    getMemoryStore().documents.set(record.id, record);
  }
}

export async function saveUploadPreparation(record: UploadPreparationRecord) {
  const resolvedOwnerRole = await resolvePersistedOwnerRole({
    ownerUid: record.ownerUid,
    ownerRole: record.ownerRole,
  });
  const nextRecord = normalizeUploadPreparationRecord(
    {
      ...record,
      ownerRole: resolvedOwnerRole,
      updatedAt: record.updatedAt || record.createdAt,
    },
    resolvedOwnerRole,
  );

  await persistUploadPreparationRecord(nextRecord);
  return nextRecord;
}

async function markPreviousDocumentsInactive(input: {
  ownerUid: string;
  activeDocumentId: string;
  supersededAt: string;
}) {
  const supersededDocuments: DocumentRecord[] = [];

  if (shouldUseDatabase()) {
    const snapshot = await getZootopiaDatabase()
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
              sourceBinaryRetained: false,
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
            sourceBinaryRetained: false,
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
          sourceBinaryRetained: false,
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
  gender: string | null;
  nationality: string | null;
  profileCompletedAt: string | null | undefined;
  now: string;
}) {
  const genderValidation = validateUserGender(String(input.gender || ""));
  const completion = evaluateProfileCompletion({
    role: input.role,
    fullName: input.fullName,
    universityCode: input.universityCode,
    phoneNumber: input.phoneNumber,
    gender: input.gender,
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
    gender: genderValidation.ok ? genderValidation.value : null,
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
    gender:
      existing?.gender
      ?? readStringClaim(customClaims, "zc_gender")
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
  const resolvedServerObservedSignInMetadata = sanitizeServerObservedSignInMetadata(
    existing?.serverObservedSignInMetadata
    ?? readObjectClaim(customClaims, "zc_server_observed_signin_metadata")
    ?? null,
    now,
  );
  const resolvedClientBestEffortSignInMetadata = sanitizeClientBestEffortSignInMetadata(
    existing?.clientBestEffortSignInMetadata
    ?? readObjectClaim(customClaims, "zc_client_best_effort_signin_metadata")
    ?? null,
    now,
  );
  const resolvedDeviceLabel = normalizeDeviceMetadataString(
    existing?.deviceLabel ?? readStringClaim(customClaims, "zc_device_label") ?? null,
    DEVICE_LABEL_MAX_LENGTH,
  );
  const resolvedDeviceLabelSource = resolvedDeviceLabel
    ? normalizeDeviceMetadataString(
      existing?.deviceLabelSource
      ?? readStringClaim(customClaims, "zc_device_label_source")
      ?? null,
      DEVICE_LABEL_SOURCE_MAX_LENGTH,
    )
    : null;
  const resolvedDeviceLabelConfidence = resolvedDeviceLabel
    ? normalizeDeviceLabelConfidence(
      existing?.deviceLabelConfidence
      ?? readNumberClaim(customClaims, "zc_device_label_confidence")
      ?? null,
    )
    : null;
  const statusFromClaims = readStatusClaim(customClaims);

  return {
    uid: authUser.uid,
    email: authUser.email ?? existing?.email ?? null,
    displayName: authUser.displayName ?? existing?.displayName ?? null,
    photoURL: authUser.photoURL ?? existing?.photoURL ?? null,
    serverObservedSignInMetadata: resolvedServerObservedSignInMetadata,
    clientBestEffortSignInMetadata: resolvedClientBestEffortSignInMetadata,
    deviceLabel: resolvedDeviceLabel,
    deviceLabelSource: resolvedDeviceLabelSource,
    deviceLabelConfidence: resolvedDeviceLabelConfidence,
    fullName: profileState.fullName,
    universityCode: profileState.universityCode,
    phoneNumber: profileState.phoneNumber,
    phoneCountryIso2: profileState.phoneCountryIso2,
    phoneCountryCallingCode: profileState.phoneCountryCallingCode,
    gender: profileState.gender,
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

/**
 * List all Supabase Auth users with pagination.
 * Uses the server auth adapter to enumerate users for admin/list operations.
 */
async function listAllAuthUsers() {
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
  serverObservedSignInMetadata?: unknown;
  clientBestEffortSignInMetadata?: unknown;
  deviceLabel?: string | null;
  deviceLabelSource?: string | null;
  deviceLabelConfidence?: number | null;
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
    gender: existing?.gender ?? null,
    nationality: existing?.nationality ?? null,
    profileCompletedAt: existing?.profileCompletedAt,
    now,
  });
  const nextServerObservedSignInMetadata = sanitizeServerObservedSignInMetadata(
    input.serverObservedSignInMetadata ?? existing?.serverObservedSignInMetadata ?? null,
    now,
  );
  const nextClientBestEffortSignInMetadata = sanitizeClientBestEffortSignInMetadata(
    input.clientBestEffortSignInMetadata ?? existing?.clientBestEffortSignInMetadata ?? null,
    now,
  );
  const nextDeviceLabel = normalizeDeviceMetadataString(
    input.deviceLabel ?? existing?.deviceLabel ?? null,
    DEVICE_LABEL_MAX_LENGTH,
  );
  const nextDeviceLabelSource = nextDeviceLabel
    ? normalizeDeviceMetadataString(
      input.deviceLabelSource ?? existing?.deviceLabelSource ?? null,
      DEVICE_LABEL_SOURCE_MAX_LENGTH,
    )
    : null;
  const nextDeviceLabelConfidence = nextDeviceLabel
    ? normalizeDeviceLabelConfidence(
      input.deviceLabelConfidence ?? existing?.deviceLabelConfidence ?? null,
    )
    : null;

  const nextUser: UserDocument = {
    uid: input.uid,
    email: input.email,
    displayName: input.displayName,
    photoURL: input.photoURL,
    serverObservedSignInMetadata: nextServerObservedSignInMetadata,
    clientBestEffortSignInMetadata: nextClientBestEffortSignInMetadata,
    deviceLabel: nextDeviceLabel,
    deviceLabelSource: nextDeviceLabelSource,
    deviceLabelConfidence: nextDeviceLabelConfidence,
    fullName: profileState.fullName,
    universityCode: profileState.universityCode,
    phoneNumber: profileState.phoneNumber,
    phoneCountryIso2: profileState.phoneCountryIso2,
    phoneCountryCallingCode: profileState.phoneCountryCallingCode,
    gender: profileState.gender,
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
  const traceContext = createAuthTraceContext({
    flow: "system",
    provider: "repository",
  });

  logAuthStageStart(traceContext, AUTH_STAGE_REPOSITORY_READ, {
    operation: "listUsers",
  });

  if (!hasSupabaseAdminRuntime()) {
    logAuthStageSuccess(traceContext, AUTH_STAGE_REPOSITORY_READ, {
      operation: "listUsers",
      fallback: "memory",
    });
    return [...getMemoryStore().users.values()].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    );
  }

  const authUsers = await listAllAuthUsers();
  const users = authUsers
    .map((authUser) => buildUserDocumentFromAuthRecord(authUser, null))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  logAuthStageSuccess(traceContext, AUTH_STAGE_REPOSITORY_READ, {
    operation: "listUsers",
    count: users.length,
  });

  return users;
}

export async function setUserRole(uid: string, role: UserRole) {
  const traceContext = createAuthTraceContext({
    flow: "admin",
    provider: "repository",
    uid,
  });

  logAuthStageStart(traceContext, AUTH_STAGE_USER_LOOKUP, {
    operation: "setUserRole.read",
  });
  const user = await getUserByUid(uid, {
    traceContext,
  });
  if (!user) {
    logAuthStageFailure(traceContext, AUTH_STAGE_USER_LOOKUP, new Error("USER_NOT_FOUND"), {
      operation: "setUserRole.read",
    });
    throw new Error("USER_NOT_FOUND");
  }
  logAuthStageSuccess(traceContext, AUTH_STAGE_USER_LOOKUP, {
    operation: "setUserRole.read",
  });

  if (role === "admin" && !isAllowlistedAdminEmail(user.email)) {
    logAuthStageFailure(
      traceContext,
      AUTH_STAGE_USER_UPSERT,
      new Error("ADMIN_ACCOUNT_UNAUTHORIZED"),
      {
        operation: "setUserRole.allowlist",
      },
    );
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
    gender: user.gender,
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
    gender: profileState.gender,
    nationality: profileState.nationality,
    profileCompleted: profileState.profileCompleted,
    profileCompletedAt: profileState.profileCompletedAt,
    updatedAt: now,
  };

  logAuthStageStart(traceContext, AUTH_STAGE_USER_UPSERT, {
    operation: "setUserRole.persist",
  });
  await persistAuthCriticalUserClaims(nextUser, traceContext);
  await getServerAuthAdmin().revokeRefreshTokens(uid);
  logAuthStageSuccess(traceContext, AUTH_STAGE_USER_UPSERT, {
    operation: "setUserRole.persist",
    role,
  });

  return nextUser;
}

export async function setUserStatus(uid: string, status: UserStatus) {
  const traceContext = createAuthTraceContext({
    flow: "admin",
    provider: "repository",
    uid,
  });

  logAuthStageStart(traceContext, AUTH_STAGE_USER_LOOKUP, {
    operation: "setUserStatus.read",
  });
  const user = await getUserByUid(uid, {
    traceContext,
  });
  if (!user) {
    logAuthStageFailure(traceContext, AUTH_STAGE_USER_LOOKUP, new Error("USER_NOT_FOUND"), {
      operation: "setUserStatus.read",
    });
    throw new Error("USER_NOT_FOUND");
  }
  logAuthStageSuccess(traceContext, AUTH_STAGE_USER_LOOKUP, {
    operation: "setUserStatus.read",
  });

  const nextUser: UserDocument = {
    ...user,
    status,
    updatedAt: toIsoTimestamp(new Date()),
  };

  // Blocking stays server-authoritative here: disabled users are enforced by Supabase Auth and
  // refresh tokens are revoked so stale sessions cannot bypass the admin decision.
  await getServerAuthAdmin().updateUser(uid, {
    disabled: status === "suspended",
  });
  await getServerAuthAdmin().revokeRefreshTokens(uid);
  logAuthStageStart(traceContext, AUTH_STAGE_USER_UPSERT, {
    operation: "setUserStatus.persist",
  });
  await persistAuthCriticalUserClaims(nextUser, traceContext);
  logAuthStageSuccess(traceContext, AUTH_STAGE_USER_UPSERT, {
    operation: "setUserStatus.persist",
    status,
  });

  return nextUser;
}

export async function deleteUserAccountAsAdmin(input: {
  targetUid: string;
  actingAdmin: Pick<SessionUser, "uid" | "role">;
  route: string;
}) {
  const targetUid = input.targetUid.trim();
  if (!targetUid) {
    throw new Error("USER_UID_REQUIRED");
  }

  if (targetUid === input.actingAdmin.uid) {
    throw new Error("ADMIN_SELF_DELETE_FORBIDDEN");
  }

  const targetUser = await getUserByUid(targetUid);
  if (!targetUser) {
    throw new Error("USER_NOT_FOUND");
  }

  if (targetUser.role === "admin" && isAllowlistedAdminEmail(targetUser.email)) {
    throw new Error("ALLOWLISTED_ADMIN_DELETE_FORBIDDEN");
  }

  const summary: AdminUserDeletionSummary = {
    action: "delete-user",
    targetUid,
    targetEmail: targetUser.email ?? null,
    actingAdminUid: input.actingAdmin.uid,
    authAccountDeleted: false,
    database: {
      deletedDocuments: 0,
      deletedAssessmentGenerations: 0,
      deletedAssessmentArtifactMetadata: 0,
      deletedInfographicGenerations: 0,
      deletedCreditAccounts: 0,
      deletedCreditGrants: 0,
      deletedDailyCredits: 0,
      deletedCreditMutationHistory: 0,
      deletedIdempotencyKeys: 0,
      deletedLegacyUserRecords: 0,
    },
    storage: {
      deletedDocumentObjects: 0,
      deletedAssessmentArtifacts: 0,
      deletedInfographicArtifacts: 0,
      // Storage deletion helpers are intentionally best-effort and idempotent.
      storageCleanupBestEffort: true,
    },
    finalResult: "partial_failure",
    failurePoint: null,
    failureReason: null,
  };

  let currentStage: string = "freeze-auth-account";

  try {
    /* Freeze first: disable + revoke before destructive cleanup so cross-system partial
       failures cannot leave an active account with stale sessions during deletion. */
    await getServerAuthAdmin().updateUser(targetUid, {
      disabled: true,
    });
    await getServerAuthAdmin().revokeRefreshTokens(targetUid);

    currentStage = "collect-owner-records";
    const [documents, uploadPreparations, assessments] = await Promise.all([
      listRawDocumentsForOwner(targetUid),
      listRawUploadPreparationsForOwner(targetUid),
      listRawAssessmentGenerationsForOwner(targetUid),
    ]);

    currentStage = "delete-owner-storage";
    summary.storage.deletedDocumentObjects = documents.length + uploadPreparations.length;
    await Promise.allSettled([
      ...documents.map((documentRecord) => deleteDocumentBinaryFromStorage(documentRecord)),
      ...uploadPreparations.map((uploadPreparation) =>
        deleteDocumentBinaryFromStorage(uploadPreparation),
      ),
    ]);

    let assessmentArtifactsDeleted = 0;
    for (const generation of assessments) {
      const artifacts = Object.values(generation.artifacts ?? {});
      assessmentArtifactsDeleted += artifacts.length;
      await Promise.allSettled(
        artifacts.map((artifact) => deleteAssessmentArtifact(artifact, targetUid)),
      );
    }
    summary.storage.deletedAssessmentArtifacts = assessmentArtifactsDeleted;

    currentStage = "delete-owner-database-records";
    if (shouldUseDatabase()) {
      const deleteOwnerScopedCollection = async (collectionName: string) => {
        const snapshot = await getZootopiaDatabase()
          .collection(collectionName)
          .where("ownerUid", "==", targetUid)
          .get();

        await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
        return snapshot.size;
      };

      summary.database.deletedDocuments = await deleteOwnerScopedCollection("documents");
      await deleteOwnerScopedCollection(UPLOAD_PREPARATION_COLLECTION);
      summary.database.deletedAssessmentGenerations = await deleteOwnerScopedCollection(
        "assessmentGenerations",
      );
      summary.database.deletedAssessmentArtifactMetadata = await deleteOwnerScopedCollection(
        ASSESSMENT_ARTIFACT_METADATA_COLLECTION,
      );
      summary.database.deletedInfographicGenerations = await deleteOwnerScopedCollection(
        "infographicGenerations",
      );
      summary.database.deletedCreditGrants = await deleteOwnerScopedCollection(
        ASSESSMENT_CREDIT_GRANTS_COLLECTION,
      );
      summary.database.deletedDailyCredits = await deleteOwnerScopedCollection(
        ASSESSMENT_DAILY_CREDITS_COLLECTION,
      );
      summary.database.deletedCreditMutationHistory = await deleteOwnerScopedCollection(
        ASSESSMENT_CREDIT_MUTATION_HISTORY_COLLECTION,
      );
      summary.database.deletedIdempotencyKeys = await deleteOwnerScopedCollection(
        ASSESSMENT_GENERATION_IDEMPOTENCY_COLLECTION,
      );

      const accountSnapshot = await getZootopiaDatabase()
        .collection(ASSESSMENT_CREDIT_ACCOUNTS_COLLECTION)
        .doc(targetUid)
        .get();
      if (accountSnapshot.exists) {
        await accountSnapshot.ref.delete();
        summary.database.deletedCreditAccounts = 1;
      }

      const legacyUserSnapshot = await getZootopiaDatabase()
        .collection("users")
        .doc(targetUid)
        .get();
      if (legacyUserSnapshot.exists) {
        await legacyUserSnapshot.ref.delete();
        summary.database.deletedLegacyUserRecords = 1;
      }
    } else {
      const store = getMemoryStore();

      for (const [documentId, documentRecord] of store.documents.entries()) {
        if (documentRecord.ownerUid !== targetUid) {
          continue;
        }

        store.documents.delete(documentId);
        summary.database.deletedDocuments += 1;
      }

      for (const [preparationId, uploadPreparationRecord] of store.uploadPreparations.entries()) {
        if (uploadPreparationRecord.ownerUid !== targetUid) {
          continue;
        }

        store.uploadPreparations.delete(preparationId);
      }

      for (const [assessmentId, assessmentRecord] of store.assessments.entries()) {
        if (assessmentRecord.ownerUid !== targetUid) {
          continue;
        }

        store.assessments.delete(assessmentId);
        summary.database.deletedAssessmentGenerations += 1;
      }

      for (const [artifactMetadataId, artifactMetadataRecord] of store.assessmentArtifactMetadata.entries()) {
        if (artifactMetadataRecord.ownerUid !== targetUid) {
          continue;
        }

        store.assessmentArtifactMetadata.delete(artifactMetadataId);
        summary.database.deletedAssessmentArtifactMetadata += 1;
      }

      for (const [infographicId, infographicRecord] of store.infographics.entries()) {
        if (infographicRecord.ownerUid !== targetUid) {
          continue;
        }

        store.infographics.delete(infographicId);
        summary.database.deletedInfographicGenerations += 1;
      }

      if (store.assessmentCreditAccounts.delete(targetUid)) {
        summary.database.deletedCreditAccounts = 1;
      }

      for (const [grantId, grantRecord] of store.assessmentCreditGrants.entries()) {
        if (grantRecord.ownerUid !== targetUid) {
          continue;
        }

        store.assessmentCreditGrants.delete(grantId);
        summary.database.deletedCreditGrants += 1;
      }

      for (const [dailyId, dailyRecord] of store.assessmentDailyCredits.entries()) {
        if (dailyRecord.ownerUid !== targetUid) {
          continue;
        }

        store.assessmentDailyCredits.delete(dailyId);
        summary.database.deletedDailyCredits += 1;
      }

      for (const [mutationId, mutationRecord] of store.assessmentCreditMutationHistory.entries()) {
        if (mutationRecord.ownerUid !== targetUid) {
          continue;
        }

        store.assessmentCreditMutationHistory.delete(mutationId);
        summary.database.deletedCreditMutationHistory += 1;
      }

      for (const [idempotencyId, idempotencyRecord] of store.assessmentGenerationIdempotency.entries()) {
        if (idempotencyRecord.ownerUid !== targetUid) {
          continue;
        }

        store.assessmentGenerationIdempotency.delete(idempotencyId);
        summary.database.deletedIdempotencyKeys += 1;
      }

      if (store.users.delete(targetUid)) {
        summary.database.deletedLegacyUserRecords = 1;
      }
    }

    currentStage = "delete-auth-account";
    await getServerAuthAdmin().deleteUser(targetUid);
    summary.authAccountDeleted = true;
    summary.finalResult = "success";
    summary.failurePoint = null;
    summary.failureReason = null;

    await appendAdminLog({
      actorUid: input.actingAdmin.uid,
      actorRole: input.actingAdmin.role,
      targetUid,
      ownerUid: targetUid,
      ownerRole: targetUser.role,
      action: "admin-user-deleted",
      resourceType: "user",
      resourceId: targetUid,
      route: input.route,
      metadata: {
        targetEmail: targetUser.email,
        finalResult: summary.finalResult,
        authAccountDeleted: summary.authAccountDeleted,
        deletedDocuments: summary.database.deletedDocuments,
        deletedAssessments: summary.database.deletedAssessmentGenerations,
        deletedAssessmentArtifactMetadata: summary.database.deletedAssessmentArtifactMetadata,
        deletedInfographics: summary.database.deletedInfographicGenerations,
        deletedCreditAccounts: summary.database.deletedCreditAccounts,
        deletedCreditGrants: summary.database.deletedCreditGrants,
        deletedDailyCredits: summary.database.deletedDailyCredits,
        deletedCreditMutationHistory: summary.database.deletedCreditMutationHistory,
        deletedIdempotencyKeys: summary.database.deletedIdempotencyKeys,
        deletedDocumentObjects: summary.storage.deletedDocumentObjects,
        deletedAssessmentArtifacts: summary.storage.deletedAssessmentArtifacts,
      },
    });

    return summary;
  } catch (error) {
    summary.finalResult = "partial_failure";
    summary.failurePoint = currentStage;
    summary.failureReason = error instanceof Error ? error.message : "UNKNOWN_DELETE_FAILURE";

    await appendAdminLog({
      actorUid: input.actingAdmin.uid,
      actorRole: input.actingAdmin.role,
      targetUid,
      ownerUid: targetUid,
      ownerRole: targetUser.role,
      action: "admin-user-delete-failed",
      resourceType: "user",
      resourceId: targetUid,
      route: input.route,
      metadata: {
        targetEmail: targetUser.email,
        finalResult: summary.finalResult,
        failurePoint: summary.failurePoint,
        failureReason: summary.failureReason,
        authAccountDeleted: summary.authAccountDeleted,
        deletedDocuments: summary.database.deletedDocuments,
        deletedAssessments: summary.database.deletedAssessmentGenerations,
        deletedAssessmentArtifactMetadata: summary.database.deletedAssessmentArtifactMetadata,
        deletedInfographics: summary.database.deletedInfographicGenerations,
        deletedCreditAccounts: summary.database.deletedCreditAccounts,
        deletedCreditGrants: summary.database.deletedCreditGrants,
        deletedDailyCredits: summary.database.deletedDailyCredits,
        deletedCreditMutationHistory: summary.database.deletedCreditMutationHistory,
        deletedIdempotencyKeys: summary.database.deletedIdempotencyKeys,
        deletedDocumentObjects: summary.storage.deletedDocumentObjects,
        deletedAssessmentArtifacts: summary.storage.deletedAssessmentArtifacts,
      },
    });

    throw Object.assign(new Error("ADMIN_USER_DELETE_FAILED"), {
      cause: error,
      deletionSummary: summary,
    });
  }
}

export async function updateUserProfile(
  uid: string,
  profile: UpdateUserProfileInput,
) {
  const traceContext = createAuthTraceContext({
    flow: "user",
    provider: "repository",
    uid,
  });

  logAuthStageStart(traceContext, AUTH_STAGE_USER_LOOKUP, {
    operation: "updateUserProfile.read",
  });
  const user = await getUserByUid(uid, {
    traceContext,
  });
  if (!user) {
    logAuthStageFailure(traceContext, AUTH_STAGE_USER_LOOKUP, new Error("USER_NOT_FOUND"), {
      operation: "updateUserProfile.read",
    });
    throw new Error("USER_NOT_FOUND");
  }
  logAuthStageSuccess(traceContext, AUTH_STAGE_USER_LOOKUP, {
    operation: "updateUserProfile.read",
  });

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
    gender: profile.gender,
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
    gender: profileState.gender,
    nationality: profileState.nationality,
    profileCompleted: profileState.profileCompleted,
    profileCompletedAt: profileState.profileCompletedAt,
    updatedAt: now,
  };

  logAuthStageStart(traceContext, AUTH_STAGE_USER_UPSERT, {
    operation: "updateUserProfile.persist",
  });
  await persistAuthCriticalUserClaims(nextUser, traceContext);
  logAuthStageSuccess(traceContext, AUTH_STAGE_USER_UPSERT, {
    operation: "updateUserProfile.persist",
    profileCompleted: nextUser.profileCompleted,
  });

  return nextUser;
}

export async function appendAdminLog(input: Omit<AdminLogEntry, "id" | "createdAt">) {
  const entry: AdminLogEntry = {
    id: randomUUID(),
    createdAt: toIsoTimestamp(new Date()),
    ...input,
  };

  try {
    if (shouldUseDatabase()) {
      await getZootopiaDatabase()
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
  if (shouldUseDatabase()) {
    const snapshot = await getZootopiaDatabase()
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
  if (shouldUseDatabase()) {
    const snapshot = await getZootopiaDatabase()
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

async function listRawUploadPreparationsForOwner(ownerUid: string) {
  if (shouldUseDatabase()) {
    const snapshot = await getZootopiaDatabase()
      .collection(UPLOAD_PREPARATION_COLLECTION)
      .where("ownerUid", "==", ownerUid)
      .get();

    return snapshot.docs.map((doc) => {
      const record = doc.data() as unknown as UploadPreparationRecord;
      return {
        ...record,
        id: record.id || doc.id,
      } as UploadPreparationRecord;
    });
  }

  return [...getMemoryStore().uploadPreparations.values()].filter(
    (record) => record.ownerUid === ownerUid,
  );
}

async function listRawAssessmentGenerationsForOwner(ownerUid: string) {
  if (shouldUseDatabase()) {
    const snapshot = await getZootopiaDatabase()
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
  if (shouldUseDatabase()) {
    const snapshot = await getZootopiaDatabase()
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
  const computedExpiry = getRetentionExpiryTimestamp(record.createdAt, "uploads");
  const nextRecord: DocumentRecord = {
    ...record,
    ownerRole: resolvedOwnerRole,
    isActive: record.isActive !== false,
    supersededAt: record.isActive === false ? record.supersededAt ?? record.updatedAt : null,
    expiresAt: record.expiresAt ?? (computedExpiry ?? undefined),
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

  if (shouldUseDatabase()) {
    const snapshot = await getZootopiaDatabase()
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
  if (shouldUseDatabase()) {
    const snapshot = await getZootopiaDatabase()
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

export async function getUploadPreparationByIdForOwner(id: string, ownerUid: string) {
  let record: UploadPreparationRecord | null = null;

  if (shouldUseDatabase()) {
    const snapshot = await getZootopiaDatabase()
      .collection(UPLOAD_PREPARATION_COLLECTION)
      .doc(id)
      .get();

    if (!snapshot.exists) {
      return null;
    }

    const storedRecord = snapshot.data() as unknown as UploadPreparationRecord;
    record = {
      ...storedRecord,
      id: storedRecord.id || snapshot.id,
    };
  } else {
    record = getMemoryStore().uploadPreparations.get(id) ?? null;
  }

  if (!record || record.ownerUid !== ownerUid) {
    return null;
  }

  const resolvedOwnerRole = await resolvePersistedOwnerRole({
    ownerUid: record.ownerUid,
    ownerRole: record.ownerRole,
  });
  const normalizedRecord = normalizeUploadPreparationRecord(record, resolvedOwnerRole);

  if (isUploadPreparationExpired(normalizedRecord)) {
    await purgeExpiredUploadPreparationRecord(normalizedRecord);
    return null;
  }

  return normalizedRecord;
}

export async function deleteUploadPreparationForOwner(id: string, ownerUid: string) {
  const record = await getUploadPreparationByIdForOwner(id, ownerUid);
  if (!record) {
    return null;
  }

  if (shouldUseDatabase()) {
    await getZootopiaDatabase()
      .collection(UPLOAD_PREPARATION_COLLECTION)
      .doc(id)
      .delete();
  } else {
    getMemoryStore().uploadPreparations.delete(id);
  }

  return record;
}

export async function getActiveDocumentForOwner(ownerUid: string) {
  const documents = await listDocumentsForUser(ownerUid, 20);
  return documents.find((document) => document.isActive) ?? documents[0] ?? null;
}

async function promoteMostRecentDocumentActive(ownerUid: string) {
  const promotedAt = toIsoTimestamp(new Date());

  if (shouldUseDatabase()) {
    const snapshot = await getZootopiaDatabase()
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

  if (shouldUseDatabase()) {
    await getZootopiaDatabase()
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

function normalizeAssessmentPromptEntitlement(value: unknown): AssessmentPromptEntitlement {
  return value === "enabled" ? "enabled" : "disabled";
}

function normalizeAssessmentCreditAccountRecord(input: {
  ownerUid: string;
  record: Partial<AssessmentCreditAccountRecord> | null | undefined;
  nowIso: string;
}) {
  return {
    ownerUid: input.ownerUid,
    assessmentAccess: input.record?.assessmentAccess === "disabled" ? "disabled" : "enabled",
    assessmentPromptEntitlement: normalizeAssessmentPromptEntitlement(
      input.record?.assessmentPromptEntitlement,
    ),
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

function normalizeAdminAssessmentCreditMutationAction(
  action: unknown,
): AdminAssessmentCreditMutationInput["action"] {
  switch (action) {
    case "set_access":
    case "set_daily_override":
    case "clear_daily_override":
    case "add_manual_credits":
    case "subtract_manual_credits":
    case "set_manual_credits":
    case "grant_credits":
    case "revoke_grant":
      return action;
    default:
      return "set_manual_credits";
  }
}

function normalizeAssessmentCreditMutationBalanceSnapshot(
  snapshot: Partial<AdminAssessmentCreditMutationBalanceSnapshot> | null | undefined,
): AdminAssessmentCreditMutationBalanceSnapshot {
  const normalizedDailyLimitOverride = normalizeAssessmentDailyLimitOverride(
    snapshot?.dailyLimitOverride,
  );
  const dailyLimit = resolveAssessmentDailyCreditsLimit({
    override: normalizedDailyLimitOverride,
    fallback:
      typeof snapshot?.dailyLimit === "number" && Number.isFinite(snapshot.dailyLimit)
        ? Math.round(snapshot.dailyLimit)
        : getDefaultDailyAssessmentCreditsLimit(),
  });

  return {
    assessmentAccess: snapshot?.assessmentAccess === "disabled" ? "disabled" : "enabled",
    dailyLimitOverride: normalizedDailyLimitOverride,
    manualCredits: clampManualCredits(
      typeof snapshot?.manualCredits === "number" && Number.isFinite(snapshot.manualCredits)
        ? Math.round(snapshot.manualCredits)
        : 0,
    ),
    dailyLimit,
    usedCount:
      typeof snapshot?.usedCount === "number" && Number.isFinite(snapshot.usedCount)
        ? Math.max(0, Math.round(snapshot.usedCount))
        : 0,
    remainingCount:
      snapshot?.remainingCount === null
        ? null
        : typeof snapshot?.remainingCount === "number" && Number.isFinite(snapshot.remainingCount)
          ? Math.max(0, Math.round(snapshot.remainingCount))
          : null,
    grantCreditsAvailable:
      typeof snapshot?.grantCreditsAvailable === "number" && Number.isFinite(snapshot.grantCreditsAvailable)
        ? Math.max(0, Math.round(snapshot.grantCreditsAvailable))
        : 0,
    activeGrantCount:
      typeof snapshot?.activeGrantCount === "number" && Number.isFinite(snapshot.activeGrantCount)
        ? Math.max(0, Math.round(snapshot.activeGrantCount))
        : 0,
  };
}

function buildAssessmentCreditMutationBalanceSnapshot(input: {
  account: AssessmentCreditAccountRecord;
  summary: AssessmentDailyCreditsSummary;
}): AdminAssessmentCreditMutationBalanceSnapshot {
  return {
    assessmentAccess: input.account.assessmentAccess,
    dailyLimitOverride: input.account.dailyLimitOverride,
    manualCredits: input.account.manualCredits,
    dailyLimit: input.summary.dailyLimit,
    usedCount: input.summary.usedCount,
    remainingCount: input.summary.remainingCount,
    grantCreditsAvailable: input.summary.grantCreditsAvailable,
    activeGrantCount: input.summary.activeGrantCount,
  };
}

type StructuredAssessmentCreditAccountRow = {
  owner_uid: string;
  assessment_access: string;
  assessment_prompt_entitlement: string | null;
  daily_limit_override: number | null;
  manual_credits: number | null;
  created_at: string | Date;
  updated_at: string | Date;
};

type StructuredAssessmentCreditGrantRow = {
  id: string;
  owner_uid: string;
  credits: number | null;
  consumed: number | null;
  status: string;
  expires_at: string | Date | null;
  reason: string | null;
  note: string | null;
  created_by_uid: string | null;
  created_by_role: UserRole | null;
  created_at: string | Date;
  updated_at: string | Date;
  revoked_at: string | Date | null;
  revoked_by_uid: string | null;
  revoke_reason: string | null;
};

type StructuredAssessmentDailyCreditRow = {
  id: string;
  owner_uid: string;
  day_key: string;
  daily_limit: number | null;
  successful_generation_ids: string[] | null;
  pending_reservations: AssessmentDailyCreditReservation[] | null;
  created_at: string | Date;
  updated_at: string | Date;
};

type StructuredAssessmentCreditMutationRow = {
  id: string;
  owner_uid: string;
  actor_uid: string | null;
  actor_email: string | null;
  actor_role: UserRole | null;
  mutation_type: AdminAssessmentCreditMutationInput["action"];
  amount: number | null;
  access: AssessmentCreditAccountRecord["assessmentAccess"] | null;
  daily_limit_override: number | null;
  grant_id: string | null;
  expires_at: string | Date | null;
  reason: string | null;
  note: string | null;
  before_snapshot: Partial<AdminAssessmentCreditMutationBalanceSnapshot> | null;
  after_snapshot: Partial<AdminAssessmentCreditMutationBalanceSnapshot> | null;
  correlation_id: string | null;
  route_source: string | null;
  commit_status: string | null;
  created_at: string | Date;
};

function normalizeAssessmentCreditSqlTimestamp(
  value: string | Date | null | undefined,
  fallbackIso: string,
) {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : fallbackIso;
  }

  if (typeof value === "string" && Number.isFinite(Date.parse(value))) {
    return new Date(value).toISOString();
  }

  return fallbackIso;
}

function resolveAssessmentCreditRecordVersionTimestamp(
  record: {
    updatedAt?: string | null;
    createdAt?: string | null;
  } | null | undefined,
  fallbackIso: string,
) {
  const candidate =
    parseOptionalIsoTimestamp(record?.updatedAt)
    ?? parseOptionalIsoTimestamp(record?.createdAt)
    ?? fallbackIso;
  const parsed = Date.parse(candidate);
  return Number.isFinite(parsed) ? parsed : Date.parse(fallbackIso);
}

function pickPreferredAssessmentCreditRecord<
  T extends {
    updatedAt?: string | null;
    createdAt?: string | null;
  },
>(input: {
  structured: T | null;
  legacy: T | null;
  fallbackIso: string;
}) {
  if (!input.structured) {
    return input.legacy;
  }

  if (!input.legacy) {
    return input.structured;
  }

  return resolveAssessmentCreditRecordVersionTimestamp(input.structured, input.fallbackIso)
    >= resolveAssessmentCreditRecordVersionTimestamp(input.legacy, input.fallbackIso)
    ? input.structured
    : input.legacy;
}

function mapStructuredAssessmentCreditAccountRow(
  row: StructuredAssessmentCreditAccountRow,
  fallbackIso: string,
): Partial<AssessmentCreditAccountRecord> {
  return {
    ownerUid: row.owner_uid,
    assessmentAccess: row.assessment_access === "disabled" ? "disabled" : "enabled",
    assessmentPromptEntitlement: normalizeAssessmentPromptEntitlement(
      row.assessment_prompt_entitlement,
    ),
    dailyLimitOverride: row.daily_limit_override,
    manualCredits:
      typeof row.manual_credits === "number" && Number.isFinite(row.manual_credits)
        ? row.manual_credits
        : 0,
    createdAt: normalizeAssessmentCreditSqlTimestamp(row.created_at, fallbackIso),
    updatedAt: normalizeAssessmentCreditSqlTimestamp(row.updated_at, fallbackIso),
  };
}

function mapStructuredAssessmentCreditGrantRow(
  row: StructuredAssessmentCreditGrantRow,
  fallbackIso: string,
): Partial<AssessmentCreditGrantRecord> {
  return {
    id: row.id,
    ownerUid: row.owner_uid,
    credits:
      typeof row.credits === "number" && Number.isFinite(row.credits)
        ? row.credits
        : undefined,
    consumed:
      typeof row.consumed === "number" && Number.isFinite(row.consumed)
        ? row.consumed
        : undefined,
    status: row.status === "revoked" ? "revoked" : "active",
    expiresAt: row.expires_at
      ? normalizeAssessmentCreditSqlTimestamp(row.expires_at, fallbackIso)
      : null,
    reason: row.reason,
    note: row.note,
    createdByUid: row.created_by_uid ?? "system",
    createdByRole: row.created_by_role ?? undefined,
    createdAt: normalizeAssessmentCreditSqlTimestamp(row.created_at, fallbackIso),
    updatedAt: normalizeAssessmentCreditSqlTimestamp(row.updated_at, fallbackIso),
    revokedAt: row.revoked_at
      ? normalizeAssessmentCreditSqlTimestamp(row.revoked_at, fallbackIso)
      : null,
    revokedByUid: row.revoked_by_uid,
    revokeReason: row.revoke_reason,
  };
}

function mapStructuredAssessmentDailyCreditRow(
  row: StructuredAssessmentDailyCreditRow,
  fallbackIso: string,
): Partial<AssessmentDailyCreditLedgerDocument> {
  return {
    id: row.id,
    ownerUid: row.owner_uid,
    dayKey: row.day_key,
    dailyLimit:
      typeof row.daily_limit === "number" && Number.isFinite(row.daily_limit)
        ? row.daily_limit
        : getDefaultDailyAssessmentCreditsLimit(),
    successfulGenerationIds: Array.isArray(row.successful_generation_ids)
      ? row.successful_generation_ids.filter(
          (value): value is string => typeof value === "string" && value.trim().length > 0,
        )
      : [],
    pendingReservations: Array.isArray(row.pending_reservations)
      ? row.pending_reservations
      : [],
    createdAt: normalizeAssessmentCreditSqlTimestamp(row.created_at, fallbackIso),
    updatedAt: normalizeAssessmentCreditSqlTimestamp(row.updated_at, fallbackIso),
  };
}

function mapStructuredAssessmentCreditMutationRow(
  row: StructuredAssessmentCreditMutationRow,
  fallbackIso: string,
): Partial<AdminAssessmentCreditMutationRecord> {
  return {
    id: row.id,
    ownerUid: row.owner_uid,
    action: row.mutation_type,
    amount: row.amount,
    access: row.access,
    dailyLimitOverride: row.daily_limit_override,
    grantId: row.grant_id,
    expiresAt: row.expires_at
      ? normalizeAssessmentCreditSqlTimestamp(row.expires_at, fallbackIso)
      : null,
    reason: row.reason,
    note: row.note,
    adminUid: row.actor_uid ?? "system",
    adminEmail: row.actor_email,
    adminRole: row.actor_role ?? "admin",
    before: row.before_snapshot
      ? normalizeAssessmentCreditMutationBalanceSnapshot(row.before_snapshot)
      : undefined,
    after: row.after_snapshot
      ? normalizeAssessmentCreditMutationBalanceSnapshot(row.after_snapshot)
      : undefined,
    correlationId: row.correlation_id,
    routeSource: row.route_source,
    commitStatus: row.commit_status,
    createdAt: normalizeAssessmentCreditSqlTimestamp(row.created_at, fallbackIso),
  };
}

async function readLegacyAssessmentCreditAccountRecord(input: {
  ownerUid: string;
}) {
  const snapshot = await getZootopiaDatabase()
    .collection(ASSESSMENT_CREDIT_ACCOUNTS_COLLECTION)
    .doc(input.ownerUid)
    .get();

  return snapshot.exists
    ? (snapshot.data() as Partial<AssessmentCreditAccountRecord>)
    : null;
}

async function readStructuredAssessmentCreditAccountRecord(input: {
  ownerUid: string;
  nowIso: string;
  sql?: AssessmentCreditSqlExecutor;
  forUpdate?: boolean;
}) {
  const sql = input.sql ?? getZootopiaDatabase().sql;
  const rows = input.forUpdate
    ? (await sql<StructuredAssessmentCreditAccountRow[]>`
        SELECT
          owner_uid,
          assessment_access,
          assessment_prompt_entitlement,
          daily_limit_override,
          manual_credits,
          created_at,
          updated_at
        FROM public.assessment_credit_accounts
        WHERE owner_uid = ${input.ownerUid}
        FOR UPDATE
      `)
    : (await sql<StructuredAssessmentCreditAccountRow[]>`
        SELECT
          owner_uid,
          assessment_access,
          assessment_prompt_entitlement,
          daily_limit_override,
          manual_credits,
          created_at,
          updated_at
        FROM public.assessment_credit_accounts
        WHERE owner_uid = ${input.ownerUid}
      `);

  const row = rows[0];
  return row ? mapStructuredAssessmentCreditAccountRow(row, input.nowIso) : null;
}

async function listLegacyAssessmentCreditGrantsForOwnerRecords(input: {
  ownerUid: string;
}) {
  const snapshot = await getZootopiaDatabase()
    .collection(ASSESSMENT_CREDIT_GRANTS_COLLECTION)
    .where("ownerUid", "==", input.ownerUid)
    .limit(400)
    .get();

  return snapshot.docs.map((documentSnapshot) => ({
    grantId: documentSnapshot.id,
    record: documentSnapshot.data() as Partial<AssessmentCreditGrantRecord>,
  }));
}

async function listStructuredAssessmentCreditGrantRows(input: {
  ownerUid: string;
  sql?: AssessmentCreditSqlExecutor;
  forUpdate?: boolean;
}) {
  const sql = input.sql ?? getZootopiaDatabase().sql;
  return input.forUpdate
    ? sql<StructuredAssessmentCreditGrantRow[]>`
        SELECT
          id,
          owner_uid,
          credits,
          consumed,
          status,
          expires_at,
          reason,
          note,
          created_by_uid,
          created_by_role,
          created_at,
          updated_at,
          revoked_at,
          revoked_by_uid,
          revoke_reason
        FROM public.assessment_credit_grants
        WHERE owner_uid = ${input.ownerUid}
        ORDER BY created_at DESC
        FOR UPDATE
      `
    : sql<StructuredAssessmentCreditGrantRow[]>`
        SELECT
          id,
          owner_uid,
          credits,
          consumed,
          status,
          expires_at,
          reason,
          note,
          created_by_uid,
          created_by_role,
          created_at,
          updated_at,
          revoked_at,
          revoked_by_uid,
          revoke_reason
        FROM public.assessment_credit_grants
        WHERE owner_uid = ${input.ownerUid}
        ORDER BY created_at DESC
      `;
}

async function readLegacyAssessmentDailyCreditLedgerRecord(input: {
  ownerUid: string;
  dayKey: string;
}) {
  const documentId = buildAssessmentDailyCreditDocumentId(input.ownerUid, input.dayKey);
  const snapshot = await getZootopiaDatabase()
    .collection(ASSESSMENT_DAILY_CREDITS_COLLECTION)
    .doc(documentId)
    .get();

  return snapshot.exists
    ? (snapshot.data() as Partial<AssessmentDailyCreditLedgerDocument>)
    : null;
}

async function readStructuredAssessmentDailyCreditLedgerRecord(input: {
  ownerUid: string;
  dayKey: string;
  nowIso: string;
  sql?: AssessmentCreditSqlExecutor;
  forUpdate?: boolean;
}) {
  const sql = input.sql ?? getZootopiaDatabase().sql;
  const documentId = buildAssessmentDailyCreditDocumentId(input.ownerUid, input.dayKey);
  const rows = input.forUpdate
    ? (await sql<StructuredAssessmentDailyCreditRow[]>`
        SELECT
          id,
          owner_uid,
          day_key,
          daily_limit,
          successful_generation_ids,
          pending_reservations,
          created_at,
          updated_at
        FROM public.assessment_daily_credits
        WHERE id = ${documentId}
        FOR UPDATE
      `)
    : (await sql<StructuredAssessmentDailyCreditRow[]>`
        SELECT
          id,
          owner_uid,
          day_key,
          daily_limit,
          successful_generation_ids,
          pending_reservations,
          created_at,
          updated_at
        FROM public.assessment_daily_credits
        WHERE id = ${documentId}
      `);

  const row = rows[0];
  return row ? mapStructuredAssessmentDailyCreditRow(row, input.nowIso) : null;
}

async function listLegacyAssessmentCreditMutationHistoryRecords(input: {
  ownerUid: string;
  limit: number;
}) {
  const snapshot = await getZootopiaDatabase()
    .collection(ASSESSMENT_CREDIT_MUTATION_HISTORY_COLLECTION)
    .where("ownerUid", "==", input.ownerUid)
    .orderBy("createdAt", "desc")
    .limit(input.limit)
    .get();

  return snapshot.docs.map((documentSnapshot) => ({
    recordId: documentSnapshot.id,
    record: documentSnapshot.data() as Partial<AdminAssessmentCreditMutationRecord>,
  }));
}

async function listStructuredAssessmentCreditMutationRows(input: {
  ownerUid: string;
  limit: number;
  sql?: AssessmentCreditSqlExecutor;
}) {
  const sql = input.sql ?? getZootopiaDatabase().sql;
  return sql<StructuredAssessmentCreditMutationRow[]>`
    SELECT
      id,
      owner_uid,
      actor_uid,
      actor_email,
      actor_role,
      mutation_type,
      amount,
      access,
      daily_limit_override,
      grant_id,
      expires_at,
      reason,
      note,
      before_snapshot,
      after_snapshot,
      correlation_id,
      route_source,
      commit_status,
      created_at
    FROM public.assessment_credit_mutations
    WHERE owner_uid = ${input.ownerUid}
    ORDER BY created_at DESC
    LIMIT ${input.limit}
  `;
}

async function upsertStructuredAssessmentCreditAccount(input: {
  sql: AssessmentCreditSqlExecutor;
  account: AssessmentCreditAccountRecord;
}) {
  await input.sql`
    INSERT INTO public.assessment_credit_accounts (
      owner_uid,
      assessment_access,
      assessment_prompt_entitlement,
      daily_limit_override,
      manual_credits,
      created_at,
      updated_at
    ) VALUES (
      ${input.account.ownerUid},
      ${input.account.assessmentAccess},
      ${input.account.assessmentPromptEntitlement},
      ${input.account.dailyLimitOverride},
      ${input.account.manualCredits},
      ${input.account.createdAt},
      ${input.account.updatedAt}
    )
    ON CONFLICT (owner_uid)
    DO UPDATE SET
      assessment_access = EXCLUDED.assessment_access,
      assessment_prompt_entitlement = EXCLUDED.assessment_prompt_entitlement,
      daily_limit_override = EXCLUDED.daily_limit_override,
      manual_credits = EXCLUDED.manual_credits,
      updated_at = EXCLUDED.updated_at
  `;
}

async function upsertStructuredAssessmentCreditGrant(input: {
  sql: AssessmentCreditSqlExecutor;
  grant: AssessmentCreditGrantRecord;
}) {
  await input.sql`
    INSERT INTO public.assessment_credit_grants (
      id,
      owner_uid,
      credits,
      consumed,
      status,
      expires_at,
      reason,
      note,
      created_by_uid,
      created_by_role,
      created_at,
      updated_at,
      revoked_at,
      revoked_by_uid,
      revoke_reason
    ) VALUES (
      ${input.grant.id},
      ${input.grant.ownerUid},
      ${input.grant.credits},
      ${input.grant.consumed},
      ${input.grant.status},
      ${input.grant.expiresAt},
      ${input.grant.reason},
      ${input.grant.note},
      ${input.grant.createdByUid},
      ${input.grant.createdByRole ?? null},
      ${input.grant.createdAt},
      ${input.grant.updatedAt},
      ${input.grant.revokedAt ?? null},
      ${input.grant.revokedByUid ?? null},
      ${input.grant.revokeReason ?? null}
    )
    ON CONFLICT (id)
    DO UPDATE SET
      owner_uid = EXCLUDED.owner_uid,
      credits = EXCLUDED.credits,
      consumed = EXCLUDED.consumed,
      status = EXCLUDED.status,
      expires_at = EXCLUDED.expires_at,
      reason = EXCLUDED.reason,
      note = EXCLUDED.note,
      created_by_uid = EXCLUDED.created_by_uid,
      created_by_role = EXCLUDED.created_by_role,
      updated_at = EXCLUDED.updated_at,
      revoked_at = EXCLUDED.revoked_at,
      revoked_by_uid = EXCLUDED.revoked_by_uid,
      revoke_reason = EXCLUDED.revoke_reason
  `;
}

async function upsertStructuredAssessmentDailyCreditLedger(input: {
  sql: AssessmentCreditSqlExecutor;
  ledger: AssessmentDailyCreditLedgerDocument;
}) {
  await input.sql`
    INSERT INTO public.assessment_daily_credits (
      id,
      owner_uid,
      day_key,
      daily_limit,
      successful_generation_ids,
      pending_reservations,
      created_at,
      updated_at
    ) VALUES (
      ${input.ledger.id},
      ${input.ledger.ownerUid},
      ${input.ledger.dayKey},
      ${input.ledger.dailyLimit},
      ${input.ledger.successfulGenerationIds},
      ${input.sql.json(input.ledger.pendingReservations as never)},
      ${input.ledger.createdAt},
      ${input.ledger.updatedAt}
    )
    ON CONFLICT (id)
    DO UPDATE SET
      owner_uid = EXCLUDED.owner_uid,
      day_key = EXCLUDED.day_key,
      daily_limit = EXCLUDED.daily_limit,
      successful_generation_ids = EXCLUDED.successful_generation_ids,
      pending_reservations = EXCLUDED.pending_reservations,
      updated_at = EXCLUDED.updated_at
  `;
}

async function insertStructuredAssessmentCreditMutation(input: {
  sql: AssessmentCreditSqlExecutor;
  record: AdminAssessmentCreditMutationRecord;
}) {
  await input.sql`
    INSERT INTO public.assessment_credit_mutations (
      id,
      owner_uid,
      actor_uid,
      actor_email,
      actor_role,
      mutation_type,
      amount,
      access,
      daily_limit_override,
      grant_id,
      expires_at,
      reason,
      note,
      before_snapshot,
      after_snapshot,
      before_manual_credits,
      after_manual_credits,
      before_remaining_count,
      after_remaining_count,
      before_daily_remaining_count,
      after_daily_remaining_count,
      before_grant_credits_available,
      after_grant_credits_available,
      correlation_id,
      route_source,
      commit_status,
      created_at
    ) VALUES (
      ${input.record.id},
      ${input.record.ownerUid},
      ${input.record.adminUid},
      ${input.record.adminEmail ?? null},
      ${input.record.adminRole},
      ${input.record.action},
      ${input.record.amount},
      ${input.record.access},
      ${input.record.dailyLimitOverride},
      ${input.record.grantId},
      ${input.record.expiresAt},
      ${input.record.reason},
      ${input.record.note},
      ${input.sql.json(input.record.before as never)},
      ${input.sql.json(input.record.after as never)},
      ${input.record.before.manualCredits},
      ${input.record.after.manualCredits},
      ${input.record.before.remainingCount},
      ${input.record.after.remainingCount},
      ${input.record.before.dailyLimit - input.record.before.usedCount},
      ${input.record.after.dailyLimit - input.record.after.usedCount},
      ${input.record.before.grantCreditsAvailable},
      ${input.record.after.grantCreditsAvailable},
      ${input.record.correlationId ?? null},
      ${input.record.routeSource ?? null},
      ${input.record.commitStatus ?? "committed"},
      ${input.record.createdAt}
    )
  `;
}

/* The hybrid credit migration keeps legacy collection documents writable for compatibility, but
   every live credit transaction must mirror the same committed state into the structured credit
   tables inside the same ACID boundary. Future agents: keep this helper on the transaction path
   so canonical table reads and legacy mirrors cannot silently drift again. */
async function syncStructuredAssessmentCreditState(input: {
  sql: AssessmentCreditSqlExecutor;
  account?: AssessmentCreditAccountRecord | null;
  grants?: AssessmentCreditGrantRecord[] | null;
  ledger?: AssessmentDailyCreditLedgerDocument | null;
  history?: AdminAssessmentCreditMutationRecord | null;
}) {
  if (input.account) {
    await upsertStructuredAssessmentCreditAccount({
      sql: input.sql,
      account: input.account,
    });
  }

  for (const grant of input.grants ?? []) {
    await upsertStructuredAssessmentCreditGrant({
      sql: input.sql,
      grant,
    });
  }

  if (input.ledger) {
    await upsertStructuredAssessmentDailyCreditLedger({
      sql: input.sql,
      ledger: input.ledger,
    });
  }

  if (input.history) {
    await insertStructuredAssessmentCreditMutation({
      sql: input.sql,
      record: input.history,
    });
  }
}

function normalizeAssessmentCreditMutationRecord(input: {
  ownerUid: string;
  recordId: string;
  record: Partial<AdminAssessmentCreditMutationRecord> | null | undefined;
  nowIso: string;
}): AdminAssessmentCreditMutationRecord {
  return {
    id: input.recordId,
    ownerUid:
      typeof input.record?.ownerUid === "string" && input.record.ownerUid.trim()
        ? input.record.ownerUid.trim()
        : input.ownerUid,
    action: normalizeAdminAssessmentCreditMutationAction(input.record?.action),
    amount: parseMutationNonNegativeAmount(input.record?.amount),
    access:
      input.record?.access === "enabled" || input.record?.access === "disabled"
        ? input.record.access
        : null,
    dailyLimitOverride: normalizeAssessmentDailyLimitOverride(input.record?.dailyLimitOverride),
    grantId:
      typeof input.record?.grantId === "string" && input.record.grantId.trim()
        ? input.record.grantId.trim()
        : null,
    expiresAt: parseOptionalIsoTimestamp(input.record?.expiresAt),
    reason: sanitizeCreditMutationText(input.record?.reason),
    note: sanitizeCreditMutationText(input.record?.note, 1000),
    adminUid:
      typeof input.record?.adminUid === "string" && input.record.adminUid.trim()
        ? input.record.adminUid.trim()
        : "system",
    adminEmail:
      typeof input.record?.adminEmail === "string" && input.record.adminEmail.trim()
        ? input.record.adminEmail.trim()
        : null,
    adminRole: input.record?.adminRole === "user" ? "user" : "admin",
    before: normalizeAssessmentCreditMutationBalanceSnapshot(input.record?.before),
    after: normalizeAssessmentCreditMutationBalanceSnapshot(input.record?.after),
    correlationId:
      typeof input.record?.correlationId === "string" && input.record.correlationId.trim()
        ? input.record.correlationId.trim()
        : null,
    routeSource:
      typeof input.record?.routeSource === "string" && input.record.routeSource.trim()
        ? input.record.routeSource.trim()
        : null,
    commitStatus:
      typeof input.record?.commitStatus === "string" && input.record.commitStatus.trim()
        ? input.record.commitStatus.trim()
        : null,
    createdAt:
      typeof input.record?.createdAt === "string" && Number.isFinite(Date.parse(input.record.createdAt))
        ? input.record.createdAt
        : input.nowIso,
  };
}

async function listAssessmentCreditMutationHistoryForOwner(input: {
  ownerUid: string;
  nowIso: string;
  limit?: number;
}) {
  const resolvedLimit = Math.max(
    1,
    Math.min(input.limit ?? ASSESSMENT_CREDIT_MUTATION_HISTORY_LIMIT, ASSESSMENT_CREDIT_MUTATION_HISTORY_LIMIT),
  );

  if (shouldUseDatabase()) {
    const [legacyRecords, structuredRows] = await Promise.all([
      listLegacyAssessmentCreditMutationHistoryRecords({
        ownerUid: input.ownerUid,
        limit: resolvedLimit,
      }),
      listStructuredAssessmentCreditMutationRows({
        ownerUid: input.ownerUid,
        limit: resolvedLimit,
      }),
    ]);
    const preferredRecordsById = new Map<string, AdminAssessmentCreditMutationRecord>();

    for (const legacyRecord of legacyRecords) {
      preferredRecordsById.set(
        legacyRecord.recordId,
        normalizeAssessmentCreditMutationRecord({
          ownerUid: input.ownerUid,
          recordId: legacyRecord.recordId,
          record: legacyRecord.record,
          nowIso: input.nowIso,
        }),
      );
    }

    for (const structuredRow of structuredRows) {
      const structuredRecord = normalizeAssessmentCreditMutationRecord({
        ownerUid: input.ownerUid,
        recordId: structuredRow.id,
        record: mapStructuredAssessmentCreditMutationRow(structuredRow, input.nowIso),
        nowIso: input.nowIso,
      });
      const currentRecord = preferredRecordsById.get(structuredRecord.id) ?? null;
      const preferredRecord = pickPreferredAssessmentCreditRecord({
        structured: structuredRecord,
        legacy: currentRecord,
        fallbackIso: input.nowIso,
      });

      if (preferredRecord) {
        preferredRecordsById.set(structuredRecord.id, preferredRecord);
      }
    }

    return [...preferredRecordsById.values()]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, resolvedLimit);
  }

  return [...getMemoryStore().assessmentCreditMutationHistory.values()]
    .filter((record) => record.ownerUid === input.ownerUid)
    .map((record) =>
      normalizeAssessmentCreditMutationRecord({
        ownerUid: input.ownerUid,
        recordId: record.id,
        record,
        nowIso: input.nowIso,
      }),
    )
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, resolvedLimit);
}

type AssessmentCreditMutationApplyResult = {
  nextAccount: AssessmentCreditAccountRecord;
  nextGrants: AssessmentCreditGrantRecord[];
  accountChanged: boolean;
  upsertGrants: AssessmentCreditGrantRecord[];
  history: {
    amount: number | null;
    access: AssessmentCreditAccountRecord["assessmentAccess"] | null;
    dailyLimitOverride: number | null;
    grantId: string | null;
    expiresAt: string | null;
  };
};

function applyAssessmentCreditMutationToState(input: {
  ownerUid: string;
  admin: Pick<SessionUser, "uid" | "role">;
  mutation: AdminAssessmentCreditMutationInput;
  account: AssessmentCreditAccountRecord;
  grants: AssessmentCreditGrantRecord[];
  nowIso: string;
  nowMs: number;
  mutationReason: string | null;
  mutationNote: string | null;
}): AssessmentCreditMutationApplyResult {
  let nextAccount = input.account;
  const nextGrants = [...input.grants];
  let accountChanged = false;
  const upsertGrants: AssessmentCreditGrantRecord[] = [];
  const history: AssessmentCreditMutationApplyResult["history"] = {
    amount: null,
    access: null,
    dailyLimitOverride: null,
    grantId: null,
    expiresAt: null,
  };

  switch (input.mutation.action) {
    case "set_access": {
      if (input.mutation.access !== "enabled" && input.mutation.access !== "disabled") {
        throw new Error("ASSESSMENT_CREDIT_ACCESS_INVALID");
      }

      history.access = input.mutation.access;
      nextAccount = {
        ...nextAccount,
        assessmentAccess: input.mutation.access,
        updatedAt: input.nowIso,
      };
      accountChanged = true;
      break;
    }

    case "set_daily_override": {
      const override = normalizeAssessmentDailyLimitOverride(
        input.mutation.dailyLimitOverride,
      );
      if (!override) {
        throw new Error("ASSESSMENT_DAILY_OVERRIDE_INVALID");
      }

      history.dailyLimitOverride = override;
      nextAccount = {
        ...nextAccount,
        dailyLimitOverride: override,
        updatedAt: input.nowIso,
      };
      accountChanged = true;
      break;
    }

    case "clear_daily_override": {
      history.dailyLimitOverride = null;
      nextAccount = {
        ...nextAccount,
        dailyLimitOverride: null,
        updatedAt: input.nowIso,
      };
      accountChanged = true;
      break;
    }

    case "add_manual_credits": {
      const amount = parseMutationPositiveAmount(input.mutation.amount);
      if (!amount) {
        throw new Error("ASSESSMENT_CREDIT_AMOUNT_INVALID");
      }

      history.amount = amount;
      nextAccount = {
        ...nextAccount,
        manualCredits: clampManualCredits(nextAccount.manualCredits + amount),
        updatedAt: input.nowIso,
      };
      accountChanged = true;
      break;
    }

    case "subtract_manual_credits": {
      const amount = parseMutationPositiveAmount(input.mutation.amount);
      if (!amount) {
        throw new Error("ASSESSMENT_CREDIT_AMOUNT_INVALID");
      }

      history.amount = amount;
      nextAccount = {
        ...nextAccount,
        manualCredits: clampManualCredits(nextAccount.manualCredits - amount),
        updatedAt: input.nowIso,
      };
      accountChanged = true;
      break;
    }

    case "set_manual_credits": {
      const amount = parseMutationNonNegativeAmount(input.mutation.amount);
      if (amount === null) {
        throw new Error("ASSESSMENT_CREDIT_AMOUNT_INVALID");
      }

      history.amount = amount;
      nextAccount = {
        ...nextAccount,
        manualCredits: clampManualCredits(amount),
        updatedAt: input.nowIso,
      };
      accountChanged = true;
      break;
    }

    case "grant_credits": {
      const amount = parseMutationPositiveAmount(input.mutation.amount);
      if (!amount) {
        throw new Error("ASSESSMENT_CREDIT_AMOUNT_INVALID");
      }

      const expiresAt = parseOptionalIsoTimestamp(input.mutation.expiresAt ?? null);
      if (input.mutation.expiresAt && !expiresAt) {
        throw new Error("ASSESSMENT_CREDIT_GRANT_EXPIRY_INVALID");
      }

      if (expiresAt && Date.parse(expiresAt) <= input.nowMs) {
        throw new Error("ASSESSMENT_CREDIT_GRANT_EXPIRY_INVALID");
      }

      const credits = clampGrantCredits(amount);
      const grantId = randomUUID();
      const grantRecord: AssessmentCreditGrantRecord = {
        id: grantId,
        ownerUid: input.ownerUid,
        credits,
        consumed: 0,
        status: "active",
        expiresAt,
        reason: input.mutationReason,
        note: input.mutationNote,
        createdByUid: input.admin.uid,
        createdByRole: input.admin.role,
        createdAt: input.nowIso,
        updatedAt: input.nowIso,
        revokedAt: null,
        revokedByUid: null,
        revokeReason: null,
      };

      history.amount = credits;
      history.grantId = grantId;
      history.expiresAt = expiresAt;
      nextGrants.push(grantRecord);
      upsertGrants.push(grantRecord);
      break;
    }

    case "revoke_grant": {
      const grantId = String(input.mutation.grantId || "").trim();
      if (!grantId) {
        throw new Error("ASSESSMENT_CREDIT_GRANT_ID_REQUIRED");
      }

      const grantIndex = nextGrants.findIndex((grant) => grant.id === grantId);
      if (grantIndex < 0) {
        throw new Error("ASSESSMENT_CREDIT_GRANT_NOT_FOUND");
      }

      const grant = nextGrants[grantIndex];
      if (grant.ownerUid !== input.ownerUid) {
        throw new Error("ASSESSMENT_CREDIT_GRANT_OWNER_MISMATCH");
      }

      if (grant.status === "revoked") {
        throw new Error("ASSESSMENT_CREDIT_GRANT_ALREADY_REVOKED");
      }

      const revokedGrant: AssessmentCreditGrantRecord = {
        ...grant,
        status: "revoked",
        revokedAt: input.nowIso,
        revokedByUid: input.admin.uid,
        revokeReason: input.mutationReason,
        updatedAt: input.nowIso,
      };

      history.grantId = grantId;
      nextGrants[grantIndex] = revokedGrant;
      upsertGrants.push(revokedGrant);
      break;
    }

    default:
      throw new Error("ASSESSMENT_CREDIT_ACTION_UNSUPPORTED");
  }

  return {
    nextAccount,
    nextGrants,
    accountChanged,
    upsertGrants,
    history,
  };
}

async function readAssessmentCreditAccount(input: { ownerUid: string; nowIso: string }) {
  if (shouldUseDatabase()) {
    const [legacyRecord, structuredRecord] = await Promise.all([
      readLegacyAssessmentCreditAccountRecord({
        ownerUid: input.ownerUid,
      }),
      readStructuredAssessmentCreditAccountRecord({
        ownerUid: input.ownerUid,
        nowIso: input.nowIso,
      }),
    ]);
    const legacyAccount = legacyRecord
      ? normalizeAssessmentCreditAccountRecord({
          ownerUid: input.ownerUid,
          record: legacyRecord,
          nowIso: input.nowIso,
        })
      : null;
    const structuredAccount = structuredRecord
      ? normalizeAssessmentCreditAccountRecord({
          ownerUid: input.ownerUid,
          record: structuredRecord,
          nowIso: input.nowIso,
        })
      : null;

    return (
      pickPreferredAssessmentCreditRecord({
        structured: structuredAccount,
        legacy: legacyAccount,
        fallbackIso: input.nowIso,
      })
      ?? normalizeAssessmentCreditAccountRecord({
        ownerUid: input.ownerUid,
        record: null,
        nowIso: input.nowIso,
      })
    );
  }

  return normalizeAssessmentCreditAccountRecord({
    ownerUid: input.ownerUid,
    record: getMemoryStore().assessmentCreditAccounts.get(input.ownerUid) ?? null,
    nowIso: input.nowIso,
  });
}

export async function getAssessmentPromptEntitlementForUser(ownerUid: string) {
  const nowIso = toIsoTimestamp(new Date());
  const account = await readAssessmentCreditAccount({
    ownerUid,
    nowIso,
  });

  return account.assessmentPromptEntitlement;
}

export async function setAssessmentPromptEntitlementForUser(input: {
  ownerUid: string;
  entitlement: AssessmentPromptEntitlement;
}) {
  if (input.entitlement !== "enabled" && input.entitlement !== "disabled") {
    throw new Error("ASSESSMENT_PROMPT_ENTITLEMENT_INVALID");
  }

  const nowIso = toIsoTimestamp(new Date());

  if (shouldUseDatabase()) {
    await getZootopiaDatabase().runTransaction(async (transaction) => {
      const accountRef = getZootopiaDatabase()
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

      const nextAccount = {
        ...account,
        assessmentPromptEntitlement: input.entitlement,
        updatedAt: nowIso,
      } satisfies AssessmentCreditAccountRecord;

      await transaction.set(accountRef, nextAccount, { merge: true });
      await syncStructuredAssessmentCreditState({
        sql: transaction.sql,
        account: nextAccount,
      });
    });
  } else {
    const store = getMemoryStore();
    const account = normalizeAssessmentCreditAccountRecord({
      ownerUid: input.ownerUid,
      record: store.assessmentCreditAccounts.get(input.ownerUid) ?? null,
      nowIso,
    });

    store.assessmentCreditAccounts.set(input.ownerUid, {
      ...account,
      assessmentPromptEntitlement: input.entitlement,
      updatedAt: nowIso,
    });
  }

  return readAssessmentCreditAccount({
    ownerUid: input.ownerUid,
    nowIso,
  });
}

export async function listUserUidsWithAssessmentPromptEntitlementEnabled() {
  const enabledOwnerUids = new Set<string>();
  const nowIso = toIsoTimestamp(new Date());

  if (shouldUseDatabase()) {
    const [snapshot, structuredRows] = await Promise.all([
      getZootopiaDatabase()
        .collection(ASSESSMENT_CREDIT_ACCOUNTS_COLLECTION)
        .where("assessmentPromptEntitlement", "==", "enabled")
        .limit(5000)
        .get(),
      getZootopiaDatabase().sql<{ owner_uid: string }[]>`
        SELECT owner_uid
        FROM public.assessment_credit_accounts
        WHERE assessment_prompt_entitlement = 'enabled'
        LIMIT 5000
      `,
    ]);

    for (const structuredRow of structuredRows) {
      if (typeof structuredRow.owner_uid === "string" && structuredRow.owner_uid.trim()) {
        enabledOwnerUids.add(structuredRow.owner_uid.trim());
      }
    }

    for (const accountSnapshot of snapshot.docs) {
      const account = normalizeAssessmentCreditAccountRecord({
        ownerUid: accountSnapshot.id,
        record: accountSnapshot.data() as Partial<AssessmentCreditAccountRecord>,
        nowIso,
      });

      if (account.assessmentPromptEntitlement === "enabled") {
        enabledOwnerUids.add(account.ownerUid);
      }
    }

    return enabledOwnerUids;
  }

  for (const accountRecord of getMemoryStore().assessmentCreditAccounts.values()) {
    const account = normalizeAssessmentCreditAccountRecord({
      ownerUid: accountRecord.ownerUid,
      record: accountRecord,
      nowIso,
    });

    if (account.assessmentPromptEntitlement === "enabled") {
      enabledOwnerUids.add(account.ownerUid);
    }
  }

  return enabledOwnerUids;
}

async function listAssessmentCreditGrantsForOwner(input: { ownerUid: string; nowIso: string }) {
  if (shouldUseDatabase()) {
    const [legacyRecords, structuredRows] = await Promise.all([
      listLegacyAssessmentCreditGrantsForOwnerRecords({
        ownerUid: input.ownerUid,
      }),
      listStructuredAssessmentCreditGrantRows({
        ownerUid: input.ownerUid,
      }),
    ]);
    const preferredRecordsById = new Map<string, AssessmentCreditGrantRecord>();

    for (const legacyRecord of legacyRecords) {
      preferredRecordsById.set(
        legacyRecord.grantId,
        normalizeAssessmentCreditGrantRecord({
          ownerUid: input.ownerUid,
          grantId: legacyRecord.grantId,
          record: legacyRecord.record,
          nowIso: input.nowIso,
        }),
      );
    }

    for (const structuredRow of structuredRows) {
      const structuredGrant = normalizeAssessmentCreditGrantRecord({
        ownerUid: input.ownerUid,
        grantId: structuredRow.id,
        record: mapStructuredAssessmentCreditGrantRow(structuredRow, input.nowIso),
        nowIso: input.nowIso,
      });
      const currentGrant = preferredRecordsById.get(structuredGrant.id) ?? null;
      const preferredGrant = pickPreferredAssessmentCreditRecord({
        structured: structuredGrant,
        legacy: currentGrant,
        fallbackIso: input.nowIso,
      });

      if (preferredGrant) {
        preferredRecordsById.set(structuredGrant.id, preferredGrant);
      }
    }

    return [...preferredRecordsById.values()].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
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

  if (shouldUseDatabase()) {
    const [legacyRecord, structuredRecord] = await Promise.all([
      readLegacyAssessmentDailyCreditLedgerRecord({
        ownerUid: input.ownerUid,
        dayKey: input.dayKey,
      }),
      readStructuredAssessmentDailyCreditLedgerRecord({
        ownerUid: input.ownerUid,
        dayKey: input.dayKey,
        nowIso: input.nowIso,
      }),
    ]);
    const legacyLedger = legacyRecord
      ? normalizeAssessmentDailyCreditLedger({
          ownerUid: input.ownerUid,
          dayKey: input.dayKey,
          record: legacyRecord,
          nowIso: input.nowIso,
        })
      : null;
    const structuredLedger = structuredRecord
      ? normalizeAssessmentDailyCreditLedger({
          ownerUid: input.ownerUid,
          dayKey: input.dayKey,
          record: structuredRecord,
          nowIso: input.nowIso,
        })
      : null;

    return (
      pickPreferredAssessmentCreditRecord({
        structured: structuredLedger,
        legacy: legacyLedger,
        fallbackIso: input.nowIso,
      })
      ?? normalizeAssessmentDailyCreditLedger({
        ownerUid: input.ownerUid,
        dayKey: input.dayKey,
        record: null,
        nowIso: input.nowIso,
      })
    );
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

/* Admin credit mutations already compute the committed account/grant/summary snapshot inside the
   write transaction. Keep this fallback builder in the repository layer so admin surfaces can
   return the exact committed owner-scoped state if the post-commit reread degrades, instead of
   surfacing a false failure that invites a duplicate retry against a mutation that already landed. */
function buildAdminAssessmentCreditCommittedFallbackState(input: {
  ownerUid: string;
  account: AssessmentCreditAccountRecord;
  credits: AssessmentDailyCreditsSummary;
  grants: AssessmentCreditGrantRecord[];
  historyRecord: AdminAssessmentCreditMutationRecord;
  nowMs?: number;
}) {
  const nowMs = input.nowMs ?? Date.now();

  return {
    ownerUid: input.ownerUid,
    account: input.account,
    credits: input.credits,
    grants: input.grants
      .map((grant) => buildAssessmentCreditGrantAdminView(grant, nowMs))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    history: [input.historyRecord],
  } satisfies AdminAssessmentCreditState;
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

/* The owner-facing credits page uses the same canonical summary as the protected header, then
   adds server-owned grant and mutation detail from the repository. Future agents: keep the
   total balance sourced from `state.summary` so detail UI never becomes a competing truth path. */
export async function getAssessmentCreditDetailsForUser(
  user: Pick<SessionUser, "uid" | "role">,
) {
  const computedAt = toIsoTimestamp(new Date());
  const [state, history] = await Promise.all([
    resolveAssessmentCreditStateForUser(user),
    listAssessmentCreditMutationHistoryForOwner({
      ownerUid: user.uid,
      nowIso: computedAt,
      limit: ASSESSMENT_CREDIT_MUTATION_HISTORY_LIMIT,
    }),
  ]);
  const nowMs = Date.now();

  return {
    account: state.account,
    credits: state.summary,
    grants: state.grants
      .map((grant) => buildAssessmentCreditGrantAdminView(grant, nowMs))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    history,
    computedAt,
  };
}

export async function getAdminAssessmentCreditStateForUser(
  ownerUid: string,
  options: {
    ownerRole?: UserRole;
  } = {},
) {
  let ownerRole = options.ownerRole;
  if (!ownerRole) {
    const owner = await getUserByUid(ownerUid);
    if (!owner) {
      return null;
    }

    ownerRole = owner.role;
  }

  const nowIso = toIsoTimestamp(new Date());
  const [state, history] = await Promise.all([
    resolveAssessmentCreditStateForUser({
      uid: ownerUid,
      role: ownerRole,
    }),
    listAssessmentCreditMutationHistoryForOwner({
      ownerUid,
      nowIso,
      limit: ASSESSMENT_CREDIT_MUTATION_HISTORY_LIMIT,
    }),
  ]);
  const nowMs = Date.now();

  return {
    ownerUid,
    account: state.account,
    credits: state.summary,
    grants: state.grants
      .map((grant) => buildAssessmentCreditGrantAdminView(grant, nowMs))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    history,
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

  if (shouldUseDatabase()) {
    await getZootopiaDatabase().runTransaction(async (transaction) => {
      const lockRef = getZootopiaDatabase()
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
            getZootopiaDatabase()
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
        // Idempotency locks inherit the env-driven retention expiry; null (mode=none) falls back to 24h default.
        expiresAt:
          getRetentionExpiryTimestamp(nowIso, "results")
          ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };

      await transaction.set(lockRef, nextRecord, { merge: true });
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
        expiresAt:
          getRetentionExpiryTimestamp(nowIso, "results")
          ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
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

  if (shouldUseDatabase()) {
    await getZootopiaDatabase().runTransaction(async (transaction) => {
      const lockRef = getZootopiaDatabase()
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

      await transaction.set(
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
          expiresAt:
            input.generation.expiresAt
            || getRetentionExpiryTimestamp(nowIso, "results")
            || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
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
    expiresAt:
      input.generation.expiresAt
      || getRetentionExpiryTimestamp(nowIso, "results")
      || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  });
}

/* Failed or cancelled attempts should release the in-progress idempotency lock so the user can
   safely retry with the same key after transient errors. */
export async function clearAssessmentGenerationIdempotencyLock(input: {
  token: AssessmentGenerationIdempotencyToken;
}) {
  if (shouldUseDatabase()) {
    await getZootopiaDatabase().runTransaction(async (transaction) => {
      const lockRef = getZootopiaDatabase()
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

      await transaction.delete(lockRef);
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
  admin: Pick<SessionUser, "uid" | "role" | "email">;
  mutation: AdminAssessmentCreditMutationInput;
  diagnostics?: {
    traceId?: string | null;
    source?: string | null;
  };
}) {
  const owner = await getUserByUid(input.ownerUid);
  if (!owner) {
    throw new Error("USER_NOT_FOUND");
  }

  if (input.ownerUid === input.admin.uid) {
    throw new Error("ASSESSMENT_CREDIT_SELF_MUTATION_FORBIDDEN");
  }

  const now = new Date();
  const nowIso = toIsoTimestamp(now);
  const nowMs = now.getTime();
  const creditWindow = resolveAssessmentDailyCreditWindow(now);
  const historyRecordId = randomUUID();
  const mutationReason = sanitizeCreditMutationText(input.mutation.reason);
  const mutationNote = sanitizeCreditMutationText(input.mutation.note, 1000);
  const creditTraceId = input.diagnostics?.traceId
    ? createAssessmentCreditTraceId(input.diagnostics.traceId)
    : null;
  let beforeCreditSummary: AssessmentDailyCreditsSummary | null = null;
  let afterCreditSummary: AssessmentDailyCreditsSummary | null = null;
  let committedFallbackState: AdminAssessmentCreditState | null = null;

  if (creditTraceId) {
    logAssessmentCreditDiagnostic({
      event: "assessment_credit_mutation_requested",
      traceId: creditTraceId,
      details: {
        source: input.diagnostics?.source ?? "unknown",
        ownerUid: input.ownerUid,
        actorUid: input.admin.uid,
        action: input.mutation.action,
      },
    });
  }

  try {
    if (creditTraceId) {
      logAssessmentCreditDiagnostic({
        event: "assessment_credit_persistence_write_started",
        traceId: creditTraceId,
        details: {
          source: input.diagnostics?.source ?? "unknown",
          ownerUid: input.ownerUid,
          actorUid: input.admin.uid,
          action: input.mutation.action,
          persistenceMode: shouldUseDatabase() ? "database" : "memory",
        },
      });
    }

    if (shouldUseDatabase()) {
      let committedStateCandidate: AdminAssessmentCreditState | null = null;

      await getZootopiaDatabase().runTransaction(async (transaction) => {
        const accountRef = getZootopiaDatabase()
          .collection(ASSESSMENT_CREDIT_ACCOUNTS_COLLECTION)
          .doc(input.ownerUid);
        const ledgerRef = getZootopiaDatabase()
          .collection(ASSESSMENT_DAILY_CREDITS_COLLECTION)
          .doc(buildAssessmentDailyCreditDocumentId(input.ownerUid, creditWindow.dayKey));
        const grantsQuery = getZootopiaDatabase()
          .collection(ASSESSMENT_CREDIT_GRANTS_COLLECTION)
          .where("ownerUid", "==", input.ownerUid)
          .limit(400);

        const [accountSnapshot, ledgerSnapshot, grantsSnapshot] = await Promise.all([
          transaction.get(accountRef),
          transaction.get(ledgerRef),
          transaction.get(grantsQuery),
        ]);

        const account = normalizeAssessmentCreditAccountRecord({
          ownerUid: input.ownerUid,
          record: accountSnapshot.exists
            ? (accountSnapshot.data() as Partial<AssessmentCreditAccountRecord>)
            : null,
          nowIso,
        });
        const grants = grantsSnapshot.docs.map((grantSnapshot) =>
          normalizeAssessmentCreditGrantRecord({
            ownerUid: input.ownerUid,
            grantId: grantSnapshot.id,
            record: grantSnapshot.data() as Partial<AssessmentCreditGrantRecord>,
            nowIso,
          }),
        );
        const ledger = normalizeAssessmentDailyCreditLedger({
          ownerUid: input.ownerUid,
          dayKey: creditWindow.dayKey,
          record: ledgerSnapshot.exists
            ? (ledgerSnapshot.data() as Partial<AssessmentDailyCreditLedgerDocument>)
            : null,
          nowIso,
        });
        const activeReservations = filterActiveAssessmentDailyCreditReservations(
          ledger.pendingReservations,
          nowMs,
        );
        const dailyReservationCount = activeReservations.filter(
          (entry) => entry.source === "daily",
        ).length;
        const extraReservationCount = activeReservations.filter(
          (entry) => entry.source === "extra",
        ).length;

        if (creditTraceId) {
          logAssessmentCreditDiagnostic({
            event: "assessment_credit_summary_recompute_started",
            traceId: creditTraceId,
            details: {
              ownerUid: input.ownerUid,
              phase: "before",
            },
          });
        }

        const beforeComputation = buildAssessmentCreditComputation({
          role: owner.role,
          dayKey: creditWindow.dayKey,
          resetsAt: creditWindow.resetsAt,
          ledger,
          account,
          grants,
          dailyReservationCount,
          extraReservationCount,
        });
        beforeCreditSummary = beforeComputation.summary;

        if (creditTraceId) {
          logAssessmentCreditDiagnostic({
            event: "assessment_credit_summary_recompute_result",
            traceId: creditTraceId,
            details: {
              ownerUid: input.ownerUid,
              phase: "before",
              summary: buildAssessmentCreditSummaryDiagnosticSnapshot(
                beforeComputation.summary,
              ),
            },
          });
        }

        const mutationResult = applyAssessmentCreditMutationToState({
          ownerUid: input.ownerUid,
          admin: input.admin,
          mutation: input.mutation,
          account,
          grants,
          nowIso,
          nowMs,
          mutationReason,
          mutationNote,
        });

        if (mutationResult.accountChanged) {
          transaction.set(accountRef, mutationResult.nextAccount, { merge: true });
        }

        for (const grantRecord of mutationResult.upsertGrants) {
          transaction.set(
            getZootopiaDatabase()
              .collection(ASSESSMENT_CREDIT_GRANTS_COLLECTION)
              .doc(grantRecord.id),
            grantRecord,
            { merge: true },
          );
        }

        if (creditTraceId) {
          logAssessmentCreditDiagnostic({
            event: "assessment_credit_summary_recompute_started",
            traceId: creditTraceId,
            details: {
              ownerUid: input.ownerUid,
              phase: "after",
            },
          });
        }

        const afterComputation = buildAssessmentCreditComputation({
          role: owner.role,
          dayKey: creditWindow.dayKey,
          resetsAt: creditWindow.resetsAt,
          ledger,
          account: mutationResult.nextAccount,
          grants: mutationResult.nextGrants,
          dailyReservationCount,
          extraReservationCount,
        });
        afterCreditSummary = afterComputation.summary;

        if (creditTraceId) {
          logAssessmentCreditDiagnostic({
            event: "assessment_credit_summary_recompute_result",
            traceId: creditTraceId,
            details: {
              ownerUid: input.ownerUid,
              phase: "after",
              summary: buildAssessmentCreditSummaryDiagnosticSnapshot(
                afterComputation.summary,
              ),
            },
          });
        }

        const structuredLedger = {
          ...ledger,
          dailyLimit: afterComputation.dailyLimit,
          pendingReservations: activeReservations,
          updatedAt: nowIso,
        } satisfies AssessmentDailyCreditLedgerDocument;
        const historyRecord: AdminAssessmentCreditMutationRecord = {
          id: historyRecordId,
          ownerUid: input.ownerUid,
          action: input.mutation.action,
          amount: mutationResult.history.amount,
          access: mutationResult.history.access,
          dailyLimitOverride: mutationResult.history.dailyLimitOverride,
          grantId: mutationResult.history.grantId,
          expiresAt: mutationResult.history.expiresAt,
          reason: mutationReason,
          note: mutationNote,
          adminUid: input.admin.uid,
          adminEmail: input.admin.email ?? null,
          adminRole: input.admin.role,
          before: buildAssessmentCreditMutationBalanceSnapshot({
            account,
            summary: beforeComputation.summary,
          }),
          after: buildAssessmentCreditMutationBalanceSnapshot({
            account: mutationResult.nextAccount,
            summary: afterComputation.summary,
          }),
          correlationId: creditTraceId,
          routeSource: input.diagnostics?.source ?? null,
          commitStatus: "committed",
          createdAt: nowIso,
        };

        transaction.set(
          getZootopiaDatabase()
            .collection(ASSESSMENT_CREDIT_MUTATION_HISTORY_COLLECTION)
            .doc(historyRecordId),
          historyRecord,
          { merge: true },
        );
        await syncStructuredAssessmentCreditState({
          sql: transaction.sql,
          account: mutationResult.nextAccount,
          grants: mutationResult.nextGrants,
          ledger: structuredLedger,
          history: historyRecord,
        });
        committedStateCandidate = buildAdminAssessmentCreditCommittedFallbackState({
          ownerUid: input.ownerUid,
          account: mutationResult.nextAccount,
          credits: afterComputation.summary,
          grants: mutationResult.nextGrants,
          historyRecord,
          nowMs,
        });
      });
      committedFallbackState = committedStateCandidate;
    } else {
      const store = getMemoryStore();
      const account = normalizeAssessmentCreditAccountRecord({
        ownerUid: input.ownerUid,
        record: store.assessmentCreditAccounts.get(input.ownerUid) ?? null,
        nowIso,
      });
      const grants = [...store.assessmentCreditGrants.values()]
        .filter((grant) => grant.ownerUid === input.ownerUid)
        .map((grant) =>
          normalizeAssessmentCreditGrantRecord({
            ownerUid: input.ownerUid,
            grantId: grant.id,
            record: grant,
            nowIso,
          }),
        );
      const ledger = normalizeAssessmentDailyCreditLedger({
        ownerUid: input.ownerUid,
        dayKey: creditWindow.dayKey,
        record:
          store.assessmentDailyCredits.get(
            buildAssessmentDailyCreditDocumentId(input.ownerUid, creditWindow.dayKey),
          ) ?? null,
        nowIso,
      });
      const activeReservations = filterActiveAssessmentDailyCreditReservations(
        ledger.pendingReservations,
        nowMs,
      );
      const dailyReservationCount = activeReservations.filter(
        (entry) => entry.source === "daily",
      ).length;
      const extraReservationCount = activeReservations.filter(
        (entry) => entry.source === "extra",
      ).length;

      if (creditTraceId) {
        logAssessmentCreditDiagnostic({
          event: "assessment_credit_summary_recompute_started",
          traceId: creditTraceId,
          details: {
            ownerUid: input.ownerUid,
            phase: "before",
          },
        });
      }

      const beforeComputation = buildAssessmentCreditComputation({
        role: owner.role,
        dayKey: creditWindow.dayKey,
        resetsAt: creditWindow.resetsAt,
        ledger,
        account,
        grants,
        dailyReservationCount,
        extraReservationCount,
      });
      beforeCreditSummary = beforeComputation.summary;

      if (creditTraceId) {
        logAssessmentCreditDiagnostic({
          event: "assessment_credit_summary_recompute_result",
          traceId: creditTraceId,
          details: {
            ownerUid: input.ownerUid,
            phase: "before",
            summary: buildAssessmentCreditSummaryDiagnosticSnapshot(
              beforeComputation.summary,
            ),
          },
        });
      }

      const mutationResult = applyAssessmentCreditMutationToState({
        ownerUid: input.ownerUid,
        admin: input.admin,
        mutation: input.mutation,
        account,
        grants,
        nowIso,
        nowMs,
        mutationReason,
        mutationNote,
      });

      if (mutationResult.accountChanged) {
        store.assessmentCreditAccounts.set(input.ownerUid, mutationResult.nextAccount);
      }

      for (const grantRecord of mutationResult.upsertGrants) {
        store.assessmentCreditGrants.set(grantRecord.id, grantRecord);
      }

      if (creditTraceId) {
        logAssessmentCreditDiagnostic({
          event: "assessment_credit_summary_recompute_started",
          traceId: creditTraceId,
          details: {
            ownerUid: input.ownerUid,
            phase: "after",
          },
        });
      }

      const afterComputation = buildAssessmentCreditComputation({
        role: owner.role,
        dayKey: creditWindow.dayKey,
        resetsAt: creditWindow.resetsAt,
        ledger,
        account: mutationResult.nextAccount,
        grants: mutationResult.nextGrants,
        dailyReservationCount,
        extraReservationCount,
      });
      afterCreditSummary = afterComputation.summary;

      if (creditTraceId) {
        logAssessmentCreditDiagnostic({
          event: "assessment_credit_summary_recompute_result",
          traceId: creditTraceId,
          details: {
            ownerUid: input.ownerUid,
            phase: "after",
            summary: buildAssessmentCreditSummaryDiagnosticSnapshot(
              afterComputation.summary,
            ),
          },
        });
      }

      store.assessmentCreditMutationHistory.set(historyRecordId, {
        id: historyRecordId,
        ownerUid: input.ownerUid,
        action: input.mutation.action,
        amount: mutationResult.history.amount,
        access: mutationResult.history.access,
        dailyLimitOverride: mutationResult.history.dailyLimitOverride,
        grantId: mutationResult.history.grantId,
        expiresAt: mutationResult.history.expiresAt,
        reason: mutationReason,
        note: mutationNote,
        adminUid: input.admin.uid,
        adminEmail: input.admin.email ?? null,
        adminRole: input.admin.role,
        before: buildAssessmentCreditMutationBalanceSnapshot({
          account,
          summary: beforeComputation.summary,
        }),
        after: buildAssessmentCreditMutationBalanceSnapshot({
          account: mutationResult.nextAccount,
          summary: afterComputation.summary,
        }),
        correlationId: creditTraceId,
        routeSource: input.diagnostics?.source ?? null,
        commitStatus: "committed",
        createdAt: nowIso,
      });
      committedFallbackState = buildAdminAssessmentCreditCommittedFallbackState({
        ownerUid: input.ownerUid,
        account: mutationResult.nextAccount,
        credits: afterComputation.summary,
        grants: mutationResult.nextGrants,
        historyRecord: {
          id: historyRecordId,
          ownerUid: input.ownerUid,
          action: input.mutation.action,
          amount: mutationResult.history.amount,
          access: mutationResult.history.access,
          dailyLimitOverride: mutationResult.history.dailyLimitOverride,
          grantId: mutationResult.history.grantId,
          expiresAt: mutationResult.history.expiresAt,
          reason: mutationReason,
          note: mutationNote,
          adminUid: input.admin.uid,
          adminEmail: input.admin.email ?? null,
          adminRole: input.admin.role,
          before: buildAssessmentCreditMutationBalanceSnapshot({
            account,
            summary: beforeComputation.summary,
          }),
          after: buildAssessmentCreditMutationBalanceSnapshot({
            account: mutationResult.nextAccount,
            summary: afterComputation.summary,
          }),
          correlationId: creditTraceId,
          routeSource: input.diagnostics?.source ?? null,
          commitStatus: "committed",
          createdAt: nowIso,
        },
        nowMs,
      });
    }

    let state: AdminAssessmentCreditState | null = null;
    let postCommitReadError: unknown = null;

    try {
      state = await getAdminAssessmentCreditStateForUser(input.ownerUid, {
        ownerRole: owner.role,
      });
    } catch (error) {
      postCommitReadError = error;
    }

    if (!state && committedFallbackState) {
      if (creditTraceId) {
        logAssessmentCreditDiagnostic({
          event: "assessment_credit_post_commit_read_degraded",
          level: "warn",
          traceId: creditTraceId,
          details: {
            source: input.diagnostics?.source ?? "unknown",
            ownerUid: input.ownerUid,
            actorUid: input.admin.uid,
            action: input.mutation.action,
            fallbackHistoryCount: committedFallbackState.history.length,
          },
          error: postCommitReadError ?? new Error("ASSESSMENT_CREDIT_STATE_UNAVAILABLE"),
        });
      }

      console.warn("Assessment credit post-commit reread degraded; returning committed fallback state.", {
        ownerUid: input.ownerUid,
        actorUid: input.admin.uid,
        action: input.mutation.action,
        postCommitReadError:
          postCommitReadError instanceof Error
            ? postCommitReadError.message
            : postCommitReadError
              ? String(postCommitReadError)
              : "ASSESSMENT_CREDIT_STATE_UNAVAILABLE",
      });
      state = committedFallbackState;
    }

    if (!state) {
      throw (
        postCommitReadError
        ?? new Error("ASSESSMENT_CREDIT_STATE_UNAVAILABLE")
      );
    }

    if (creditTraceId) {
      logAssessmentCreditDiagnostic({
        event: "assessment_credit_persistence_write_succeeded",
        traceId: creditTraceId,
        details: {
          source: input.diagnostics?.source ?? "unknown",
          ownerUid: input.ownerUid,
          actorUid: input.admin.uid,
          action: input.mutation.action,
          beforeRemainingCount: beforeCreditSummary?.remainingCount ?? null,
          afterRemainingCount: afterCreditSummary?.remainingCount ?? null,
          stateRemainingCount: state.credits.remainingCount,
        },
      });
    }

    return state;
  } catch (error) {
    if (creditTraceId) {
      logAssessmentCreditDiagnostic({
        event: "assessment_credit_persistence_write_failed",
        level: "error",
        traceId: creditTraceId,
        details: {
          source: input.diagnostics?.source ?? "unknown",
          ownerUid: input.ownerUid,
          actorUid: input.admin.uid,
          action: input.mutation.action,
          beforeRemainingCount: beforeCreditSummary?.remainingCount ?? null,
          afterRemainingCount: afterCreditSummary?.remainingCount ?? null,
        },
        error,
      });
    }

    throw error;
  }
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

  if (shouldUseDatabase()) {
    await getZootopiaDatabase().runTransaction(async (transaction) => {
      const creditsRef = getZootopiaDatabase()
        .collection(ASSESSMENT_DAILY_CREDITS_COLLECTION)
        .doc(documentId);
      const accountRef = getZootopiaDatabase()
        .collection(ASSESSMENT_CREDIT_ACCOUNTS_COLLECTION)
        .doc(user.uid);
      const grantsQuery = getZootopiaDatabase()
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
      const persistStructuredCreditState = async (
        nextLedger: AssessmentDailyCreditLedgerDocument,
      ) => {
        await syncStructuredAssessmentCreditState({
          sql: transaction.sql,
          account,
          grants,
          ledger: nextLedger,
        });
      };

      if (account.assessmentAccess === "disabled") {
        const nextLedger = {
          ...ledger,
          dailyLimit: computation.dailyLimit,
          pendingReservations: activeReservations,
          updatedAt:
            activeReservations.length !== ledger.pendingReservations.length
            || ledger.dailyLimit !== computation.dailyLimit
              ? nowIso
              : ledger.updatedAt,
        } satisfies AssessmentDailyCreditLedgerDocument;
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
          await transaction.set(
            creditsRef,
            nextLedger,
            { merge: true },
          );
        }

        await persistStructuredCreditState(nextLedger);
        return;
      }

      const hasDailyAvailability = (computation.summary.dailyRemainingCount ?? 0) > 0;
      const hasExtraAvailability = computation.summary.extraCreditsAvailable > 0;

      if (!hasDailyAvailability && !hasExtraAvailability) {
        const nextLedger = {
          ...ledger,
          dailyLimit: computation.dailyLimit,
          pendingReservations: activeReservations,
          updatedAt:
            activeReservations.length !== ledger.pendingReservations.length
            || ledger.dailyLimit !== computation.dailyLimit
              ? nowIso
              : ledger.updatedAt,
        } satisfies AssessmentDailyCreditLedgerDocument;
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
          await transaction.set(
            creditsRef,
            nextLedger,
            { merge: true },
          );
        }

        await persistStructuredCreditState(nextLedger);
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
      const nextLedger = {
        ...ledger,
        dailyLimit: computation.dailyLimit,
        pendingReservations: nextReservations,
        updatedAt: nowIso,
      } satisfies AssessmentDailyCreditLedgerDocument;

      await transaction.set(
        creditsRef,
        nextLedger,
        { merge: true },
      );
      await persistStructuredCreditState(nextLedger);

      summary = buildAssessmentCreditComputation({
        role: user.role,
        dayKey: creditWindow.dayKey,
        resetsAt: creditWindow.resetsAt,
        ledger: nextLedger,
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

  if (shouldUseDatabase()) {
    await getZootopiaDatabase().runTransaction(async (transaction) => {
      const documentRef = getZootopiaDatabase()
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
      const nextLedger = {
        ...ledger,
        pendingReservations: nextReservations,
        updatedAt: nowIso,
      } satisfies AssessmentDailyCreditLedgerDocument;

      if (nextReservations.length === ledger.pendingReservations.length) {
        return;
      }

      await transaction.set(
        documentRef,
        nextLedger,
        { merge: true },
      );
      await syncStructuredAssessmentCreditState({
        sql: transaction.sql,
        ledger: nextLedger,
      });
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
    if (shouldUseDatabase()) {
      await getZootopiaDatabase()
        .collection("assessmentGenerations")
        .doc(normalizedRecord.id)
        .set(omitUndefinedOwnerRole(normalizedRecord), { merge: true });
      await syncAssessmentArtifactMetadataForGeneration({
        generation: normalizedRecord,
      });
    } else {
      getMemoryStore().assessments.set(normalizedRecord.id, normalizedRecord);
      await syncAssessmentArtifactMetadataForGeneration({
        generation: normalizedRecord,
      });
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

  if (shouldUseDatabase()) {
    let credits: AssessmentDailyCreditsSummary | null = null;

    await getZootopiaDatabase().runTransaction(async (transaction) => {
      const generationRef = getZootopiaDatabase()
        .collection("assessmentGenerations")
        .doc(normalizedRecord.id);
      const creditsRef = getZootopiaDatabase()
        .collection(ASSESSMENT_DAILY_CREDITS_COLLECTION)
        .doc(documentId);
      const accountRef = getZootopiaDatabase()
        .collection(ASSESSMENT_CREDIT_ACCOUNTS_COLLECTION)
        .doc(input.user.uid);
      const grantsQuery = getZootopiaDatabase()
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
         once the account is disabled, not only at initial reservation time.
         Admin accounts bypass this check entirely — only a deliberately separate admin-only
         hard block (enforced at the route layer) can deny an admin. */
      const isAdmin = input.user.role === "admin";
      if (!isAdmin && account.assessmentAccess === "disabled") {
        console.warn("[assessment-credit-commit]", {
          event: "assessment-access-disabled-database",
          uid: input.user.uid,
          role: input.user.role,
          assessmentAccess: account.assessmentAccess,
        });
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

      await transaction.set(generationRef, omitUndefinedOwnerRole(normalizedRecord), {
        merge: true,
      });
      await syncAssessmentArtifactMetadataForGeneration({
        generation: normalizedRecord,
        transaction,
      });
      await transaction.set(creditsRef, nextLedger, { merge: true });

      if (
        nextAccount.manualCredits !== account.manualCredits ||
        nextAccount.assessmentAccess !== account.assessmentAccess ||
        nextAccount.dailyLimitOverride !== account.dailyLimitOverride
      ) {
        await transaction.set(
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
          ?? getZootopiaDatabase()
            .collection(ASSESSMENT_CREDIT_GRANTS_COLLECTION)
            .doc(nextGrant.id);
        await transaction.set(
          grantRef,
          {
            ...nextGrant,
            updatedAt: nowIso,
          } satisfies AssessmentCreditGrantRecord,
          { merge: true },
        );
      }
      await syncStructuredAssessmentCreditState({
        sql: transaction.sql,
        account: {
          ...nextAccount,
          updatedAt: nowIso,
        },
        grants: nextGrants,
        ledger: nextLedger,
      });

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
    /* Keep in-memory behavior aligned with durable transaction semantics so admin access toggles
      remain authoritative even when tests/dev run without external persistence runtime.
      Admin accounts bypass this check entirely — only a deliberately separate admin-only
      hard block (enforced at the route layer) can deny an admin.
      Note: input.user.role is typed as UserRole ("admin" | "user") but callers currently
      only pass non-admin users (admins are exempted earlier). The cast ensures the admin
      bypass check compiles correctly even if the caller type narrows to "user". */
  const isMemoryStoreAdmin = (input.user.role as UserRole) === "admin";
  if (!isMemoryStoreAdmin && account.assessmentAccess === "disabled") {
    console.warn("[assessment-credit-commit]", {
      event: "assessment-access-disabled-memory",
      uid: input.user.uid,
      role: input.user.role,
      assessmentAccess: account.assessmentAccess,
    });
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
  await syncAssessmentArtifactMetadataForGeneration({
    generation: normalizedRecord,
  });
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

  if (shouldUseDatabase()) {
    await getZootopiaDatabase()
      .collection("assessmentGenerations")
      .doc(normalizedRecord.id)
      .set(omitUndefinedOwnerRole(normalizedRecord), { merge: true });
    await syncAssessmentArtifactMetadataForGeneration({
      generation: normalizedRecord,
    });
  } else {
    getMemoryStore().assessments.set(normalizedRecord.id, normalizedRecord);
    await syncAssessmentArtifactMetadataForGeneration({
      generation: normalizedRecord,
    });
  }

  return normalizedRecord;
}

export async function listAssessmentGenerationsForUser(ownerUid: string, limit = 20) {
  const resolvedOwnerRole = await resolvePersistedOwnerRole({ ownerUid });

  if (shouldUseDatabase()) {
    const snapshot = await getZootopiaDatabase()
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
  if (shouldUseDatabase()) {
    const snapshot = await getZootopiaDatabase()
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

  if (shouldUseDatabase()) {
    await getZootopiaDatabase()
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

  if (shouldUseDatabase()) {
    const snapshot = await getZootopiaDatabase()
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
  if (shouldUseDatabase()) {
    const snapshot = await getZootopiaDatabase()
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
  if (shouldUseDatabase()) {
    const snapshot = await getZootopiaDatabase()
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
