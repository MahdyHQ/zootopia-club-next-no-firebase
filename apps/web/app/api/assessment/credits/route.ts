import type { AssessmentDailyCreditsSummary } from "@zootopia/shared-types";

import { apiError, apiSuccess, applyNoStore } from "@/lib/server/api";
import {
  buildAssessmentCreditSummaryDiagnosticSnapshot,
  createAssessmentCreditTraceId,
  logAssessmentCreditDiagnostic,
} from "@/lib/server/assessment-credit-diagnostics";
import {
  getAssessmentAuthenticationRequiredError,
  getAssessmentCreditSummaryUnavailablePlatformError,
} from "@/lib/server/assessment-platform-errors";
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
    const error = getAssessmentAuthenticationRequiredError();
    const response = applyNoStore(
      apiError(error.code, error.message, error.status),
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
      email: user.email,
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

    const mapped = getAssessmentCreditSummaryUnavailablePlatformError();
    const response = applyNoStore(
      apiError(mapped.code, mapped.message, mapped.status),
    );
    response.headers.set(ASSESSMENT_CREDIT_REQUEST_ID_HEADER, requestId);
    return response;
  }
}
