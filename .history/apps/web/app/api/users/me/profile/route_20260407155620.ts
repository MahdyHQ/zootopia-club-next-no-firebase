import type { UpdateUserProfileInput } from "@zootopia/shared-types";
import { validateRequiredUserProfile } from "@zootopia/shared-utils";

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
    nationality: String(body.nationality || ""),
    originCountry: String(body.originCountry || ""),
  });

  if (!validation.ok) {
    return apiError(
      "PROFILE_VALIDATION_FAILED",
      validation.message,
      400,
      validation.fieldErrors as Record<string, string>,
    );
  }

  if (user.role !== "admin" && (!user.phoneNumber || !user.phoneVerifiedAt)) {
    return apiError(
      "PHONE_VERIFICATION_REQUIRED",
      "Verify your phone number before saving a completion-gated profile.",
      400,
      {
        phoneNumber: "Phone verification is required before you can continue.",
      },
    );
  }

  // This endpoint is intentionally self-only for Settings.
  // Future agents must preserve server-side ownership by keeping the writable uid bound to the verified session user.
  const updatedUser = await updateUserProfile(user.uid, {
    fullName: validation.value.fullName,
    universityCode: validation.value.universityCode,
    nationality: validation.value.nationality,
    originCountry: validation.value.originCountry,
  });

  const requestedReturnTo = sanitizeUserReturnTo(
    new URL(request.url).searchParams.get("returnTo"),
  );

  return apiSuccess({
    user: updatedUser,
    redirectTo: requestedReturnTo || getAuthenticatedUserRedirectPath(updatedUser),
  });
}
