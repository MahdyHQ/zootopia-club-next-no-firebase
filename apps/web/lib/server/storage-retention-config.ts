import "server-only";

/**
 * Centralized storage retention configuration.
 *
 * Per-storage-type env contract (Vercel-compatible, `.env.local` for local dev):
 *
 *   ZOOTOPIA_UPLOAD_RETENTION_MINUTES
 *     - Integer >= 0. Retention for uploaded source files (`documents/*`, `uploads/temp/*`).
 *     - Default: 15
 *
 *   ZOOTOPIA_RESULT_RETENTION_MINUTES
 *     - Integer >= 0. Retention for generated result artifacts (`assessment-results/*`).
 *     - Default: 1440 (1 day)
 *
 *   ZOOTOPIA_EXPORT_RETENTION_MINUTES
 *     - Integer >= 0. Retention for exported artifacts (`assessment-exports/*`).
 *     - Default: 15
 *
 * Optional per-type mode keys:
 *   ZOOTOPIA_UPLOAD_RETENTION_MODE, ZOOTOPIA_RESULT_RETENTION_MODE,
 *   ZOOTOPIA_EXPORT_RETENTION_MODE
 *     - "expiry" (default): compute expiresAt and enforce cleanup.
 *     - "none": no automatic expiry for that storage type.
 *
 * Backward compatibility fallback (legacy global contract):
 *   ZOOTOPIA_STORAGE_RETENTION_DAYS
 *   ZOOTOPIA_STORAGE_RETENTION_HOURS
 *   ZOOTOPIA_STORAGE_RETENTION_MODE
 *
 * If per-type minutes are missing, legacy global days/hours are used.
 */

type RetentionMode = "expiry" | "none";
export type StorageRetentionScope = "uploads" | "results" | "exports";

const STORAGE_RETENTION_SCOPES = [
  "uploads",
  "results",
  "exports",
] as const satisfies readonly StorageRetentionScope[];

export type StorageRetentionConfig = {
  scope: StorageRetentionScope;
  mode: RetentionMode;
  totalMs: number;
  totalMinutes: number;
  totalDays: number;
  totalHours: number;
  envSource: {
    minutesRaw: string | undefined;
    scopedModeRaw: string | undefined;
    globalModeRaw: string | undefined;
    legacyDaysRaw: string | undefined;
    legacyHoursRaw: string | undefined;
  };
};

const DEFAULT_RETENTION_MINUTES: Record<StorageRetentionScope, number> = {
  uploads: 15,
  results: 24 * 60,
  exports: 15,
};
const DEFAULT_RETENTION_MODE: RetentionMode = "expiry";

const SCOPE_MINUTES_ENV_KEYS: Record<StorageRetentionScope, string> = {
  uploads: "ZOOTOPIA_UPLOAD_RETENTION_MINUTES",
  results: "ZOOTOPIA_RESULT_RETENTION_MINUTES",
  exports: "ZOOTOPIA_EXPORT_RETENTION_MINUTES",
};

const SCOPE_MODE_ENV_KEYS: Record<StorageRetentionScope, string> = {
  uploads: "ZOOTOPIA_UPLOAD_RETENTION_MODE",
  results: "ZOOTOPIA_RESULT_RETENTION_MODE",
  exports: "ZOOTOPIA_EXPORT_RETENTION_MODE",
};

const LEGACY_DAYS_ENV_KEY = "ZOOTOPIA_STORAGE_RETENTION_DAYS";
const LEGACY_HOURS_ENV_KEY = "ZOOTOPIA_STORAGE_RETENTION_HOURS";
const LEGACY_MODE_ENV_KEY = "ZOOTOPIA_STORAGE_RETENTION_MODE";

function parseNonNegativeInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function parseRetentionMode(raw: string | undefined, sourceLabel: string): RetentionMode {
  if (raw === undefined || raw.trim() === "") return DEFAULT_RETENTION_MODE;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "none") return "none";
  if (normalized === "expiry") return "expiry";
  // Unknown values fall back to default with a warning.
  console.warn(
    `[storage-retention-config] Unknown ${sourceLabel} value "${raw}", falling back to "${DEFAULT_RETENTION_MODE}".`,
  );
  return DEFAULT_RETENTION_MODE;
}

function parseLegacyRetentionMinutes() {
  const legacyDaysRaw = process.env[LEGACY_DAYS_ENV_KEY];
  const legacyHoursRaw = process.env[LEGACY_HOURS_ENV_KEY];
  const days = parseNonNegativeInt(legacyDaysRaw, 0);
  const hours = parseNonNegativeInt(legacyHoursRaw, 0);

  return {
    legacyDaysRaw,
    legacyHoursRaw,
    totalMinutes: days * 24 * 60 + hours * 60,
  };
}

