import { apiSuccess } from "@/lib/server/api";
import { getRuntimeFlags } from "@/lib/server/runtime";
import { getSessionSnapshot } from "@/lib/server/session";

export const runtime = "nodejs";

export async function GET() {
  return apiSuccess({
    session: await getSessionSnapshot(),
    runtimeFlags: getRuntimeFlags(),
  });
}
