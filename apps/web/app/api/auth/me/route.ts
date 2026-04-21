import { apiError, apiSuccess, applyNoStore } from "@/lib/server/api";
import { getAuthenticatedUserRedirectPath } from "@/lib/return-to";
import { getRuntimeFlags } from "@/lib/server/runtime";
import { getSessionSnapshot } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

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

  /* This endpoint is the server-owned post-login handoff contract.
     Keep redirect resolution here so login clients do not duplicate env/default policy
     or depend on browser-bundled process.env behavior for protected route admission. */
  return applyNoStore(apiSuccess({
    session,
    redirectTo: getAuthenticatedUserRedirectPath(session.user),
    runtimeFlags: getRuntimeFlags(),
  }));
}
