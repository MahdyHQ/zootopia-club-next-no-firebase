import "server-only";

import type {
  AssessmentGeneration,
  AssessmentGenerationStatus,
} from "@zootopia/shared-types";
import {
  buildAssessmentPreviewRoute,
  buildAssessmentResultRoute,
} from "@/lib/assessment-routes";
import {
  computeRetentionExpiryTimestamp,
  getStorageRetentionConfig,
} from "@/lib/server/storage-retention-config";

/* Retention is now driven by env variables (ZOOTOPIA_STORAGE_RETENTION_DAYS/HOURS/MODE).
   The helpers below delegate to the centralized storage-retention-config module so
   assessment expiry stays consistent with upload/document retention policy. */

export { buildAssessmentPreviewRoute, buildAssessmentResultRoute };

function toTimestamp(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}

/**
 * Returns the active retention window in milliseconds.
 * Driven by ZOOTOPIA_STORAGE_RETENTION_DAYS + ZOOTOPIA_STORAGE_RETENTION_HOURS.
 */
export function getAssessmentRetentionWindowMs() {
  const config = getStorageRetentionConfig();
  return config.totalMs;
}

/**
 * Compute the expiry timestamp for an assessment created at the given time.
 * Delegates to the centralized env-driven retention config.
 * Returns null when retention mode is "none".
 */
export function getRetentionExpiryTimestamp(createdAt: string): string | null {
  return computeRetentionExpiryTimestamp(createdAt);
}

/**
 * Compute the expiry timestamp for an assessment created at the given time.
 * Always returns a string timestamp (never null) to satisfy AssessmentGeneration.expiresAt.
 * When retention mode is "none", returns a far-future expiry date (1 year from now).
 */
export function getAssessmentExpiryTimestamp(createdAt: string): string {
  const result = getRetentionExpiryTimestamp(createdAt);
  if (result !== null) {
    return result;
  }
  // Retention mode "none" — return far-future expiry (1 year)
  return new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
}

export function getAssessmentStatus(input: {
  createdAt: string;
  expiresAt?: string | null;
  status?: AssessmentGenerationStatus | null;
}) {
  const computedExpiry = getAssessmentExpiryTimestamp(input.createdAt);
  const expiresAt =
    input.expiresAt && input.expiresAt.trim()
      ? input.expiresAt
      : (computedExpiry ?? new Date(Date.now() + getAssessmentRetentionWindowMs()).toISOString());

  if (input.status === "expired") {
    return {
      status: "expired" as const,
      expiresAt,
    };
  }

  return {
    status: Date.now() >= toTimestamp(expiresAt) ? ("expired" as const) : ("ready" as const),
    expiresAt,
  };
}

export function isAssessmentExpired(record: Pick<
  AssessmentGeneration,
  "createdAt" | "expiresAt" | "status"
>) {
  return getAssessmentStatus(record).status === "expired";
}
