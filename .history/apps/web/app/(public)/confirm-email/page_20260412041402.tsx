import { APP_ROUTES } from "@zootopia/shared-config";
import { redirect } from "next/navigation";

import {
  ConfirmEmailPanel,
  type ConfirmEmailFlow,
} from "@/components/auth/confirm-email-panel";
import { PublicAuthShell } from "@/components/auth/public-auth-shell";
import { LocaleToggle } from "@/components/preferences/locale-toggle";
import { ThemeToggle } from "@/components/preferences/theme-toggle";
import { getAuthenticatedUserRedirectPath } from "@/lib/return-to";
import { getRequestUiContext } from "@/lib/server/request-context";
import { getRuntimeFlags } from "@/lib/server/runtime";
import { getAuthenticatedSessionUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

type SearchParamValue = string | string[] | undefined;

type ConfirmEmailPageProps = {
  searchParams: Promise<Record<string, SearchParamValue>>;
};

function getFirstSearchParamValue(value: SearchParamValue) {
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] ?? "" : "";
}

function resolveFlow(value: string): ConfirmEmailFlow {
  if (value === "admin" || value === "sign_up" || value === "sign_in") {
    return value;
  }

  return "sign_in";
}

function resolveFromRoute(value: string, flow: ConfirmEmailFlow) {
  if (value === APP_ROUTES.login || value === APP_ROUTES.adminLogin) {
    return value;
  }

  return flow === "admin" ? APP_ROUTES.adminLogin : APP_ROUTES.login;
}

export default async function ConfirmEmailPage({
  searchParams,
}: ConfirmEmailPageProps) {
  const [resolvedSearchParams, user, uiContext] = await Promise.all([
    searchParams,
    getAuthenticatedSessionUser(),
    getRequestUiContext(),
  ]);

  if (user) {
    redirect(getAuthenticatedUserRedirectPath(user));
  }

  const runtimeFlags = getRuntimeFlags();
  const flow = resolveFlow(getFirstSearchParamValue(resolvedSearchParams.flow).trim());
  const fromRoute = resolveFromRoute(
    getFirstSearchParamValue(resolvedSearchParams.from).trim(),
    flow,
  );
  const email = getFirstSearchParamValue(resolvedSearchParams.email).trim().slice(0, 320);

  return (
    <PublicAuthShell
      eyebrow={uiContext.messages.confirmEmailSupportLabel}
      title={uiContext.messages.confirmEmailTitle}
      subtitle={uiContext.messages.confirmEmailSubtitle}
      imageAlt={uiContext.messages.loginTitle}
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
        <ConfirmEmailPanel
          messages={uiContext.messages}
          supabaseAuthReady={runtimeFlags.supabaseAuth}
          initialEmail={email}
          flow={flow}
          fromRoute={fromRoute}
        />
      </div>
    </PublicAuthShell>
  );
}
