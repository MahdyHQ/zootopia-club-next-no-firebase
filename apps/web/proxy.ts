import { APP_ROUTES } from "@zootopia/shared-config";

import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/auth";
import {
  resolveAuthenticatedUserRedirectPath,
} from "@/lib/return-to";
import { isMaintenanceModeEnabled, readBooleanEnvFlag } from "@/lib/maintenance-mode";

const USER_PROTECTED_MATCHERS = [
  APP_ROUTES.home,
  APP_ROUTES.upload,
  APP_ROUTES.history,
  APP_ROUTES.assessment,
  APP_ROUTES.infographic,
  APP_ROUTES.settings,
];

const ADMIN_PROTECTED_MATCHERS = [APP_ROUTES.admin];

const USER_AUTH_ENTRY_MATCHERS = [
  APP_ROUTES.login,
  APP_ROUTES.forgotPassword,
  APP_ROUTES.resetPassword,
  APP_ROUTES.confirmEmail,
];

const PUBLIC_SITE_MATCHERS = [
  APP_ROUTES.journey,
  APP_ROUTES.about,
  APP_ROUTES.privacy,
  APP_ROUTES.contact,
  APP_ROUTES.donation,
  APP_ROUTES.hallOfHonor,
];

const NON_ADMIN_MAINTENANCE_MATCHERS = [
  ...USER_PROTECTED_MATCHERS,
  ...USER_AUTH_ENTRY_MATCHERS,
  ...PUBLIC_SITE_MATCHERS,
];

type ProxySessionUser = {
  uid?: unknown;
  id?: unknown;
  role?: unknown;
  status?: unknown;
  profileCompleted?: unknown;
};

function hasDurableSessionRuntime() {
  const isProduction = String(process.env.NODE_ENV ?? "").trim().toLowerCase() === "production";
  const allowMemoryFallback = readBooleanEnvFlag(
    process.env.ZOOTOPIA_ALLOW_PRODUCTION_MEMORY_FALLBACK,
  );
  const requiresDurable = isProduction && !allowMemoryFallback;
  if (!requiresDurable) {
    return true;
  }

  const hasDatabaseUrl = Boolean(
    process.env.SUPABASE_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim(),
  );
  const hasSupabaseAdminRuntime = Boolean(
    process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );

  return hasDatabaseUrl && hasSupabaseAdminRuntime;
}

function matchesRoute(pathname: string, routes: readonly string[]) {
  return routes.some((route) =>
    route === "/"
      ? pathname === "/"
      : pathname === route || pathname.startsWith(`${route}/`),
  );
}

function proxyHandler(request: NextRequest) {
  const sessionRuntimeReady = hasDurableSessionRuntime();
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
  // Keep proxy auth fail-closed when production requires durable persistence but critical
  // runtime bindings are absent; this avoids login<->protected redirect loops with stale cookies.
  const hasActiveSession = sessionRuntimeReady && Boolean(uid) && status === "active";
  // Proxy redirect selection stays role-based only. Profile completion ownership lives in
  // server route guards that read persisted user state, avoiding JWT claim drift issues.
  const redirectDecision = resolveAuthenticatedUserRedirectPath({
    role,
    profileCompleted: true,
  });
  const { pathname } = request.nextUrl;
  const isAdminLoginPath = pathname === APP_ROUTES.adminLogin;
  const isMaintenancePath = pathname === APP_ROUTES.maintenance;

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

  if (isMaintenanceModeEnabled() && !isMaintenancePath) {
    /* Maintenance mode is environment-controlled and enforced at the proxy boundary so
       non-admin users cannot access public auth flows or normal app surfaces during updates.
       Admin sessions keep uninterrupted access, and admin login remains available when needed. */
    if (
      hasActiveSession
      && role !== "admin"
      && (
        matchesRoute(pathname, NON_ADMIN_MAINTENANCE_MATCHERS)
        || matchesRoute(pathname, ADMIN_PROTECTED_MATCHERS)
      )
    ) {
      return NextResponse.redirect(new URL(APP_ROUTES.maintenance, request.url));
    }

    if (!hasActiveSession && matchesRoute(pathname, NON_ADMIN_MAINTENANCE_MATCHERS)) {
      return NextResponse.redirect(new URL(APP_ROUTES.maintenance, request.url));
    }
  }

  if (!hasActiveSession && matchesRoute(pathname, ADMIN_PROTECTED_MATCHERS) && !isAdminLoginPath) {
    return NextResponse.redirect(new URL(APP_ROUTES.adminLogin, request.url));
  }

  if (!hasActiveSession && matchesRoute(pathname, USER_PROTECTED_MATCHERS)) {
    return NextResponse.redirect(new URL(APP_ROUTES.login, request.url));
  }

  // Profile completion is enforced by server route ownership (`requireCompletedUser`) using
  // persisted session-backed user data. Keeping this out of proxy prevents false redirects
  // when JWT claims lag right after settings updates.

  if (hasActiveSession && matchesRoute(pathname, USER_AUTH_ENTRY_MATCHERS)) {
    return NextResponse.redirect(new URL(redirectDecision.path, request.url));
  }

  if (hasActiveSession && pathname === APP_ROUTES.adminLogin && role === "admin") {
    return NextResponse.redirect(new URL(redirectDecision.path, request.url));
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
    "/forgot-password",
    "/reset-password",
    "/confirm-email",
    "/admin/login",
    "/maintenance",
    "/journey/:path*",
    "/about/:path*",
    "/privacy/:path*",
    "/contact/:path*",
    "/donation/:path*",
    "/hall-of-honor/:path*",
    "/upload/:path*",
    "/history/:path*",
    "/assessment/:path*",
    "/infographic/:path*",
    "/settings/:path*",
    "/admin/:path*",
  ],
};
