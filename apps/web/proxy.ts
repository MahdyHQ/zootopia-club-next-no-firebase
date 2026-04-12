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

function readBooleanEnvFlag(value: string | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

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
  const profileCompleted = Boolean(authUser?.profileCompleted);
  // Keep proxy auth fail-closed when production requires durable persistence but critical
  // runtime bindings are absent; this avoids login<->protected redirect loops with stale cookies.
  const hasActiveSession = sessionRuntimeReady && Boolean(uid) && status === "active";
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

  // Profile completion gate for standard user pages: keep backend/proxy ownership of
  // onboarding enforcement so incomplete accounts always land on settings first,
  // regardless of direct URL hits or stale client navigation state.
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
    "/admin/login",
    "/upload/:path*",
    "/assessment/:path*",
    "/infographic/:path*",
    "/settings/:path*",
    "/admin/:path*",
  ],
};
