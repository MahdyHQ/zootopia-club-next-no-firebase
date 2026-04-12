import { APP_ROUTES } from "@zootopia/shared-config";
import type { SessionUser } from "@zootopia/shared-types";

const USER_RETURN_MATCHERS = [
  APP_ROUTES.home,
  APP_ROUTES.upload,
  APP_ROUTES.assessment,
  APP_ROUTES.infographic,
  APP_ROUTES.settings,
] as const;

const ADMIN_RETURN_MATCHERS = [
  APP_ROUTES.home,
  APP_ROUTES.admin,
  APP_ROUTES.adminUsers,
] as const;

const AUTH_REDIRECT_ENV_KEYS = {
  user: "NEXT_PUBLIC_ZOOTOPIA_AUTH_USER_DEFAULT_REDIRECT",
  admin: "NEXT_PUBLIC_ZOOTOPIA_AUTH_ADMIN_DEFAULT_REDIRECT",
} as const;

function matchesRoute(pathname: string, routes: readonly string[]) {
  return routes.some((route) =>
    route === "/"
      ? pathname === "/"
      : pathname === route || pathname.startsWith(`${route}/`),
  );
}

function sanitizeConfiguredRedirectPath(input: {
  value: string | undefined;
  fallback: string;
  allowedRoutes: readonly string[];
}) {
  const raw = String(input.value ?? "").trim();
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return input.fallback;
  }

  const url = new URL(raw, "https://zootopia.local");
  if (
    !matchesRoute(url.pathname, input.allowedRoutes)
    || url.pathname === APP_ROUTES.login
    || url.pathname === APP_ROUTES.adminLogin
  ) {
    return input.fallback;
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

function readConfiguredAuthenticatedRedirectPath(role: "admin" | "user") {
  /* Keep post-auth redirects centralized and fail-closed to vetted internal routes only,
     so environment overrides stay Vercel-safe and cannot become open redirects. */
  if (role === "admin") {
    return sanitizeConfiguredRedirectPath({
      value: process.env[AUTH_REDIRECT_ENV_KEYS.admin],
      fallback: APP_ROUTES.home,
      allowedRoutes: ADMIN_RETURN_MATCHERS,
    });
  }

  return sanitizeConfiguredRedirectPath({
    value: process.env[AUTH_REDIRECT_ENV_KEYS.user],
    fallback: APP_ROUTES.home,
    allowedRoutes: USER_RETURN_MATCHERS,
  });
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

export type AuthenticatedUserRedirectReason =
  | "admin_lane"
  | "profile_incomplete"
  | "profile_complete";

export type AuthenticatedUserRedirectDecision = {
  path: string;
  reason: AuthenticatedUserRedirectReason;
};

export function resolveAuthenticatedUserRedirectPath(
  user: Pick<SessionUser, "role" | "profileCompleted">,
): AuthenticatedUserRedirectDecision {
  if (user.role === "admin") {
    return {
      path: readConfiguredAuthenticatedRedirectPath("admin"),
      reason: "admin_lane",
    };
  }

  if (!user.profileCompleted) {
    return {
      path: APP_ROUTES.settings,
      reason: "profile_incomplete",
    };
  }

  return {
    path: readConfiguredAuthenticatedRedirectPath("user"),
    reason: "profile_complete",
  };
}

export function getAuthenticatedUserRedirectPath(
  user: Pick<SessionUser, "role" | "profileCompleted">,
) {
  return resolveAuthenticatedUserRedirectPath(user).path;
}
