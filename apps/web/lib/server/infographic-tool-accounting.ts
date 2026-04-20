import "server-only";

import type { InfographicGeneration, UserRole } from "@zootopia/shared-types";

import {
  recordToolAccountingEntry,
  recordToolUsageEvent,
  type ToolAccountingSqlExecutor,
} from "@/lib/server/tool-accounting";

export function recordInfographicGenerationUsageEvent(input: {
  ownerUid: string;
  ownerEmail?: string | null;
  ownerRole: UserRole;
  generation: Pick<InfographicGeneration, "id" | "createdAt" | "modelId">;
  documentId?: string | null;
}) {
  /* Infographic is an admin-only tool today, but it still emits its own tool-scoped usage
     event into the shared ledger. Keep this separate from assessment credit logic so future
     infographic quotas can evolve without reusing assessment-specific accounting semantics. */
  return recordToolUsageEvent({
    id: `infographic-generation-usage:${input.generation.id}`,
    ownerUid: input.ownerUid,
    ownerEmail: input.ownerEmail ?? null,
    ownerRole: input.ownerRole,
    toolId: "infographic",
    eventKind: "generation",
    dayKey: input.generation.createdAt.slice(0, 10),
    generationId: input.generation.id,
    metadata: {
      modelId: input.generation.modelId,
      documentId: input.documentId ?? null,
    },
  });
}

export function recordInfographicGenerationAccountingDeduction(input: {
  sql?: ToolAccountingSqlExecutor;
  ownerUid: string;
  ownerEmail?: string | null;
  ownerRole: UserRole;
  generation: Pick<InfographicGeneration, "id" | "createdAt" | "modelId">;
  documentId?: string | null;
  actorUid: string;
  actorEmail?: string | null;
  actorRole: UserRole;
}) {
  /* Infographic has no assessment-style credit wallet today. This entry records one durable
     platform generation unit for the infographic tool only, so global aggregation has a
     structured accounting source even if the best-effort usage-event write is unavailable. */
  return recordToolAccountingEntry({
    id: `infographic-generation-deduction:${input.generation.id}`,
    sql: input.sql,
    ownerUid: input.ownerUid,
    ownerEmail: input.ownerEmail ?? null,
    ownerRole: input.ownerRole,
    toolId: "infographic",
    entryKind: "deduction",
    amount: 1,
    eventKind: "generation",
    generationId: input.generation.id,
    dayKey: input.generation.createdAt.slice(0, 10),
    actorUid: input.actorUid,
    actorEmail: input.actorEmail ?? null,
    actorRole: input.actorRole,
    metadata: {
      modelId: input.generation.modelId,
      documentId: input.documentId ?? null,
      accountingScope: "platform-generation-unit",
    },
  });
}
