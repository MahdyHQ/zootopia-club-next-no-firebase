import "server-only";

import type { AssessmentDailyCreditsSummary } from "@zootopia/shared-types";
import { randomUUID } from "node:crypto";

import {
  createAssessmentCreditTraceId,
  logAssessmentCreditDiagnostic,
} from "@/lib/server/assessment-credit-diagnostics";

type AssessmentCreditLiveUpdate = {
  credits: AssessmentDailyCreditsSummary;
  eventId: string;
  emittedAt: string;
  traceId: string | null;
};

type AssessmentCreditLiveListener = {
  id: string;
  emit: (update: AssessmentCreditLiveUpdate) => void;
};

type AssessmentCreditLiveRegistry = Map<string, Map<string, AssessmentCreditLiveListener>>;

declare global {
  var __ZOOTOPIA_ASSESSMENT_CREDIT_LIVE_REGISTRY__: AssessmentCreditLiveRegistry | undefined;
}

function getAssessmentCreditLiveRegistry() {
  if (!globalThis.__ZOOTOPIA_ASSESSMENT_CREDIT_LIVE_REGISTRY__) {
    globalThis.__ZOOTOPIA_ASSESSMENT_CREDIT_LIVE_REGISTRY__ = new Map();
  }

  return globalThis.__ZOOTOPIA_ASSESSMENT_CREDIT_LIVE_REGISTRY__;
}

/* This registry only bridges live SSE listeners that currently share the same Node.js instance.
   It is intentionally best-effort: the stream route also performs periodic server-truth rechecks
   so Vercel multi-instance traffic still converges without trusting process memory as authority. */
export function subscribeAssessmentCreditLiveUpdates(input: {
  ownerUid: string;
  emit: (update: AssessmentCreditLiveUpdate) => void;
}) {
  const registry = getAssessmentCreditLiveRegistry();
  const listenerId = randomUUID();
  const listenersForOwner = registry.get(input.ownerUid) ?? new Map<string, AssessmentCreditLiveListener>();

  listenersForOwner.set(listenerId, {
    id: listenerId,
    emit: input.emit,
  });
  registry.set(input.ownerUid, listenersForOwner);

  return {
    listenerCount: listenersForOwner.size,
    unsubscribe: () => {
      const activeListeners = registry.get(input.ownerUid);
      if (!activeListeners) {
        return;
      }

      activeListeners.delete(listenerId);
      if (activeListeners.size === 0) {
        registry.delete(input.ownerUid);
      }
    },
  };
}

/* SSE streams dedupe against a stable signature of the exact server-owned summary shape.
   Keep this aligned with `/api/assessment/credits` so push delivery and pull refresh compare the
   same authoritative fields instead of drifting on partial client-side heuristics. */
export function createAssessmentCreditSummarySignature(
  summary: AssessmentDailyCreditsSummary,
) {
  return JSON.stringify([
    summary.applies,
    summary.isAdminExempt,
    summary.assessmentAccess,
    summary.dayKey,
    summary.dailyDefaultLimit,
    summary.dailyLimit,
    summary.dailyLimitSource,
    summary.usedCount,
    summary.dailyRemainingCount,
    summary.manualCreditsAvailable,
    summary.grantCreditsAvailable,
    summary.extraCreditsAvailable,
    summary.activeGrantCount,
    summary.totalRemainingCount,
    summary.remainingCount,
    summary.resetsAt,
  ]);
}

export function publishAssessmentCreditLiveUpdate(input: {
  ownerUid: string;
  credits: AssessmentDailyCreditsSummary;
  reason: string;
  traceId?: string | null;
}) {
  const listenersForOwner = getAssessmentCreditLiveRegistry().get(input.ownerUid);
  const traceId = input.traceId
    ? createAssessmentCreditTraceId(input.traceId)
    : null;
  const eventId = randomUUID();
  const emittedAt = new Date().toISOString();
  const listenerCount = listenersForOwner?.size ?? 0;

  logAssessmentCreditDiagnostic({
    event: "assessment_credit_sse_publish_attempted",
    traceId,
    details: {
      ownerUid: input.ownerUid,
      reason: input.reason,
      listenerCount,
      summarySignature: createAssessmentCreditSummarySignature(input.credits),
      remainingCount: input.credits.remainingCount,
    },
  });

  if (!listenersForOwner || listenersForOwner.size === 0) {
    return {
      eventId,
      emittedAt,
      listenerCount,
      deliveredCount: 0,
    };
  }

  const failedListenerIds: string[] = [];
  let deliveredCount = 0;

  for (const listener of listenersForOwner.values()) {
    try {
      listener.emit({
        credits: input.credits,
        eventId,
        emittedAt,
        traceId,
      });
      deliveredCount += 1;
    } catch (error) {
      failedListenerIds.push(listener.id);
      console.warn("[assessment-credit-live] failed to emit live update", {
        ownerUid: input.ownerUid,
        reason: input.reason,
        error: error instanceof Error ? error.name : "UNKNOWN",
      });
    }
  }

  if (failedListenerIds.length > 0) {
    for (const listenerId of failedListenerIds) {
      listenersForOwner.delete(listenerId);
    }

    if (listenersForOwner.size === 0) {
      getAssessmentCreditLiveRegistry().delete(input.ownerUid);
    }
  }

  logAssessmentCreditDiagnostic({
    event: "assessment_credit_sse_publish_result",
    traceId,
    details: {
      ownerUid: input.ownerUid,
      reason: input.reason,
      eventId,
      emittedAt,
      listenerCount,
      deliveredCount,
      failedListenerCount: failedListenerIds.length,
      remainingCount: input.credits.remainingCount,
    },
  });

  return {
    eventId,
    emittedAt,
    listenerCount,
    deliveredCount,
  };
}
