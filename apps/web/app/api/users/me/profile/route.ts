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

  if (user.role === "admin") {
    return apiError(
      "ADMIN_PROFILE_COMPLETION_EXEMPT",
      "Admin accounts are exempt from the mandatory profile-completion gate.",
      403,
    );
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
  });

  if (!validation.ok) {
    return apiError(
      "PROFILE_VALIDATION_FAILED",
      validation.message,
      400,
      validation.fieldErrors as Record<string, string>,
    );
  }

  const updatedUser = await updateUserProfile(user.uid, {
    fullName: validation.value.fullName,
    universityCode: validation.value.universityCode,
  });

  const requestedReturnTo = sanitizeUserReturnTo(
    new URL(request.url).searchParams.get("returnTo"),
  );

  return apiSuccess({
    user: updatedUser,
    redirectTo: requestedReturnTo || getAuthenticatedUserRedirectPath(updatedUser),
  });
}
