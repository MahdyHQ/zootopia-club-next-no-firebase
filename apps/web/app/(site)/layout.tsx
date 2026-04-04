import { APP_ROUTES } from "@zootopia/shared-config";
import type { ReactNode } from "react";

import { PublicSiteShell } from "@/components/site/public-site-shell";
import { getAuthenticatedUserRedirectPath } from "@/lib/return-to";
import { getRequestUiContext } from "@/lib/server/request-context";
import { getAuthenticatedSessionUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export default async function PublicSiteLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const [user, uiContext] = await Promise.all([
    getAuthenticatedSessionUser(),
    getRequestUiContext(),
  ]);

  const primaryHref = user ? getAuthenticatedUserRedirectPath(user) : APP_ROUTES.login;

  return (
    <PublicSiteShell
      locale={uiContext.locale}
      themeMode={uiContext.themeMode}
      messages={uiContext.messages}
      primaryHref={primaryHref}
      isAuthenticated={Boolean(user)}
    >
      {children}
    </PublicSiteShell>
  );
}
