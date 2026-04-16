import type { AssessmentDailyCreditsSummary } from "@zootopia/shared-types";

const ASSESSMENT_CREDIT_CLIENT_DIAGNOSTICS_ENV_KEY =
  process.env.NEXT_PUBLIC_ZOOTOPIA_ASSESSMENT_CREDIT_DIAGNOSTICS;

function readBooleanEnvFlag(value: string | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function isAssessmentCreditClientDiagnosticsEnabled() {
  return readBooleanEnvFlag(ASSESSMENT_CREDIT_CLIENT_DIAGNOSTICS_ENV_KEY);
}

function sanitizeClientDiagnosticValue(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  return value.length > 200 ? `${value.slice(0, 197)}...` : value;
}

function sanitizeClientDiagnosticDetails(details: Record<string, unknown> | undefined) {
  if (!details) {
    return undefined;
  }

  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    payload[key] = sanitizeClientDiagnosticValue(value);
  }

  return payload;
}

export function buildAssessmentCreditClientSummarySnapshot(
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
    remainingCount: summary.remainingCount,
    resetsAt: summary.resetsAt,
  };
}

export function logAssessmentCreditClientDiagnostic(input: {
  event: string;
  details?: Record<string, unknown>;
}) {
  if (
    typeof window === "undefined"
    || !isAssessmentCreditClientDiagnosticsEnabled()
  ) {
    return;
  }

  console.info("[assessment-credit-client]", {
    event: input.event,
    details: sanitizeClientDiagnosticDetails(input.details),
    timestamp: new Date().toISOString(),
  });
}
