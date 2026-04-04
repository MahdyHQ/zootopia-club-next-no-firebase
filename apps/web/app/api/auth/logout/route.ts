import { ENV_KEYS } from "@zootopia/shared-config";

import { apiSuccess } from "@/lib/server/api";
import { getSessionCookieOptions } from "@/lib/preferences";
import { appendAdminLog } from "@/lib/server/repository";
import { getAuthenticatedSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";

export async function POST() {
  const user = await getAuthenticatedSessionUser();
  const response = apiSuccess({ loggedOut: true });
  response.cookies.set(ENV_KEYS.sessionCookie, "", getSessionCookieOptions(0));

  if (user) {
    await appendAdminLog({
      actorUid: user.uid,
      actorRole: user.role,
      ownerUid: user.uid,
      ownerRole: user.role,
      action: "session-logged-out",
      resourceType: "session",
      resourceId: user.uid,
      route: "/api/auth/logout",
    });
  }

  return response;
}
