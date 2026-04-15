import type { AssessmentDailyCreditsSummary } from "@zootopia/shared-types";

import {
  createAssessmentCreditSummarySignature,
  subscribeAssessmentCreditLiveUpdates,
} from "@/lib/server/assessment-credit-live-updates";
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

function formatSseComment(comment: string) {
  return `:${comment}\n\n`;
}

function formatSseEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(request: Request) {
  const user = await getAuthenticatedSessionUser();
  if (!user) {
    return new Response("Sign in is required for assessments.", {
      status: 401,
      headers: createNoStoreHeaders(),
    });
  }

  let initialCredits: AssessmentDailyCreditsSummary;
  try {
    initialCredits = await getAssessmentDailyCreditsSummaryForUser({
      uid: user.uid,
      role: user.role,
    });
  } catch (error) {
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

      const emitSummary = (credits: AssessmentDailyCreditsSummary) => {
        const nextSignature = createAssessmentCreditSummarySignature(credits);
        if (nextSignature === lastSummarySignature) {
          return;
        }

        lastSummarySignature = nextSignature;
        enqueue(
          formatSseEvent("summary", {
            credits,
          }),
        );
      };

      /* This route is a read-only owner-scoped SSE lane for the authenticated user's credit truth.
         Keep it cookie-authenticated and same-origin only, then pair it with a periodic server
         recheck so Vercel instance rotation or cross-instance admin writes still converge quickly. */
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
      };

      enqueue(`retry: ${SSE_RETRY_MS}\n\n`);
      enqueue(formatSseComment("connected"));
      emitSummary(initialCredits);

      const unsubscribe = subscribeAssessmentCreditLiveUpdates({
        ownerUid: user.uid,
        emit: emitSummary,
      });

      const heartbeatInterval = setInterval(() => {
        enqueue(formatSseComment("keepalive"));
      }, SSE_HEARTBEAT_INTERVAL_MS);

      const refreshInterval = setInterval(async () => {
        if (closed || refreshInFlight) {
          return;
        }

        refreshInFlight = true;
        try {
          const nextCredits = await getAssessmentDailyCreditsSummaryForUser({
            uid: user.uid,
            role: user.role,
          });
          emitSummary(nextCredits);
        } catch (error) {
          console.warn("[assessment-credit-stream] fallback refresh failed", {
            ownerUid: user.uid,
            error: error instanceof Error ? error.name : "UNKNOWN",
          });
        } finally {
          refreshInFlight = false;
        }
      }, SSE_FALLBACK_REFRESH_INTERVAL_MS);

      const abortHandler = () => {
        closeStream();
      };

      request.signal.addEventListener("abort", abortHandler, { once: true });

      cleanup = () => {
        clearInterval(heartbeatInterval);
        clearInterval(refreshInterval);
        unsubscribe();
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
