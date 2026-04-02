import { APP_ROUTES, ENV_KEYS } from "@zootopia/shared-config";
import { NextResponse, type NextRequest } from "next/server";

const USER_PROTECTED_MATCHERS = [
  APP_ROUTES.home,
  APP_ROUTES.upload,
  APP_ROUTES.assessment,
  APP_ROUTES.infographic,
  APP_ROUTES.settings,
];

const ADMIN_PROTECTED_MATCHERS = [APP_ROUTES.admin];

function matchesRoute(pathname: string, routes: readonly string[]) {
  return routes.some((route) =>
    route === "/"
      ? pathname === "/"
      : pathname === route || pathname.startsWith(`${route}/`),
  );
}

export function proxy(request: NextRequest) {
  const sessionCookie = request.cookies.get(ENV_KEYS.sessionCookie)?.value;
  const { pathname } = request.nextUrl;
  const isAdminLoginPath = pathname === APP_ROUTES.adminLogin;

  if (!sessionCookie && matchesRoute(pathname, ADMIN_PROTECTED_MATCHERS) && !isAdminLoginPath) {
    return NextResponse.redirect(new URL(APP_ROUTES.adminLogin, request.url));
  }

  if (!sessionCookie && matchesRoute(pathname, USER_PROTECTED_MATCHERS)) {
    return NextResponse.redirect(new URL(APP_ROUTES.login, request.url));
  }

  return NextResponse.next();
}

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
