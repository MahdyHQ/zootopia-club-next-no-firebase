import type { AssessmentDailyCreditsSummary } from "@zootopia/shared-types";

import { apiError, apiSuccess, applyNoStore } from "@/lib/server/api";
import { getAssessmentDailyCreditsSummaryForUser } from "@/lib/server/repository";
import { getAuthenticatedSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getAuthenticatedSessionUser();
  if (!user) {
    return applyNoStore(
      apiError("UNAUTHENTICATED", "Sign in is required for assessments.", 401),
    );
  }

  const credits = await getAssessmentDailyCreditsSummaryForUser({
    uid: user.uid,
    role: user.role,
  });

  return applyNoStore(apiSuccess<{ credits: AssessmentDailyCreditsSummary }>({ credits }));
}
