import { redirect } from "next/navigation";

import { AdminLoginPanel } from "@/components/auth/admin-login-panel";
import { PublicAuthShell } from "@/components/auth/public-auth-shell";
import { LocaleToggle } from "@/components/preferences/locale-toggle";
import { ThemeToggle } from "@/components/preferences/theme-toggle";
import { getAuthenticatedUserRedirectPath } from "@/lib/return-to";
import { getRequestUiContext } from "@/lib/server/request-context";
import { getRuntimeFlags } from "@/lib/server/runtime";
import { getAuthenticatedSessionUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  const [user, uiContext] = await Promise.all([
    getAuthenticatedSessionUser(),
    getRequestUiContext(),
  ]);

  if (user) {
    redirect(getAuthenticatedUserRedirectPath(user));
  }

  const runtimeFlags = getRuntimeFlags();

  return (
    <PublicAuthShell
      eyebrow={uiContext.messages.adminLoginSupportLabel}
      title={uiContext.messages.adminLoginTitle}
      subtitle={uiContext.messages.adminLoginSubtitle}
      imageAlt={uiContext.messages.adminTitle}
      compact
      showMediaCopy={false}
      controls={
        <>
          <ThemeToggle
            value={uiContext.themeMode}
            label={uiContext.messages.themeLabel}
            labels={{
              light: uiContext.messages.themeLight,
              dark: uiContext.messages.themeDark,
              system: uiContext.messages.themeSystem,
            }}
            variant="compact"
          />
          <LocaleToggle
            value={uiContext.locale}
            label={uiContext.messages.localeLabel}
            labels={{
              en: uiContext.messages.localeEnglish,
              ar: uiContext.messages.localeArabic,
            }}
            variant="compact"
          />
        </>
      }
    >
      <div className="flex min-w-0 items-center justify-center">
        <AdminLoginPanel
          messages={uiContext.messages}
          firebaseAdminReady={runtimeFlags.firebaseAdmin}
        />
      </div>
    </PublicAuthShell>
  );
}
