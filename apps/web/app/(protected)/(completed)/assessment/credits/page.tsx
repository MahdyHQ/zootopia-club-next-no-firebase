import { APP_ROUTES } from "@zootopia/shared-config";
import { redirect } from "next/navigation";
import { requireCompletedUser } from "@/lib/server/session";

export default async function AssessmentCreditsCompatibilityRedirectPage() {
  /* Keep the legacy assessment credits route available as a protected compatibility entry point.
     Future agents: preserve this redirect so existing bookmarks/shared links continue landing on
     the canonical assessment credits page without duplicating a second credit surface. */
  await requireCompletedUser(APP_ROUTES.assessmentCreditDetails);
  redirect(APP_ROUTES.assessmentCreditDetails);
}
