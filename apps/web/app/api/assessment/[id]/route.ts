import { isProfileCompletionRequired } from "@/lib/return-to";
import { apiError, apiSuccess } from "@/lib/server/api";
import {
  appendAdminLog,
  getAssessmentGenerationForOwner,
} from "@/lib/server/repository";
import { getAuthenticatedSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
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

  const { id } = await context.params;
  const generation = await getAssessmentGenerationForOwner(id, user.uid, {
    includeExpired: true,
  });

  if (!generation) {
    return apiError("ASSESSMENT_NOT_FOUND", "Assessment generation not found.", 404);
  }

  if (generation.status === "expired") {
    return apiError(
      "ASSESSMENT_EXPIRED",
      "Assessment generation has expired and is no longer available.",
      410,
    );
  }

  await appendAdminLog({
    actorUid: user.uid,
    actorRole: user.role,
    ownerUid: user.uid,
    ownerRole: user.role,
    action: "assessment-readback-opened",
    resourceType: "assessment",
    resourceId: generation.id,
    route: "/api/assessment/[id]",
  });

  return apiSuccess(generation);
}
