import type { AssessmentCreditDetailsResponse } from "@zootopia/shared-types";

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
import { getGlobalCreditPageAccessStateForUser } from "@/lib/server/global-credit-page-lock";
import { getAssessmentCreditDetailsForUser } from "@/lib/server/repository";
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
    event: "assessment_credit_details_request_started",
    traceId: requestId,
    details: {
      ownerUid: user.uid,
      route: "/api/assessment/credits/details",
      role: user.role,
    },
  });

  const pageAccess = await getGlobalCreditPageAccessStateForUser({
    uid: user.uid,
    role: user.role,
  });
  if (!pageAccess.unlocked) {
    logAssessmentCreditDiagnostic({
      event: "assessment_global_credits_page_gate_blocked",
      level: "warn",
      traceId: requestId,
      details: {
        ownerUid: user.uid,
        route: "/api/assessment/credits/details",
        lockEnabled: pageAccess.lockEnabled,
      },
    });
    const response = applyNoStore(
      apiError(
        "GLOBAL_CREDIT_PAGE_LOCKED",
        "Unlock the global credit page password first.",
        403,
      ),
    );
    response.headers.set(ASSESSMENT_CREDIT_REQUEST_ID_HEADER, requestId);
    return response;
  }

  try {
    const details = await getAssessmentCreditDetailsForUser({
      uid: user.uid,
      role: user.role,
      email: user.email,
    });

    logAssessmentCreditDiagnostic({
      event: "assessment_credit_details_request_result",
      traceId: requestId,
      details: {
        ownerUid: user.uid,
        route: "/api/assessment/credits/details",
        summary: buildAssessmentCreditSummaryDiagnosticSnapshot(details.credits),
        grantCount: details.grants.length,
        historyCount: details.history.length,
      },
    });

    const response = applyNoStore(
      apiSuccess<{ details: AssessmentCreditDetailsResponse }>({ details }),
    );
    response.headers.set(ASSESSMENT_CREDIT_REQUEST_ID_HEADER, requestId);
    return response;
  } catch (error) {
    logAssessmentCreditDiagnostic({
      event: "assessment_credit_details_request_failed",
      level: "error",
      traceId: requestId,
      details: {
        ownerUid: user.uid,
        route: "/api/assessment/credits/details",
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
