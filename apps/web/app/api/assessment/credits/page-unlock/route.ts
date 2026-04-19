import type { ApiFieldErrors } from "@zootopia/shared-types";

import { isProfileCompletionRequired } from "@/lib/return-to";
import { apiError, apiSuccess, applyNoStore } from "@/lib/server/api";
import {
  createAssessmentCreditTraceId,
  logAssessmentCreditDiagnostic,
} from "@/lib/server/assessment-credit-diagnostics";
import {
  buildAssessmentCreditPageUnlockCookieValueForUser,
  getAssessmentCreditPageLockRuntimeState,
  getAssessmentCreditPageUnlockCookieName,
  getAssessmentCreditPageUnlockCookieOptions,
  isAssessmentCreditPagePasswordValid,
} from "@/lib/server/assessment-credit-page-lock";
import { getAuthenticatedSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";

type AssessmentCreditPageUnlockResponse = {
  unlocked: boolean;
  lockEnabled: boolean;
};

type AssessmentCreditPageUnlockRequest = {
  password?: string;
};

function buildPasswordRequiredFieldError() {
  const fieldErrors: ApiFieldErrors = {
    password: "Please enter the page password.",
  };

  return fieldErrors;
}

function clearAssessmentCreditUnlockCookie(response: {
  cookies: {
    set: (
      name: string,
      value: string,
      options: Record<string, unknown>,
    ) => unknown;
  };
}) {
  response.cookies.set(getAssessmentCreditPageUnlockCookieName(), "", {
    ...getAssessmentCreditPageUnlockCookieOptions(0),
    maxAge: 0,
  });
}

export async function POST(request: Request) {
  const traceId = createAssessmentCreditTraceId();
  const user = await getAuthenticatedSessionUser();
  if (!user) {
    return applyNoStore(
      apiError("UNAUTHENTICATED", "Sign in is required for assessment credits.", 401),
    );
  }

  if (isProfileCompletionRequired(user)) {
    return applyNoStore(
      apiError(
        "PROFILE_INCOMPLETE",
        "Complete your profile in Settings before opening assessment credits.",
        403,
      ),
    );
  }

  const lockRuntime = getAssessmentCreditPageLockRuntimeState();
  logAssessmentCreditDiagnostic({
    event: "assessment_global_credits_unlock_requested",
    traceId,
    details: {
      ownerUid: user.uid,
      route: "/api/assessment/credits/page-unlock",
      role: user.role,
      lockEnabled: lockRuntime.lockEnabled,
      signingReady: lockRuntime.signingReady,
      passwordConfigured: lockRuntime.passwordConfigured,
      passwordHasQuotedWrapper: lockRuntime.passwordHasQuotedWrapper,
      signingSecretSource: lockRuntime.signingSecretSource,
    },
  });

  if (user.role === "admin") {
    return applyNoStore(
      apiSuccess<AssessmentCreditPageUnlockResponse>({
        unlocked: true,
        lockEnabled: lockRuntime.lockEnabled,
      }),
    );
  }

  if (!lockRuntime.lockEnabled) {
    const response = applyNoStore(
      apiSuccess<AssessmentCreditPageUnlockResponse>({
        unlocked: true,
        lockEnabled: false,
      }),
    );
    clearAssessmentCreditUnlockCookie(response);
    return response;
  }

  if (!lockRuntime.signingReady) {
    logAssessmentCreditDiagnostic({
      event: "assessment_global_credits_unlock_misconfigured",
      level: "error",
      traceId,
      details: {
        ownerUid: user.uid,
        route: "/api/assessment/credits/page-unlock",
        role: user.role,
        lockEnabled: lockRuntime.lockEnabled,
        passwordConfigured: lockRuntime.passwordConfigured,
        passwordHasQuotedWrapper: lockRuntime.passwordHasQuotedWrapper,
        signingSecretSource: lockRuntime.signingSecretSource,
      },
    });
    return applyNoStore(
      apiError(
        "GLOBAL_CREDIT_PAGE_LOCK_MISCONFIGURED",
        "Assessment credits page lock is misconfigured on the server.",
        503,
      ),
    );
  }

  let body: AssessmentCreditPageUnlockRequest;
  try {
    body = (await request.json()) as AssessmentCreditPageUnlockRequest;
  } catch {
    return applyNoStore(
      apiError("INVALID_JSON", "Request body must be valid JSON.", 400),
    );
  }

  const password = String(body.password ?? "").trim();
  if (!password) {
    return applyNoStore(
      apiError(
        "GLOBAL_CREDIT_PAGE_UNLOCK_PASSWORD_REQUIRED",
        "Password is required to open the assessment credits page.",
        400,
        buildPasswordRequiredFieldError(),
      ),
    );
  }

  if (!isAssessmentCreditPagePasswordValid(password)) {
    logAssessmentCreditDiagnostic({
      event: "assessment_global_credits_unlock_invalid_password",
      level: "warn",
      traceId,
      details: {
        ownerUid: user.uid,
        route: "/api/assessment/credits/page-unlock",
        passwordConfigured: lockRuntime.passwordConfigured,
        passwordHasQuotedWrapper: lockRuntime.passwordHasQuotedWrapper,
        signingReady: lockRuntime.signingReady,
        signingSecretSource: lockRuntime.signingSecretSource,
      },
    });
    return applyNoStore(
      apiError(
        "GLOBAL_CREDIT_PAGE_UNLOCK_INVALID_PASSWORD",
        "The provided assessment credits page password is invalid.",
        403,
      ),
    );
  }

  const unlockCookieValue = buildAssessmentCreditPageUnlockCookieValueForUser(user.uid);
  if (!unlockCookieValue) {
    return applyNoStore(
      apiError(
        "GLOBAL_CREDIT_PAGE_LOCK_MISCONFIGURED",
        "Assessment credits page lock is misconfigured on the server.",
        503,
      ),
    );
  }

  const response = applyNoStore(
    apiSuccess<AssessmentCreditPageUnlockResponse>({
      unlocked: true,
      lockEnabled: true,
    }),
  );
  response.cookies.set(
    getAssessmentCreditPageUnlockCookieName(),
    unlockCookieValue,
    getAssessmentCreditPageUnlockCookieOptions(lockRuntime.cookieMaxAgeSeconds),
  );

  logAssessmentCreditDiagnostic({
    event: "assessment_global_credits_unlock_succeeded",
    traceId,
    details: {
      ownerUid: user.uid,
      route: "/api/assessment/credits/page-unlock",
      lockEnabled: lockRuntime.lockEnabled,
      passwordHasQuotedWrapper: lockRuntime.passwordHasQuotedWrapper,
    },
  });

  return response;
}
