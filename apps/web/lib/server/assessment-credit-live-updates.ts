import "server-only";

import type { AssessmentDailyCreditsSummary } from "@zootopia/shared-types";
import { randomUUID } from "node:crypto";

import {
  ASSESSMENT_CREDIT_REALTIME_EVENT,
  buildAssessmentCreditPrivateTopic,
  type AssessmentCreditRealtimePayload,
} from "@/lib/assessment-credit-realtime";
import {
  createAssessmentCreditTraceId,
  logAssessmentCreditDiagnostic,
} from "@/lib/server/assessment-credit-diagnostics";
import {
  getSupabaseAdminClient,
  hasSupabaseAdminRuntime,
} from "@/lib/server/supabase-admin";

/* Private Realtime channels use an owner-scoped topic contract (`assessment-credit:owner:{uid}`)
   so database RLS policies can verify `auth.uid()` against the topic itself. Keep this topic shape
   stable across publisher + subscriber code and Supabase migration policy logic. */
export function getAssessmentCreditRealtimeTopic(ownerUid: string) {
  return buildAssessmentCreditPrivateTopic(ownerUid);
}

export async function publishAssessmentCreditLiveUpdate(input: {
  ownerUid: string;
  credits: AssessmentDailyCreditsSummary;
  reason: string;
  traceId?: string | null;
}) {
  const traceId = input.traceId
    ? createAssessmentCreditTraceId(input.traceId)
    : null;
  const eventId = randomUUID();
  const emittedAt = new Date().toISOString();
  const realtimeTopic = getAssessmentCreditRealtimeTopic(input.ownerUid);
  const realtimePayload: AssessmentCreditRealtimePayload = {
    eventId,
    emittedAt,
    traceId: traceId ?? null,
  };

  let realtimeStatus: string | null = null;
  let realtimeErrorCode: string | null = null;

  /* Supabase Realtime becomes the cross-instance delivery backbone here, but delivery stays
     invalidation-only. Keep the payload limited to opaque correlation identifiers so browser
     clients must re-read canonical `/api/assessment/credits` instead of applying broadcast data
     directly and risking header/studio drift during concurrent mutations. */
  if (!realtimeTopic) {
    realtimeStatus = "topic_unavailable";
    logAssessmentCreditDiagnostic({
      event: "assessment_credit_realtime_publish_skipped",
      level: "warn",
      traceId,
      details: {
        ownerUid: input.ownerUid,
        reason: input.reason,
        eventId,
        emittedAt,
        skipReason: realtimeStatus,
      },
    });
  } else if (!hasSupabaseAdminRuntime()) {
    realtimeStatus = "supabase_admin_runtime_missing";
    logAssessmentCreditDiagnostic({
      event: "assessment_credit_realtime_publish_skipped",
      level: "warn",
      traceId,
      details: {
        ownerUid: input.ownerUid,
        reason: input.reason,
        eventId,
        emittedAt,
        skipReason: realtimeStatus,
      },
    });
  } else {
    logAssessmentCreditDiagnostic({
      event: "assessment_credit_realtime_publish_attempted",
      traceId,
      details: {
        ownerUid: input.ownerUid,
        reason: input.reason,
        eventId,
        emittedAt,
        remainingCount: input.credits.remainingCount,
      },
    });

    const supabaseAdminClient = getSupabaseAdminClient();
    const realtimeChannel = supabaseAdminClient.channel(realtimeTopic, {
      config: {
        private: true,
        broadcast: {
          self: false,
        },
      },
    });

    try {
      const result = await realtimeChannel.send({
        type: "broadcast",
        event: ASSESSMENT_CREDIT_REALTIME_EVENT,
        payload: realtimePayload,
      });
      realtimeStatus = String(result ?? "unknown");
    } catch (error) {
      realtimeStatus = "error";
      realtimeErrorCode =
        typeof error === "object"
        && error !== null
        && "code" in error
        && typeof (error as { code?: unknown }).code === "string"
          ? ((error as { code?: string }).code ?? null)
          : null;

      logAssessmentCreditDiagnostic({
        event: "assessment_credit_realtime_publish_failed",
        level: "warn",
        traceId,
        details: {
          ownerUid: input.ownerUid,
          reason: input.reason,
          eventId,
          emittedAt,
        },
        error,
      });
    } finally {
      void supabaseAdminClient.removeChannel(realtimeChannel);
    }

    logAssessmentCreditDiagnostic({
      event: "assessment_credit_realtime_publish_result",
      traceId,
      details: {
        ownerUid: input.ownerUid,
        reason: input.reason,
        eventId,
        emittedAt,
        status: realtimeStatus,
        errorCode: realtimeErrorCode,
        remainingCount: input.credits.remainingCount,
      },
    });
  }

  return {
    eventId,
    emittedAt,
    broadcast: {
      status: realtimeStatus,
      errorCode: realtimeErrorCode,
    },
  };
}
