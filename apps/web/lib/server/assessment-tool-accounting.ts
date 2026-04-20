import "server-only";

import type {
  AdminAssessmentCreditMutationInput,
  AssessmentDailyCreditsSummary,
  ToolAccountingEntryKind,
  UserRole,
} from "@zootopia/shared-types";

import { buildPlatformDailyUsageForUser } from "@/lib/server/platform-usage-aggregation";
import {
  recordToolAccountingEntry,
  recordToolUsageEvent,
  type ToolAccountingSqlExecutor,
} from "@/lib/server/tool-accounting";

function mapAssessmentCreditMutationToToolAccountingEntryKind(
  action: AdminAssessmentCreditMutationInput["action"],
): ToolAccountingEntryKind {
  switch (action) {
    case "grant_credits":
    case "add_manual_credits":
      return "grant";
    case "subtract_manual_credits":
    case "revoke_grant":
      return "deduction";
    default:
      return "adjustment";
  }
}

export async function buildAssessmentPlatformDailyUsageForUser(input: {
  user: {
    uid: string;
    role: UserRole;
    email?: string | null;
  };
  creditWindow: Pick<AssessmentDailyCreditsSummary, "dayKey" | "resetsAt">;
}) {
  /* Assessment keeps its own quota/reservation tables, but the platform-wide cap is now
     intentionally derived by the shared aggregation layer. Future agents should not move
     infographic or future-tool counting back into the assessment credit engine. */
  return buildPlatformDailyUsageForUser({
    user: input.user,
    dayKey: input.creditWindow.dayKey,
    resetsAt: input.creditWindow.resetsAt,
  });
}

export function recordAssessmentGenerationUsageEvent(input: {
  ownerUid: string;
  ownerEmail?: string | null;
  ownerRole: UserRole;
  dayKey: string;
  generationId: string;
  metadata?: Record<string, unknown> | null;
}) {
  return recordToolUsageEvent({
    id: `assessment-generation-usage:${input.generationId}`,
    ownerUid: input.ownerUid,
    ownerEmail: input.ownerEmail ?? null,
    ownerRole: input.ownerRole,
    toolId: "assessment",
    eventKind: "generation",
    dayKey: input.dayKey,
    generationId: input.generationId,
    metadata: input.metadata ?? null,
  });
}

export function recordAssessmentGenerationAccountingDeduction(input: {
  sql?: ToolAccountingSqlExecutor;
  ownerUid: string;
  ownerEmail?: string | null;
  ownerRole: UserRole;
  dayKey: string;
  generationId: string;
  reservationId: string;
  reservationSource: string;
  actorUid: string;
  actorEmail?: string | null;
  actorRole: UserRole;
}) {
  /* This is the assessment tool's credit output into the shared accounting ledger. The
     deterministic id keeps retries/idempotency from double-counting the same saved generation
     while assessment_daily_credits remains the assessment-specific balance authority. */
  return recordToolAccountingEntry({
    id: `assessment-generation-deduction:${input.generationId}`,
    sql: input.sql,
    ownerUid: input.ownerUid,
    ownerEmail: input.ownerEmail ?? null,
    ownerRole: input.ownerRole,
    toolId: "assessment",
    entryKind: "deduction",
    amount: 1,
    eventKind: "generation",
    generationId: input.generationId,
    dayKey: input.dayKey,
    actorUid: input.actorUid,
    actorEmail: input.actorEmail ?? null,
    actorRole: input.actorRole,
    metadata: {
      reservationId: input.reservationId,
      reservationSource: input.reservationSource,
    },
  });
}

export function recordAssessmentAdminAccountingMutation(input: {
  sql?: ToolAccountingSqlExecutor;
  historyRecordId: string;
  ownerUid: string;
  ownerEmail?: string | null;
  ownerRole: UserRole;
  action: AdminAssessmentCreditMutationInput["action"];
  amount: number;
  actorUid: string;
  actorEmail?: string | null;
  actorRole: UserRole;
  correlationId?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  /* Admin mutations remain assessment-domain actions, but each committed grant/adjustment/deduction
     is mirrored into the shared ledger with an assessment-prefixed deterministic id. Keep this
     adapter narrow so future tools add their own mutation adapters instead of sharing assessment
     semantics by accident. */
  return recordToolAccountingEntry({
    id: `assessment-credit-mutation:${input.historyRecordId}`,
    sql: input.sql,
    ownerUid: input.ownerUid,
    ownerEmail: input.ownerEmail ?? null,
    ownerRole: input.ownerRole,
    toolId: "assessment",
    entryKind: mapAssessmentCreditMutationToToolAccountingEntryKind(input.action),
    amount: Math.trunc(input.amount),
    actorUid: input.actorUid,
    actorEmail: input.actorEmail ?? null,
    actorRole: input.actorRole,
    correlationId: input.correlationId ?? null,
    metadata: {
      sourceAction: input.action,
      ...(input.metadata ?? {}),
    },
  });
}
