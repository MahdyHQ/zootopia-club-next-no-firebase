import { APP_ROUTES } from "@zootopia/shared-config";
import { redirect } from "next/navigation";
import { requireCompletedUser } from "@/lib/server/session";

export default async function AssessmentCreditsPage() {
  await requireCompletedUser(APP_ROUTES.globalCredits);
  redirect(APP_ROUTES.globalCredits);
}
