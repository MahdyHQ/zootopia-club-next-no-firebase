import { getPhoneNumberMetadata } from "@zootopia/shared-utils";

import {
  getDecodedSignInProvider,
  hasRecentSignIn,
} from "@/lib/server/admin-auth";
import { apiError, apiSuccess } from "@/lib/server/api";
import {
  getFirebaseAdminAuth,
  hasFirebaseAdminRuntime,
} from "@/lib/server/firebase-admin";
import { checkRequestRateLimit } from "@/lib/server/request-rate-limit";
import { updateUserPhoneVerification } from "@/lib/server/repository";
import { getAuthenticatedSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";

const E164_PHONE_PATTERN = /^\+[1-9]\d{6,17}$/;
const PHONE_VERIFICATION_RATE_LIMIT_MAX_REQUESTS = 8;
const PHONE_VERIFICATION_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export async function POST(request: Request) {
  const user = await getAuthenticatedSessionUser();
  if (!user) {
    return apiError(
      "UNAUTHENTICATED",
      "Sign in is required to verify your phone number.",
      401,
    );
  }

  /* Settings phone OTP confirmation remains Firebase-owned, but this server receipt endpoint
     still needs basic throttling so repeated token replay attempts cannot hammer the self-only
     verification write path. Keep the scope narrow to this route and preserve session ownership. */
  const rateLimit = checkRequestRateLimit({
    request,
    scope: "settings-phone-verification",
    maxRequests: PHONE_VERIFICATION_RATE_LIMIT_MAX_REQUESTS,
    windowMs: PHONE_VERIFICATION_RATE_LIMIT_WINDOW_MS,
  });
  if (!rateLimit.allowed) {
    const blocked = apiError(
      "PHONE_VERIFICATION_RATE_LIMITED",
      "Too many phone verification attempts. Please retry shortly.",
      429,
    );
    blocked.headers.set("Retry-After", String(rateLimit.retryAfterSeconds));
    blocked.headers.set(
      "X-RateLimit-Reset",
      String(Math.ceil(rateLimit.resetAtMs / 1000)),
    );
    return blocked;
  }

  if (!hasFirebaseAdminRuntime()) {
    return apiError(
      "FIREBASE_ADMIN_UNAVAILABLE",
      "Firebase Admin runtime is not configured yet.",
      503,
    );
  }

  let body: { idToken?: string };

  try {
    body = (await request.json()) as { idToken?: string };
  } catch {
    return apiError("INVALID_JSON", "Request body must be valid JSON.", 400);
  }

  const idToken = String(body.idToken || "").trim();
  if (!idToken) {
    return apiError(
      "ID_TOKEN_REQUIRED",
      "A Firebase ID token is required to verify a phone number.",
      400,
    );
  }

  try {
    const decodedToken = await getFirebaseAdminAuth().verifyIdToken(idToken);

    if (!hasRecentSignIn(decodedToken)) {
      return apiError(
        "RECENT_SIGN_IN_REQUIRED",
        "Please complete a fresh phone OTP verification and try again.",
        401,
      );
    }

    if (getDecodedSignInProvider(decodedToken) !== "phone") {
      return apiError(
        "PHONE_PROVIDER_REQUIRED",
        "This token does not come from a verified phone sign-in flow.",
        403,
      );
    }

    const phoneNumber =
      typeof decodedToken.phone_number === "string"
        ? decodedToken.phone_number.trim()
        : "";

    if (!E164_PHONE_PATTERN.test(phoneNumber)) {
      return apiError(
        "PHONE_NUMBER_INVALID",
        "Verified phone number must use E.164 format.",
        400,
      );
    }
    const phoneMetadata = getPhoneNumberMetadata(phoneNumber);
    if (!phoneMetadata) {
      return apiError(
        "PHONE_NUMBER_INVALID",
        "Verified phone number must be a possible international number.",
        400,
      );
    }

    /* Keep profile ownership server-authoritative by always attaching the verified phone
       to the signed-in session user, never to the uid inside the submitted phone token. */
    const updatedUser = await updateUserPhoneVerification(user.uid, {
      phoneNumber: phoneMetadata.e164,
    });

    return apiSuccess({
      user: {
        phoneNumber: updatedUser.phoneNumber,
        phoneVerifiedAt: updatedUser.phoneVerifiedAt,
        phoneCountryIso2: updatedUser.phoneCountryIso2 ?? null,
        phoneCountryCallingCode: updatedUser.phoneCountryCallingCode ?? null,
      },
    });
  } catch {
    return apiError(
      "PHONE_VERIFICATION_FAILED",
      "Unable to verify this phone token. Please request a new OTP and retry.",
      401,
    );
  }
}
