import { redirect } from "next/navigation";

import { AuthTopControls } from "@/components/auth/auth-top-controls";
import { AdminLoginPanel } from "@/components/auth/admin-login-panel";
import { PublicAuthShell } from "@/components/auth/public-auth-shell";
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
        <AuthTopControls
          themeMode={uiContext.themeMode}
          locale={uiContext.locale}
          themeLabel={uiContext.messages.themeLabel}
          themeLabels={{
            light: uiContext.messages.themeLight,
            dark: uiContext.messages.themeDark,
            system: uiContext.messages.themeSystem,
          }}
          localeLabel={uiContext.messages.localeLabel}
          localeLabels={{
            en: uiContext.messages.localeEnglish,
            ar: uiContext.messages.localeArabic,
          }}
        />
      }
    >
      <div className="flex min-w-0 items-center justify-center">
        <AdminLoginPanel
          messages={uiContext.messages}
          supabaseAuthReady={runtimeFlags.adminSupabaseAuth}
        />
      </div>
    </PublicAuthShell>
  );
}
