import { APP_ROUTES } from "@zootopia/shared-config";
import type { SessionUser } from "@zootopia/shared-types";

const USER_RETURN_MATCHERS = [
  APP_ROUTES.home,
  APP_ROUTES.upload,
  APP_ROUTES.assessment,
  APP_ROUTES.infographic,
  APP_ROUTES.settings,
] as const;

function matchesRoute(pathname: string, routes: readonly string[]) {
  return routes.some((route) =>
    route === "/"
      ? pathname === "/"
      : pathname === route || pathname.startsWith(`${route}/`),
  );
}

export function sanitizeUserReturnTo(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return null;
  }

  const url = new URL(raw, "https://zootopia.local");
  if (
    !matchesRoute(url.pathname, USER_RETURN_MATCHERS) ||
    url.pathname === APP_ROUTES.login ||
    url.pathname.startsWith(`${APP_ROUTES.admin}/`) ||
    url.pathname === APP_ROUTES.admin
  ) {
    return null;
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

export function buildSettingsRedirect(returnTo?: string | null) {
  const safeReturnTo = sanitizeUserReturnTo(returnTo);
  if (!safeReturnTo || safeReturnTo === APP_ROUTES.settings) {
    return APP_ROUTES.settings;
  }

  return `${APP_ROUTES.settings}?returnTo=${encodeURIComponent(safeReturnTo)}`;
}

export function isProfileCompletionRequired(
  user: Pick<SessionUser, "role" | "profileCompleted">,
) {
  return user.role !== "admin" && !user.profileCompleted;
}

export function getAuthenticatedUserRedirectPath(
  user: Pick<SessionUser, "role" | "profileCompleted">,
) {
  if (user.role === "admin") {
    return APP_ROUTES.admin;
  }

  return user.profileCompleted ? APP_ROUTES.upload : APP_ROUTES.settings;
}
