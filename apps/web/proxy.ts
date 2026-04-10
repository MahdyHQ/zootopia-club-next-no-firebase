import { APP_ROUTES } from "@zootopia/shared-config";

import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/auth";
import { getAuthenticatedUserRedirectPath } from "@/lib/return-to";

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
  const role = authUser?.role === "admin" ? "admin" : "user";
  const status = authUser?.status === "suspended" ? "suspended" : "active";
  const profileCompleted = Boolean(authUser?.profileCompleted);
  const hasActiveSession = Boolean(uid) && status === "active";
  const { pathname } = request.nextUrl;
  const isAdminLoginPath = pathname === APP_ROUTES.adminLogin;

  if (!hasActiveSession && matchesRoute(pathname, ADMIN_PROTECTED_MATCHERS) && !isAdminLoginPath) {
    return NextResponse.redirect(new URL(APP_ROUTES.adminLogin, request.url));
  }

  if (!hasActiveSession && matchesRoute(pathname, USER_PROTECTED_MATCHERS)) {
    return NextResponse.redirect(new URL(APP_ROUTES.login, request.url));
  }

  if (hasActiveSession && pathname === APP_ROUTES.login) {
    return NextResponse.redirect(
      new URL(
        getAuthenticatedUserRedirectPath({
          role,
          profileCompleted,
        }),
        request.url,
      ),
    );
  }

  if (hasActiveSession && pathname === APP_ROUTES.adminLogin && role === "admin") {
    return NextResponse.redirect(new URL(APP_ROUTES.admin, request.url));
  }

  if (hasActiveSession && pathname === APP_ROUTES.adminLogin && role !== "admin") {
    return NextResponse.redirect(
      new URL(
        getAuthenticatedUserRedirectPath({
          role,
          profileCompleted,
        }),
        request.url,
      ),
    );
  }

  if (hasActiveSession && matchesRoute(pathname, ADMIN_PROTECTED_MATCHERS) && role !== "admin") {
    return NextResponse.redirect(
      new URL(
        getAuthenticatedUserRedirectPath({
          role,
          profileCompleted,
        }),
        request.url,
      ),
    );
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