export function resolveStorageRetentionScopeFromNamespace(
  namespace: string,
): StorageRetentionScope {
  if (namespace === "assessment-results") {
    return "results";
  }

  if (namespace === "assessment-exports") {
    return "exports";
  }

  // uploads/temp and documents are both source-upload classes.
  return "uploads";
}

/**
 * Read active retention config for one storage scope.
 */
export function getStorageRetentionConfig(
  scope: StorageRetentionScope,
): StorageRetentionConfig {
  const minutesKey = SCOPE_MINUTES_ENV_KEYS[scope];
  const scopedModeKey = SCOPE_MODE_ENV_KEYS[scope];

  const minutesRaw = process.env[minutesKey];
  const scopedModeRaw = process.env[scopedModeKey];
  const globalModeRaw = process.env[LEGACY_MODE_ENV_KEY];

  const legacy = parseLegacyRetentionMinutes();
  const fallbackMinutes =
    legacy.totalMinutes > 0
      ? legacy.totalMinutes
      : DEFAULT_RETENTION_MINUTES[scope];
  const totalMinutes = parseNonNegativeInt(minutesRaw, fallbackMinutes);
  const mode = parseRetentionMode(
    scopedModeRaw ?? globalModeRaw,
    scopedModeRaw ? scopedModeKey : LEGACY_MODE_ENV_KEY,
  );

  const totalHours = totalMinutes / 60;
  const totalDays = totalHours / 24;
  const totalMs = totalMinutes * 60 * 1000;

  return {
    scope,
    mode,
    totalMs,
    totalMinutes,
    totalDays,
    totalHours,
    envSource: {
      minutesRaw,
      scopedModeRaw,
      globalModeRaw,
      legacyDaysRaw: legacy.legacyDaysRaw,
      legacyHoursRaw: legacy.legacyHoursRaw,
    },
  };
}

export function getAllStorageRetentionConfigs() {
  return STORAGE_RETENTION_SCOPES.map((scope) => getStorageRetentionConfig(scope));
}

/**
 * Compute the expiry timestamp for a resource created at the given time.
 * Returns null when retention mode is "none" for that scope.
 */
export function computeRetentionExpiryTimestamp(
  createdAt: string,
  scope: StorageRetentionScope,
): string | null {
  const config = getStorageRetentionConfig(scope);
  if (config.mode === "none") return null;

  const createdMs = Date.parse(createdAt);
  if (!Number.isFinite(createdMs)) {
    // Fallback to now if createdAt is unparseable.
    return new Date(Date.now() + config.totalMs).toISOString();
  }

  return new Date(createdMs + config.totalMs).toISOString();
}

/**
 * Check whether a resource has expired based on its createdAt and the active retention config.
 * Returns false when retention mode is "none" for that scope.
 */
export function isResourceExpired(
  input: { createdAt: string; expiresAt?: string | null },
  scope: StorageRetentionScope,
): boolean {
  const config = getStorageRetentionConfig(scope);
  if (config.mode === "none") return false;

  // If an explicit expiresAt is stored, honor it.
  if (input.expiresAt && input.expiresAt.trim()) {
    const expiryMs = Date.parse(input.expiresAt);
    if (Number.isFinite(expiryMs)) {
      return Date.now() >= expiryMs;
    }
  }

  // Fall back to computing from createdAt.
  const expiry = computeRetentionExpiryTimestamp(input.createdAt, scope);
  if (!expiry) return false;
  return Date.now() >= Date.parse(expiry);
}

/**
 * Human-readable summary of one active retention policy for admin UI display.
 */
export function getRetentionPolicySummary(scope: StorageRetentionScope): string {
  const config = getStorageRetentionConfig(scope);
  if (config.mode === "none") {
    return "No automatic expiry - files persist until manually deleted.";
  }
  if (config.totalMinutes % (24 * 60) === 0) {
    const wholeDays = config.totalMinutes / (24 * 60);
    return `Files expire ${wholeDays} day${wholeDays === 1 ? "" : "s"} after creation.`;
  }

  if (config.totalMinutes % 60 === 0) {
    const wholeHours = config.totalMinutes / 60;
    return `Files expire after ${wholeHours} hour${wholeHours === 1 ? "" : "s"}.`;
  }

  return `Files expire after ${config.totalMinutes} minute${config.totalMinutes === 1 ? "" : "s"}.`;
}

export function getAllRetentionPolicySummaries() {
  return {
    uploads: getRetentionPolicySummary("uploads"),
    results: getRetentionPolicySummary("results"),
    exports: getRetentionPolicySummary("exports"),
  } as const;
}