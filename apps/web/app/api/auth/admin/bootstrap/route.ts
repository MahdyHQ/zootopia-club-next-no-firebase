import { apiError, applyNoStore } from "@/lib/server/api";

export const runtime = "nodejs";

export async function POST() {
  /* The dedicated admin bootstrap route was superseded by the live Auth.js admin credentials
     flow. Keep the endpoint as an explicit 410 response so no caller can mistake this stale
     contract for a supported second trust boundary. */
  return applyNoStore(
    apiError(
      "ADMIN_BOOTSTRAP_DEPRECATED",
      "This legacy admin bootstrap endpoint is retired. Use /admin/login and the live Auth.js flow instead.",
      410,
    ),
  );
}
