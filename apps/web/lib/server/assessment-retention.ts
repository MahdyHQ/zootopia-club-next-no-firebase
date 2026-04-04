import "server-only";

import type {
  AssessmentGeneration,
  AssessmentGenerationStatus,
} from "@zootopia/shared-types";
import {
  buildAssessmentPreviewRoute,
  buildAssessmentResultRoute,
} from "@/lib/assessment-routes";

const ASSESSMENT_RETENTION_WINDOW_MS = 1000 * 60 * 60 * 24 * 3;

export { buildAssessmentPreviewRoute, buildAssessmentResultRoute };

function toTimestamp(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}

export function getAssessmentRetentionWindowMs() {
  return ASSESSMENT_RETENTION_WINDOW_MS;
}

export function getRetentionExpiryTimestamp(createdAt: string) {
  return new Date(toTimestamp(createdAt) + ASSESSMENT_RETENTION_WINDOW_MS).toISOString();
}

export function getAssessmentExpiryTimestamp(createdAt: string) {
  return getRetentionExpiryTimestamp(createdAt);
}

export function getAssessmentStatus(input: {
  createdAt: string;
  expiresAt?: string | null;
  status?: AssessmentGenerationStatus | null;
}) {
  const expiresAt =
    input.expiresAt && input.expiresAt.trim()
      ? input.expiresAt
      : getAssessmentExpiryTimestamp(input.createdAt);

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
