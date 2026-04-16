import type { AssessmentDailyCreditsSummary } from "@zootopia/shared-types";
import { randomUUID } from "node:crypto";

import {
  createAssessmentCreditSummarySignature,
  subscribeAssessmentCreditLiveUpdates,
} from "@/lib/server/assessment-credit-live-updates";
import {
  createAssessmentCreditTraceId,
  logAssessmentCreditDiagnostic,
} from "@/lib/server/assessment-credit-diagnostics";
import { getAssessmentDailyCreditsSummaryForUser } from "@/lib/server/repository";
import { getAuthenticatedSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SSE_RETRY_MS = 3_000;
const SSE_HEARTBEAT_INTERVAL_MS = 15_000;
const SSE_FALLBACK_REFRESH_INTERVAL_MS = 3_000;

function createNoStoreHeaders(input: Record<string, string> = {}) {
  return {
    "Cache-Control": "no-store, no-transform, max-age=0, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    ...input,
  };
}

function formatSseEvent(input: {
  event: string;
  data: unknown;
  id?: string;
}) {
  return `${input.id ? `id: ${input.id}\n` : ""}event: ${input.event}\ndata: ${JSON.stringify(input.data)}\n\n`;
}

export async function GET(request: Request) {
  const streamRequestId = createAssessmentCreditTraceId();
  const user = await getAuthenticatedSessionUser();
  if (!user) {
    return new Response("Sign in is required for assessments.", {
      status: 401,
      headers: createNoStoreHeaders(),
    });
  }

  logAssessmentCreditDiagnostic({
    event: "assessment_credit_stream_started",
    traceId: streamRequestId,
    details: {
      ownerUid: user.uid,
      route: "/api/assessment/credits/stream",
    },
  });

  let initialCredits: AssessmentDailyCreditsSummary;
  try {
    initialCredits = await getAssessmentDailyCreditsSummaryForUser({
      uid: user.uid,
      role: user.role,
    });
  } catch (error) {
    logAssessmentCreditDiagnostic({
      event: "assessment_credit_stream_initial_summary_failed",
      level: "error",
      traceId: streamRequestId,
      details: {
        ownerUid: user.uid,
        route: "/api/assessment/credits/stream",
      },
      error,
    });

    console.error("[assessment-credit-stream] failed to resolve initial summary", {
      ownerUid: user.uid,
      error: error instanceof Error ? error.name : "UNKNOWN",
    });

    return new Response("Unable to open the assessment credit stream.", {
      status: 503,
      headers: createNoStoreHeaders(),
    });
  }

  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let lastSummarySignature: string | null = null;
      let refreshInFlight = false;

      const closeStream = () => {
        if (closed) {
          return;
        }

        closed = true;
        cleanup?.();

        try {
          controller.close();
        } catch {
          // Ignore close races when the platform or browser already closed the stream.
        }

        logAssessmentCreditDiagnostic({
          event: "assessment_credit_stream_closed",
          traceId: streamRequestId,
          details: {
            ownerUid: user.uid,
            route: "/api/assessment/credits/stream",
          },
        });
      };

      const enqueue = (chunk: string) => {
        if (closed) {
          return;
        }

        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closeStream();
        }
      };

      const emitHeartbeat = () => {
        enqueue(
          formatSseEvent({
            id: randomUUID(),
            event: "heartbeat",
            data: {
              emittedAt: new Date().toISOString(),
            },
          }),
        );
      };

      const emitSummary = (input: {
        credits: AssessmentDailyCreditsSummary;
        source: "initial" | "publish" | "post-subscribe-recheck" | "fallback-refresh";
        traceId?: string | null;
        eventId?: string;
        emittedAt?: string;
      }) => {
        const nextSignature = createAssessmentCreditSummarySignature(input.credits);
        if (nextSignature === lastSummarySignature) {
          return;
        }

        lastSummarySignature = nextSignature;
        const eventId = input.eventId ?? randomUUID();
        const emittedAt = input.emittedAt ?? new Date().toISOString();

        enqueue(
          formatSseEvent({
            id: eventId,
            event: "summary",
            data: {
              credits: input.credits,
              emittedAt,
            },
          }),
        );

        logAssessmentCreditDiagnostic({
          event: "assessment_credit_stream_summary_emitted",
          traceId: input.traceId ?? streamRequestId,
          details: {
            ownerUid: user.uid,
            route: "/api/assessment/credits/stream",
            source: input.source,
            eventId,
            emittedAt,
            summarySignature: nextSignature,
            remainingCount: input.credits.remainingCount,
          },
        });
      };

      const refreshAuthoritativeSummary = async (
        source: "post-subscribe-recheck" | "fallback-refresh",
      ) => {
        if (closed || refreshInFlight) {
          return;
        }

        refreshInFlight = true;
        try {
          const nextCredits = await getAssessmentDailyCreditsSummaryForUser({
            uid: user.uid,
            role: user.role,
          });
          emitSummary({
            credits: nextCredits,
            source,
            traceId: streamRequestId,
          });
        } catch (error) {
          logAssessmentCreditDiagnostic({
            event: "assessment_credit_stream_refresh_failed",
            level: "warn",
            traceId: streamRequestId,
            details: {
              ownerUid: user.uid,
              route: "/api/assessment/credits/stream",
              source,
            },
            error,
          });

          console.warn("[assessment-credit-stream] fallback refresh failed", {
            ownerUid: user.uid,
            error: error instanceof Error ? error.name : "UNKNOWN",
          });
        } finally {
          refreshInFlight = false;
        }
      };

      enqueue(`retry: ${SSE_RETRY_MS}\n\n`);
      emitSummary({
        credits: initialCredits,
        source: "initial",
        traceId: streamRequestId,
      });

      const subscription = subscribeAssessmentCreditLiveUpdates({
        ownerUid: user.uid,
        emit: (update) => {
          emitSummary({
            credits: update.credits,
            source: "publish",
            traceId: update.traceId ?? streamRequestId,
            eventId: update.eventId,
            emittedAt: update.emittedAt,
          });
        },
      });

      logAssessmentCreditDiagnostic({
        event: "assessment_credit_stream_subscribed",
        traceId: streamRequestId,
        details: {
          ownerUid: user.uid,
          route: "/api/assessment/credits/stream",
          listenerCount: subscription.listenerCount,
        },
      });

      /* The initial summary is fetched before subscription to fail fast on broken auth/read state.
         Immediately rechecking after subscription closes the tiny publish gap where an admin
         mutation could otherwise land between the initial fetch and live-listener registration. */
      void refreshAuthoritativeSummary("post-subscribe-recheck");

      const heartbeatInterval = setInterval(() => {
        emitHeartbeat();
      }, SSE_HEARTBEAT_INTERVAL_MS);

      const refreshInterval = setInterval(async () => {
        await refreshAuthoritativeSummary("fallback-refresh");
      }, SSE_FALLBACK_REFRESH_INTERVAL_MS);

      const abortHandler = () => {
        closeStream();
      };

      request.signal.addEventListener("abort", abortHandler, { once: true });

      cleanup = () => {
        clearInterval(heartbeatInterval);
        clearInterval(refreshInterval);
        subscription.unsubscribe();
        request.signal.removeEventListener("abort", abortHandler);
      };
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: createNoStoreHeaders({
      "Content-Type": "text/event-stream; charset=utf-8",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    }),
  });
}
