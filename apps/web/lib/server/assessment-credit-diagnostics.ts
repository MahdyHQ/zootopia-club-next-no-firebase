import "server-only";

import type { AssessmentDailyCreditsSummary } from "@zootopia/shared-types";
import { randomUUID } from "node:crypto";

const ASSESSMENT_CREDIT_DIAGNOSTICS_ENV_KEY =
  "ZOOTOPIA_ASSESSMENT_CREDIT_DIAGNOSTICS";

type AssessmentCreditDiagnosticLevel = "info" | "warn" | "error";

type AssessmentCreditDiagnosticError = {
  code: string | null;
  name: string;
  message: string;
};

function readBooleanEnvFlag(value: string | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function isAssessmentCreditDiagnosticsEnabled() {
  return readBooleanEnvFlag(
    process.env[ASSESSMENT_CREDIT_DIAGNOSTICS_ENV_KEY],
  );
}

function readErrorCode(error: unknown) {
  if (typeof error !== "object" || !error || !("code" in error)) {
    return null;
  }

  const value = (error as { code?: unknown }).code;
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function classifyAssessmentCreditError(
  error: unknown,
): AssessmentCreditDiagnosticError {
  return {
    code: readErrorCode(error),
    name: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error ? error.message : String(error ?? "UNKNOWN"),
  };
}

function sanitizeDiagnosticValue(key: string, value: unknown): unknown {
  const normalizedKey = key.toLowerCase();

  if (
    normalizedKey.includes("token")
    || normalizedKey.includes("secret")
    || normalizedKey.includes("password")
    || normalizedKey.includes("authorization")
  ) {
    return "[redacted]";
  }

  if (typeof value === "string") {
    return value.length > 200 ? `${value.slice(0, 197)}...` : value;
  }

  return value;
}

function sanitizeDiagnosticDetails(details: Record<string, unknown> | undefined) {
  if (!details) {
    return undefined;
  }

  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    payload[key] = sanitizeDiagnosticValue(key, value);
  }

  return payload;
}

export function createAssessmentCreditTraceId(traceId?: string | null) {
  return String(traceId ?? "").trim() || randomUUID();
}

export function buildAssessmentCreditSummaryDiagnosticSnapshot(
  summary: AssessmentDailyCreditsSummary,
) {
  return {
    applies: summary.applies,
    isAdminExempt: summary.isAdminExempt,
    assessmentAccess: summary.assessmentAccess,
    dayKey: summary.dayKey,
    dailyLimit: summary.dailyLimit,
    usedCount: summary.usedCount,
    manualCreditsAvailable: summary.manualCreditsAvailable,
    grantCreditsAvailable: summary.grantCreditsAvailable,
    extraCreditsAvailable: summary.extraCreditsAvailable,
    activeGrantCount: summary.activeGrantCount,
    remainingCount: summary.remainingCount,
    resetsAt: summary.resetsAt,
  };
}

export function logAssessmentCreditDiagnostic(input: {
  event: string;
  level?: AssessmentCreditDiagnosticLevel;
  traceId?: string | null;
  details?: Record<string, unknown>;
  error?: unknown;
}) {
  const level = input.level ?? "info";
  if (!isAssessmentCreditDiagnosticsEnabled() && level === "info") {
    return;
  }

  const payload = {
    event: input.event,
    traceId: input.traceId ? createAssessmentCreditTraceId(input.traceId) : null,
    details: sanitizeDiagnosticDetails(input.details),
    error: input.error ? classifyAssessmentCreditError(input.error) : undefined,
    timestamp: new Date().toISOString(),
  };

  if (level === "error") {
    console.error("[assessment-credit-diagnostics]", payload);
    return;
  }

  if (level === "warn") {
    console.warn("[assessment-credit-diagnostics]", payload);
    return;
  }

  console.info("[assessment-credit-diagnostics]", payload);
}
