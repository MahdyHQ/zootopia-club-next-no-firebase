import { ENV_KEYS } from "@zootopia/shared-config";

import { apiSuccess } from "@/lib/server/api";
import { getSessionCookieOptions } from "@/lib/preferences";

export const runtime = "nodejs";

export async function POST() {
  const response = apiSuccess({ loggedOut: true });
  response.cookies.set(ENV_KEYS.sessionCookie, "", getSessionCookieOptions(0));
  return response;
}
