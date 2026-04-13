import type { UpdateUserProfileInput } from "@zootopia/shared-types";
import {
  validatePhoneNumberE164,
  validateRequiredUserProfile,
} from "@zootopia/shared-utils";

import { getAuthenticatedUserRedirectPath, sanitizeUserReturnTo } from "@/lib/return-to";
import { apiError, apiSuccess } from "@/lib/server/api";
import { updateUserProfile } from "@/lib/server/repository";
import { getAuthenticatedSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  const user = await getAuthenticatedSessionUser();
  if (!user) {
    return apiError("UNAUTHENTICATED", "Sign in is required to update your profile.", 401);
  }

  let body: Partial<UpdateUserProfileInput>;

  try {
    body = (await request.json()) as Partial<UpdateUserProfileInput>;
  } catch {
    return apiError("INVALID_JSON", "Request body must be valid JSON.", 400);
  }

  const validation = validateRequiredUserProfile({
    fullName: String(body.fullName || ""),
    universityCode: String(body.universityCode || ""),
    gender: String(body.gender || ""),
    nationality: String(body.nationality || ""),
  });

  if (!validation.ok) {
    return apiError(
      "PROFILE_VALIDATION_FAILED",
      validation.message,
      400,
      validation.fieldErrors as Record<string, string>,
    );
  }

  const normalizedPhoneNumber = String(body.phoneNumber ?? "").trim();
  const phoneValidation = validatePhoneNumberE164(normalizedPhoneNumber);
  const phoneRequiredForCompletion = user.role !== "admin";

  /* Phone stays server-authoritative on this self-only endpoint: non-admin
     completion requires a valid E.164 phone, while admin profiles may leave it blank. */
  if (
    (phoneRequiredForCompletion || normalizedPhoneNumber.length > 0) &&
    !phoneValidation.ok
  ) {
    return apiError(
      "PROFILE_VALIDATION_FAILED",
      "Profile completion requires valid full name, university code, gender, phone number, and nationality.",
      400,
      {
        phoneNumber: phoneValidation.error,
      },
    );
  }

  // This endpoint is intentionally self-only for Settings.
  // Future agents must preserve server-side ownership by keeping the writable uid bound to the verified session user.
  const updatedUser = await updateUserProfile(user.uid, {
    fullName: validation.value.fullName,
    universityCode: validation.value.universityCode,
    gender: validation.value.gender,
    nationality: validation.value.nationality,
    phoneNumber: phoneValidation.ok ? phoneValidation.value : null,
  });

  const requestedReturnTo = sanitizeUserReturnTo(
    new URL(request.url).searchParams.get("returnTo"),
  );

  return apiSuccess({
    user: updatedUser,
    redirectTo: requestedReturnTo || getAuthenticatedUserRedirectPath(updatedUser),
  });
}
