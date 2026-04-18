import type { ApiFieldErrors } from "@zootopia/shared-types";

import { isProfileCompletionRequired } from "@/lib/return-to";
import { apiError, apiSuccess, applyNoStore } from "@/lib/server/api";
import {
  buildAssessmentPromptUnlockCookieValueForUser,
  getAssessmentPromptEntitlementStateForUser,
  getAssessmentPromptLockRuntimeState,
  getAssessmentPromptUnlockCookieName,
  getAssessmentPromptUnlockCookieOptions,
  isAssessmentPromptUnlockPasswordValid,
} from "@/lib/server/assessment-prompt-lock";
import { getAuthenticatedSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";

type AssessmentPromptUnlockResponse = {
  unlocked: boolean;
  lockEnabled: boolean;
};

type AssessmentPromptUnlockRequest = {
  password?: string;
};

function buildPasswordRequiredFieldError() {
  const fieldErrors: ApiFieldErrors = {
    password: "يرجى إدخال كلمة المرور.",
  };

  return fieldErrors;
}

function clearPromptUnlockCookie(response: {
  cookies: {
    set: (
      name: string,
      value: string,
      options: Record<string, unknown>,
    ) => unknown;
  };
}) {
  response.cookies.set(getAssessmentPromptUnlockCookieName(), "", {
    ...getAssessmentPromptUnlockCookieOptions(0),
    maxAge: 0,
  });
}

export async function POST(request: Request) {
  const user = await getAuthenticatedSessionUser();
  if (!user) {
    return applyNoStore(
      apiError("UNAUTHENTICATED", "Sign in is required for assessments.", 401),
    );
  }

  if (isProfileCompletionRequired(user)) {
    return applyNoStore(
      apiError(
        "PROFILE_INCOMPLETE",
        "Complete your profile in Settings before generating assessments.",
        403,
      ),
    );
  }

  const lockRuntime = getAssessmentPromptLockRuntimeState();

  if (user.role === "admin") {
    /* Admin accounts are permanently exempt from prompt lock restrictions.
       Keep this lane password-free and server-authoritative by design. */
    return applyNoStore(
      apiSuccess<AssessmentPromptUnlockResponse>({
        unlocked: true,
        lockEnabled: lockRuntime.lockEnabled,
      }),
    );
  }

  const entitlement = await getAssessmentPromptEntitlementStateForUser({
    uid: user.uid,
    role: user.role,
  });
  if (entitlement !== "enabled") {
    const response = applyNoStore(
      apiError(
        "ASSESSMENT_PROMPT_ENTITLEMENT_REQUIRED",
        "تعذر فتح الميزة لأن هذه الصلاحية غير مفعّلة لهذا الحساب حالياً. يرجى التواصل مع الإدارة أو المطوّر ابن عبدالله لتفعيلها.",
        403,
      ),
    );
    clearPromptUnlockCookie(response);
    return response;
  }

  if (!lockRuntime.lockEnabled) {
    /* Env-disabled mode intentionally bypasses the lock for normal users. This lets
       operators disable or remove the password gate instantly without code changes. */
    const response = applyNoStore(
      apiSuccess<AssessmentPromptUnlockResponse>({
        unlocked: true,
        lockEnabled: false,
      }),
    );
    clearPromptUnlockCookie(response);
    return response;
  }

  if (!lockRuntime.signingReady) {
    console.warn("[assessment-prompt-unlock] lock misconfigured", {
      uid: user.uid,
      role: user.role,
      lockEnabled: lockRuntime.lockEnabled,
      passwordConfigured: lockRuntime.passwordConfigured,
      passwordHasQuotedWrapper: lockRuntime.passwordHasQuotedWrapper,
      signingSecretSource: lockRuntime.signingSecretSource,
    });
    return applyNoStore(
      apiError(
        "ASSESSMENT_PROMPT_LOCK_MISCONFIGURED",
        "تعذر فتح الميزة حالياً بسبب إعداد داخلي في الخادم. يرجى المحاولة لاحقاً أو التواصل مع الدعم إذا استمرت المشكلة.",
        503,
      ),
    );
  }

  let body: AssessmentPromptUnlockRequest;
  try {
    body = (await request.json()) as AssessmentPromptUnlockRequest;
  } catch {
    return applyNoStore(
      apiError("INVALID_JSON", "Request body must be valid JSON.", 400),
    );
  }

  const password = String(body.password ?? "").trim();
  if (!password) {
    return applyNoStore(
      apiError(
        "ASSESSMENT_PROMPT_UNLOCK_PASSWORD_REQUIRED",
        "يرجى إدخال كلمة المرور لفتح الميزة.",
        400,
        buildPasswordRequiredFieldError(),
      ),
    );
  }

  if (!isAssessmentPromptUnlockPasswordValid(password)) {
    console.warn("[assessment-prompt-unlock] invalid password rejected", {
      uid: user.uid,
      role: user.role,
      lockEnabled: lockRuntime.lockEnabled,
      passwordConfigured: lockRuntime.passwordConfigured,
      passwordHasQuotedWrapper: lockRuntime.passwordHasQuotedWrapper,
      signingReady: lockRuntime.signingReady,
      signingSecretSource: lockRuntime.signingSecretSource,
    });
    return applyNoStore(
      apiError(
        "ASSESSMENT_PROMPT_UNLOCK_INVALID_PASSWORD",
        "تعذر فتح الميزة لأن كلمة المرور غير صحيحة.",
        403,
      ),
    );
  }

  const unlockCookieValue = buildAssessmentPromptUnlockCookieValueForUser(user.uid);
  if (!unlockCookieValue) {
    return applyNoStore(
      apiError(
        "ASSESSMENT_PROMPT_LOCK_MISCONFIGURED",
        "تعذر فتح الميزة حالياً بسبب إعداد داخلي في الخادم. يرجى المحاولة لاحقاً أو التواصل مع الدعم إذا استمرت المشكلة.",
        503,
      ),
    );
  }

  const response = applyNoStore(
    apiSuccess<AssessmentPromptUnlockResponse>({
      unlocked: true,
      lockEnabled: true,
    }),
  );
  response.cookies.set(
    getAssessmentPromptUnlockCookieName(),
    unlockCookieValue,
    getAssessmentPromptUnlockCookieOptions(lockRuntime.cookieMaxAgeSeconds),
  );
  return response;
}
