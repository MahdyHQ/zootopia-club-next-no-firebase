import { apiError, applyNoStore } from "@/lib/server/api";

export const runtime = "nodejs";

export async function POST() {
  // Legacy endpoint retained only to provide a deterministic migration signal.
  return applyNoStore(
    apiError(
      "AUTH_ENDPOINT_DEPRECATED",
      "This endpoint is deprecated. Use Auth.js admin credentials sign-in instead.",
      410,
    ),
  );
}
