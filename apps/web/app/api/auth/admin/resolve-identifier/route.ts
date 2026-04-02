import type { AdminIdentifierResolution } from "@zootopia/shared-types";

import { apiError, apiSuccess } from "@/lib/server/api";
import { resolveAdminIdentifier } from "@/lib/server/admin-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
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
