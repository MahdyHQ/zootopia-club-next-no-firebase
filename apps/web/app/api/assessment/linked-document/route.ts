import { isProfileCompletionRequired } from "@/lib/return-to";
import { apiError, apiSuccess } from "@/lib/server/api";
import { getActiveDocumentForOwner } from "@/lib/server/repository";
import { getAuthenticatedSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";

export async function GET() {
  const user = await getAuthenticatedSessionUser();
  if (!user) {
    return apiError("UNAUTHENTICATED", "Sign in is required for assessments.", 401);
  }
  if (isProfileCompletionRequired(user)) {
    return apiError(
      "PROFILE_INCOMPLETE",
      "Complete your profile in Settings before accessing assessment output.",
      403,
    );
  }

  const document = await getActiveDocumentForOwner(user.uid);
  return apiSuccess({ document });
}
