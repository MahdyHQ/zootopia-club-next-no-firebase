import { apiError, applyNoStore } from "@/lib/server/api";

export const runtime = "nodejs";

export async function POST() {
  /* Auth.js is now the sole live session trust boundary. This legacy bootstrap edge is kept only
     as an explicit fail-closed compatibility stub so interrupted callers receive a truthful
     response instead of silently depending on a second, stale session-issuance path. */
  return applyNoStore(
    apiError(
      "AUTH_BOOTSTRAP_DEPRECATED",
      "This legacy bootstrap endpoint is retired. Use the live Auth.js login surfaces instead.",
      410,
    ),
  );
}
