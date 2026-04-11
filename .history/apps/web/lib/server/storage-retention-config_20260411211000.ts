import "server-only";

/**
 * Centralized storage retention configuration.
 *
 * Env contract (Vercel-compatible, `.env.local` for local dev):
 *
 *   ZOOTOPIA_STORAGE_RETENTION_DAYS
 *     - Integer >= 0. Number of days before uploaded/generated files expire.
 *     - If set to 0, retention is governed solely by ZOOTOPIA_STORAGE_RETENTION_HOURS.
 *     - Default: 3
 *
 *   ZOOTOPIA_STORAGE_RETENTION_HOURS
 *     - Integer >= 0. Additional hours added to the day-based retention.
 *     - Allows sub-day precision (e.g. DAYS=0, HOURS=12 for 12-hour retention).
 *     - Default: 0
 *
 *   ZOOTOPIA_STORAGE_RETENTION_MODE
 *     - "expiry"  — files get an expiresAt timestamp and are cleaned up after that point.
 *     - "none"    — no automatic expiry (files persist until manually deleted).
 *     - Default: "expiry"
 *
 * Total retention = (ZOOTOPIA_STORAGE_RETENTION_DAYS * 24 + ZOOTOPIA_STORAGE_RETENTION_HOURS) hours.
 *
 * Examples:
 *   DAYS=3, HOURS=0  → 72 hours (3 days) — default
 *   DAYS=0, HOURS=12 → 12 hours
 *   DAYS=7, HOURS=0  → 168 hours (1 week)
 *   MODE=none        — no expiry regardless of DAYS/HOURS
 *
 * Vercel deployment: set these env vars in the Vercel project settings.
 * Local development: set in `.env.local`.
 */

type RetentionMode = "expiry" | "none";

export type StorageRetentionConfig = {
  mode: RetentionMode;
  totalMs: number;
  totalDays: number;
  totalHours: number;
  envSource: {
    daysRaw: string | undefined;
    hoursRaw: string | undefined;
    modeRaw: string | undefined;
  };
};

const DEFAULT_RETENTION_DAYS = 3;
const DEFAULT_RETENTION_HOURS = 0;
const DEFAULT_RETENTION_MODE: RetentionMode = "expiry";

const DAYS_ENV_KEY = "ZOOTOPIA_STORAGE_RETENTION_DAYS";
const HOURS_ENV_KEY = "ZOOTOPIA_STORAGE_RETENTION_HOURS";
const MODE_ENV_KEY = "ZOOTOPIA_STORAGE_RETENTION_MODE";

function parseNonNegativeInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function parseRetentionMode(raw: string | undefined): RetentionMode {
  if (raw === undefined || raw.trim() === "") return DEFAULT_RETENTION_MODE;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "none") return "none";
  if (normalized === "expiry") return "expiry";
  // Unknown values fall back to default with a warning.
  console.warn(
    `[storage-retention-config] Unknown ZOOTOPIA_STORAGE_RETENTION_MODE "${raw}", falling back to "${DEFAULT_RETENTION_MODE}".`,
  );
  return DEFAULT_RETENTION_MODE;
}

/**
 * Read the active storage retention configuration from environment variables.
 * This is the single source of truth for retention policy across the app.
 */
export function getStorageRetentionConfig(): StorageRetentionConfig {
  const daysRaw = process.env[DAYS_ENV_KEY];
  const hoursRaw = process.env[HOURS_ENV_KEY];
  const modeRaw = process.env[MODE_ENV_KEY];

  const days = parseNonNegativeInt(daysRaw, DEFAULT_RETENTION_DAYS);
  const hours = parseNonNegativeInt(hoursRaw, DEFAULT_RETENTION_HOURS);
  const mode = parseRetentionMode(modeRaw);

  const totalHours = days * 24 + hours;
  const totalMs = totalHours * 60 * 60 * 1000;

  return {
    mode,
    totalMs,
    totalDays: days,
    totalHours,
    envSource: {
      daysRaw,
      hoursRaw,
      modeRaw,
    },
  };
}

/**
 * Compute the expiry timestamp for a resource created at the given time.
 * Returns null when retention mode is "none" (no automatic expiry).
 */
export function computeRetentionExpiryTimestamp(createdAt: string): string | null {
  const config = getStorageRetentionConfig();
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
 * Returns false when retention mode is "none".
 */
export function isResourceExpired(input: { createdAt: string; expiresAt?: string | null }): boolean {
  const config = getStorageRetentionConfig();
  if (config.mode === "none") return false;

  // If an explicit expiresAt is stored, honor it.
  if (input.expiresAt && input.expiresAt.trim()) {
    const expiryMs = Date.parse(input.expiresAt);
    if (Number.isFinite(expiryMs)) {
      return Date.now() >= expiryMs;
    }
  }

  // Fall back to computing from createdAt.
  const expiry = computeRetentionExpiryTimestamp(input.createdAt);
  if (!expiry) return false;
  return Date.now() >= Date.parse(expiry);
}

/**
 * Human-readable summary of the active retention policy for admin UI display.
 */
export function getRetentionPolicySummary(): string {
  const config = getStorageRetentionConfig();
  if (config.mode === "none") {
    return "No automatic expiry — files persist until manually deleted.";
  }
  if (config.totalDays > 0 && config.totalHours % 24 === 0) {
    const wholeDays = config.totalHours / 24;
    return `Files expire ${wholeDays} day${wholeDays === 1 ? "" : "s"} after creation.`;
  }
  return `Files expire after ${config.totalHours} hour${config.totalHours === 1 ? "" : "s"}.`;
}