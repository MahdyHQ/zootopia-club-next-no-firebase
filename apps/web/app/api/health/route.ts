import { APP_NAME } from "@zootopia/shared-config";

import { apiSuccess } from "@/lib/server/api";
import { getRuntimeFlags } from "@/lib/server/runtime";
import { shouldUseZootopiaPostgresPersistence } from "@/lib/server/zootopia-firestore-pg";

export const runtime = "nodejs";

export async function GET() {
  return apiSuccess({
    appName: APP_NAME,
    persistenceMode: shouldUseZootopiaPostgresPersistence() ? "supabase_postgres" : "memory",
    runtimeFlags: getRuntimeFlags(),
  });
}
