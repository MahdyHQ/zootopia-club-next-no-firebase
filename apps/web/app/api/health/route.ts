import { APP_NAME, FIREBASE_PROJECT_ID, FIRESTORE_DATABASE_ID } from "@zootopia/shared-config";

import { apiSuccess } from "@/lib/server/api";
import { getRuntimeFlags } from "@/lib/server/runtime";

export const runtime = "nodejs";

export async function GET() {
  return apiSuccess({
    appName: APP_NAME,
    firebaseProjectId: FIREBASE_PROJECT_ID,
    firestoreDatabaseId: FIRESTORE_DATABASE_ID,
    runtimeFlags: getRuntimeFlags(),
  });
}
