import type { AdminIdentifierResolution } from "@zootopia/shared-types";

import { apiError, apiSuccess } from "@/lib/server/api";
import { resolveAdminIdentifier } from "@/lib/server/admin-auth";
import { checkRequestRateLimit } from "@/lib/server/request-rate-limit";

export const runtime = "nodejs";

const ADMIN_IDENTIFIER_RATE_LIMIT_MAX_REQUESTS = 20;
const ADMIN_IDENTIFIER_RATE_LIMIT_WINDOW_MS = 60 * 1000;

export async function POST(request: Request) {
  /* Identifier resolution is intentionally server-throttled to reduce account-enumeration
     and scripted probing pressure against admin sign-in discovery surfaces. */
  const rateLimit = checkRequestRateLimit({
    request,
    scope: "admin-auth-resolve-identifier",
    maxRequests: ADMIN_IDENTIFIER_RATE_LIMIT_MAX_REQUESTS,
    windowMs: ADMIN_IDENTIFIER_RATE_LIMIT_WINDOW_MS,
  });
  if (!rateLimit.allowed) {
    const blocked = apiError(
      "AUTH_RATE_LIMITED",
      "Too many admin identifier requests. Please retry shortly.",
      429,
    );
    blocked.headers.set("Retry-After", String(rateLimit.retryAfterSeconds));
    blocked.headers.set(
      "X-RateLimit-Reset",
      String(Math.ceil(rateLimit.resetAtMs / 1000)),
    );
    return blocked;
  }

  let body: { identifier?: string };

  try {
    body = (await request.json()) as { identifier?: string };
  } catch {
    return apiError("INVALID_JSON", "Request body must be valid JSON.", 400);
  }

  const resolution = resolveAdminIdentifier(String(body.identifier || ""));
  if (!resolution.ok) {
    return apiError(resolution.code, resolution.message, resolution.status);
  }

  const payload: AdminIdentifierResolution = resolution.value;
  return apiSuccess(payload);
}
