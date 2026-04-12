import { APP_NAME } from "@zootopia/shared-config";

import { apiSuccess } from "@/lib/server/api";
import { getRuntimeFlags } from "@/lib/server/runtime";
import { getZootopiaPersistenceRuntimeState } from "@/lib/server/zootopia-postgres-adapter";

export const runtime = "nodejs";

export async function GET() {
  const persistenceRuntime = getZootopiaPersistenceRuntimeState();
  const missingRequirements: string[] = [];
  if (!persistenceRuntime.hasSupabaseAdminRuntime) {
    missingRequirements.push("supabase_admin_runtime");
  }
  if (!persistenceRuntime.hasDatabaseUrl) {
    missingRequirements.push("supabase_database_url");
  }

  return apiSuccess({
    appName: APP_NAME,
    persistenceMode: persistenceRuntime.usingPostgres ? "supabase_postgres" : "memory",
    persistenceGuard: {
      requiresDurablePersistence: persistenceRuntime.requiresDurablePersistence,
      memoryFallbackAllowedInProduction: persistenceRuntime.memoryFallbackAllowedInProduction,
      missingRequirements,
    },
    runtimeFlags: getRuntimeFlags(),
  });
}
