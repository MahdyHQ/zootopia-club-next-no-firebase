import { APP_ROUTES } from "@zootopia/shared-config";

import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/auth";
import {
  buildSettingsRedirect,
  resolveAuthenticatedUserRedirectPath,
} from "@/lib/return-to";

const USER_PROTECTED_MATCHERS = [
  APP_ROUTES.home,
  APP_ROUTES.upload,
  APP_ROUTES.assessment,
  APP_ROUTES.infographic,
  APP_ROUTES.settings,
];

const ADMIN_PROTECTED_MATCHERS = [APP_ROUTES.admin];

type ProxySessionUser = {
  uid?: unknown;
  id?: unknown;
  role?: unknown;
  status?: unknown;
  profileCompleted?: unknown;
};

function matchesRoute(pathname: string, routes: readonly string[]) {
  return routes.some((route) =>
    route === "/"
      ? pathname === "/"
      : pathname === route || pathname.startsWith(`${route}/`),
  );
}

function proxyHandler(request: NextRequest) {
  const authSession = (request as NextRequest & {
    auth?: { user?: ProxySessionUser } | null;
  }).auth;
  const authUser = authSession?.user;
  const uid =
    typeof authUser?.uid === "string"
      ? authUser.uid
      : typeof authUser?.id === "string"
        ? authUser.id
        : null;
  const rawRole = authUser?.role;
  const role = rawRole === "admin" ? "admin" : "user";
  const status = authUser?.status === "suspended" ? "suspended" : "active";
  const profileCompleted = Boolean(authUser?.profileCompleted);
  const hasActiveSession = Boolean(uid) && status === "active";
  const redirectDecision = resolveAuthenticatedUserRedirectPath({
    role,
    profileCompleted,
  });
  const { pathname } = request.nextUrl;
  const isAdminLoginPath = pathname === APP_ROUTES.adminLogin;

  if (
    hasActiveSession
    && rawRole !== undefined
    && rawRole !== null
    && rawRole !== "admin"
    && rawRole !== "user"
  ) {
    /* Keep proxy classification fail-closed to user lane, but emit a security signal when a
       malformed or unexpected role claim appears so session-claim drift is visible in logs. */
    console.warn("[proxy-auth] unexpected role claim detected", {
      path: pathname,
      uid,
      role: rawRole,
    });
  }

  if (!hasActiveSession && matchesRoute(pathname, ADMIN_PROTECTED_MATCHERS) && !isAdminLoginPath) {
    return NextResponse.redirect(new URL(APP_ROUTES.adminLogin, request.url));
  }

  if (!hasActiveSession && matchesRoute(pathname, USER_PROTECTED_MATCHERS)) {
    return NextResponse.redirect(new URL(APP_ROUTES.login, request.url));
  }

  if (
    hasActiveSession
    && role !== "admin"
    && !profileCompleted
    && matchesRoute(pathname, USER_PROTECTED_MATCHERS)
    && pathname !== APP_ROUTES.settings
    && !pathname.startsWith(`${APP_ROUTES.settings}/`)
  ) {
    const returnTo = `${pathname}${request.nextUrl.search}`;
    const settingsRedirect = buildSettingsRedirect(returnTo);

    console.info("[proxy-auth] profile gate redirect", {
      path: pathname,
      uid,
      role,
      redirectTo: settingsRedirect,
    });

    return NextResponse.redirect(new URL(settingsRedirect, request.url));
  }

  if (hasActiveSession && pathname === APP_ROUTES.login) {
    return NextResponse.redirect(new URL(redirectDecision.path, request.url));
  }

  if (hasActiveSession && pathname === APP_ROUTES.adminLogin && role === "admin") {
    return NextResponse.redirect(new URL(APP_ROUTES.admin, request.url));
  }

  if (hasActiveSession && pathname === APP_ROUTES.adminLogin && role !== "admin") {
    return NextResponse.redirect(new URL(redirectDecision.path, request.url));
  }

  if (hasActiveSession && matchesRoute(pathname, ADMIN_PROTECTED_MATCHERS) && role !== "admin") {
    return NextResponse.redirect(new URL(redirectDecision.path, request.url));
  }

  return NextResponse.next();
}

export const proxy = auth(proxyHandler);

export const config = {
  matcher: [
    "/",
    "/login",
    "/admin/login",
    "/upload/:path*",
    "/assessment/:path*",
    "/infographic/:path*",
    "/settings/:path*",
    "/admin/:path*",
  ],
};
