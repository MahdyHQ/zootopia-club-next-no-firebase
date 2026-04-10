import { apiError, apiSuccess, applyNoStore } from "@/lib/server/api";
import { getRuntimeFlags } from "@/lib/server/runtime";
import { getSessionSnapshot } from "@/lib/server/session";

export const runtime = "nodejs";

export async function GET() {
  // Keep /api/auth/me as the app-specific auth status surface while Auth.js owns session cookies.
  const session = await getSessionSnapshot();
  if (!session.authenticated || !session.user) {
    return applyNoStore(
      apiError(
        "SESSION_NOT_ESTABLISHED",
        "Sign-in session is not established yet.",
        401,
      ),
    );
  }

  return applyNoStore(apiSuccess({
    session,
    runtimeFlags: getRuntimeFlags(),
  }));
}
