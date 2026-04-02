import { isProfileCompletionRequired } from "@/lib/return-to";
import { apiError, apiSuccess } from "@/lib/server/api";
import { getInfographicGenerationForViewer } from "@/lib/server/repository";
import { getAuthenticatedSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getAuthenticatedSessionUser();
  if (!user) {
    return apiError("UNAUTHENTICATED", "Sign in is required for infographics.", 401);
  }
  if (isProfileCompletionRequired(user)) {
    return apiError(
      "PROFILE_INCOMPLETE",
      "Complete your profile in Settings before accessing infographic output.",
      403,
    );
  }

  const { id } = await context.params;
  const generation = await getInfographicGenerationForViewer(id, user);

  if (!generation) {
    return apiError("INFOGRAPHIC_NOT_FOUND", "Infographic generation not found.", 404);
  }

  return apiSuccess(generation);
}
