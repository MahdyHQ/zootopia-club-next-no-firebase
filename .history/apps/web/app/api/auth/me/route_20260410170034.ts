import { apiSuccess, applyNoStore } from "@/lib/server/api";
import { getRuntimeFlags } from "@/lib/server/runtime";
import { getSessionSnapshot } from "@/lib/server/session";

export const runtime = "nodejs";

export async function GET() {
  // Keep /api/auth/me as the app-specific auth status surface while Auth.js owns session cookies.
  return applyNoStore(apiSuccess({
    session: await getSessionSnapshot(),
    runtimeFlags: getRuntimeFlags(),
  }));
}
