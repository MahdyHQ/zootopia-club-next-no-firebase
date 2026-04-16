import "server-only";

import type { AssessmentDailyCreditsSummary } from "@zootopia/shared-types";
import { createHmac, randomUUID } from "node:crypto";

import {
  ASSESSMENT_CREDIT_REALTIME_EVENT,
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

const ASSESSMENT_CREDIT_REALTIME_TOPIC_PREFIX = "assessment-credit";
const ASSESSMENT_CREDIT_REALTIME_TOPIC_VERSION = 1;

function readAssessmentCreditRealtimeSigningSecret() {
  const authSecret = String(process.env.AUTH_SECRET ?? "").trim();
  if (authSecret.length > 0) {
    return authSecret;
  }

  const nextAuthSecret = String(process.env.NEXTAUTH_SECRET ?? "").trim();
  return nextAuthSecret.length > 0 ? nextAuthSecret : null;
}

/* Realtime topics are derived from the authenticated owner UID on the server and signed with the
   same secret family that protects Auth.js cookies. Future agents should preserve this server-only
   derivation so clients never choose cross-user channel topics themselves. */
export function getAssessmentCreditRealtimeTopic(ownerUid: string) {
  const normalizedOwnerUid = String(ownerUid ?? "").trim();
  if (!normalizedOwnerUid) {
    return null;
  }

  const signingSecret = readAssessmentCreditRealtimeSigningSecret();
  if (!signingSecret) {
    return null;
  }

  const topicHash = createHmac("sha256", signingSecret)
    .update(
      `${ASSESSMENT_CREDIT_REALTIME_TOPIC_PREFIX}:v${ASSESSMENT_CREDIT_REALTIME_TOPIC_VERSION}:${normalizedOwnerUid}`,
    )
    .digest("base64url");

  return `${ASSESSMENT_CREDIT_REALTIME_TOPIC_PREFIX}:${topicHash}`;
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
    credits: input.credits,
    eventId,
    emittedAt,
    traceId: traceId ?? null,
  };

  let realtimeStatus: string | null = null;
  let realtimeErrorCode: string | null = null;

  /* Supabase Realtime becomes the cross-instance delivery backbone here. Keep the payload limited
     to the server-owned credit summary plus opaque correlation identifiers so multi-tab delivery
     works without exposing actor/target/admin metadata to normal-user clients. */
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
    const realtimeChannel = supabaseAdminClient.channel(realtimeTopic);

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
