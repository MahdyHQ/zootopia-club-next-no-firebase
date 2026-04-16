import type { AssessmentDailyCreditsSummary } from "@zootopia/shared-types";

import { apiError, apiSuccess, applyNoStore } from "@/lib/server/api";
import {
  buildAssessmentCreditSummaryDiagnosticSnapshot,
  createAssessmentCreditTraceId,
  logAssessmentCreditDiagnostic,
} from "@/lib/server/assessment-credit-diagnostics";
import { getAssessmentDailyCreditsSummaryForUser } from "@/lib/server/repository";
import { getAuthenticatedSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ASSESSMENT_CREDIT_REQUEST_ID_HEADER =
  "X-Zootopia-Assessment-Credit-Request-Id";

export async function GET() {
  const requestId = createAssessmentCreditTraceId();
  const user = await getAuthenticatedSessionUser();
  if (!user) {
    const response = applyNoStore(
      apiError("UNAUTHENTICATED", "Sign in is required for assessments.", 401),
    );
    response.headers.set(ASSESSMENT_CREDIT_REQUEST_ID_HEADER, requestId);
    return response;
  }

  logAssessmentCreditDiagnostic({
    event: "assessment_credit_read_request_started",
    traceId: requestId,
    details: {
      ownerUid: user.uid,
      route: "/api/assessment/credits",
      role: user.role,
    },
  });

  try {
    const credits = await getAssessmentDailyCreditsSummaryForUser({
      uid: user.uid,
      role: user.role,
    });

    logAssessmentCreditDiagnostic({
      event: "assessment_credit_read_request_result",
      traceId: requestId,
      details: {
        ownerUid: user.uid,
        route: "/api/assessment/credits",
        summary: buildAssessmentCreditSummaryDiagnosticSnapshot(credits),
      },
    });

    const response = applyNoStore(
      apiSuccess<{ credits: AssessmentDailyCreditsSummary }>({ credits }),
    );
    response.headers.set(ASSESSMENT_CREDIT_REQUEST_ID_HEADER, requestId);
    return response;
  } catch (error) {
    logAssessmentCreditDiagnostic({
      event: "assessment_credit_read_request_failed",
      level: "error",
      traceId: requestId,
      details: {
        ownerUid: user.uid,
        route: "/api/assessment/credits",
      },
      error,
    });

    const response = applyNoStore(
      apiError(
        "ASSESSMENT_CREDIT_SUMMARY_UNAVAILABLE",
        "Unable to load assessment credits right now.",
        503,
      ),
    );
    response.headers.set(ASSESSMENT_CREDIT_REQUEST_ID_HEADER, requestId);
    return response;
  }
}
