import { APP_ROUTES } from "@zootopia/shared-config";
import {
  Construction,
  FlaskConical,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import { redirect } from "next/navigation";

import { AuthTopControls } from "@/components/auth/auth-top-controls";
import { PublicAuthShell } from "@/components/auth/public-auth-shell";
import { isMaintenanceModeEnabled } from "@/lib/maintenance-mode";
import { getAuthenticatedUserRedirectPath } from "@/lib/return-to";
import { getRequestUiContext } from "@/lib/server/request-context";
import { getAuthenticatedSessionUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const MAINTENANCE_STATUS_ITEMS = [
  {
    key: "maintenance-status-upgrade",
    icon: Construction,
  },
  {
    key: "maintenance-status-quality",
    icon: FlaskConical,
  },
  {
    key: "maintenance-status-security",
    icon: ShieldCheck,
  },
] as const;

export default async function MaintenancePage() {
  const [user, uiContext] = await Promise.all([
    getAuthenticatedSessionUser(),
    getRequestUiContext(),
  ]);

  const maintenanceEnabled = isMaintenanceModeEnabled();

  // Keep normal routing behavior when maintenance mode is off.
  if (!maintenanceEnabled) {
    if (user) {
      redirect(getAuthenticatedUserRedirectPath(user));
    }

    redirect(APP_ROUTES.login);
  }

  // Admin users always bypass maintenance view.
  if (user?.role === "admin") {
    redirect(getAuthenticatedUserRedirectPath(user));
  }

  return (
    <PublicAuthShell
      eyebrow={uiContext.messages.maintenancePageEyebrow}
      title={uiContext.messages.maintenancePageTitle}
      subtitle={uiContext.messages.maintenancePageSubtitle}
      imageAlt={uiContext.messages.maintenancePageTitle}
      compact
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
      <div
        dir="rtl"
        className="w-full rounded-[1.6rem] border border-amber-500/25 bg-[linear-gradient(155deg,rgba(251,191,36,0.13),rgba(14,165,233,0.08),rgba(16,185,129,0.08))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_24px_48px_rgba(4,14,24,0.24)] backdrop-blur-xl sm:p-6"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-amber-500/35 bg-amber-500/16 text-amber-800 dark:text-amber-200">
            <Wrench className="h-4.5 w-4.5" />
          </span>
          <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/16 px-3 py-1 text-xs font-semibold text-amber-900/90 dark:text-amber-100">
            {uiContext.messages.maintenanceStatusLabel}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/25 bg-sky-500/14 px-3 py-1 text-xs font-semibold text-sky-900/90 dark:text-sky-100">
            <Sparkles className="h-3.5 w-3.5" />
            {uiContext.messages.maintenanceStatusHighlight}
          </span>
        </div>

        {/* This Arabic block is the canonical public communication surface for maintenance mode.
            Keep it respectful and brand-consistent, and avoid replacing it with generic error copy. */}
        <div className="mt-4 space-y-3 text-right">
          <h2 className="font-[family-name:var(--font-display)] text-[1.36rem] font-bold leading-8 text-foreground sm:text-[1.5rem] sm:leading-9">
            {uiContext.messages.maintenanceArabicHeadline}
          </h2>
          <p className="text-sm leading-7 text-foreground-muted sm:text-[0.95rem]">
            {uiContext.messages.maintenanceArabicBody}
          </p>
          <p className="text-sm font-semibold leading-7 text-foreground/90">
            {uiContext.messages.maintenanceArabicApology}
          </p>
        </div>

        <div className="mt-5 grid gap-2.5 sm:grid-cols-3">
          {MAINTENANCE_STATUS_ITEMS.map((item) => {
            const Icon = item.icon;

            return (
              <div
                key={item.key}
                className="rounded-xl border border-white/20 bg-background/55 px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
              >
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Icon className="h-4 w-4 text-emerald-700 dark:text-emerald-200" />
                  <span>
                    {item.key === "maintenance-status-upgrade"
                      ? uiContext.messages.maintenanceStatusUpgrade
                      : item.key === "maintenance-status-quality"
                        ? uiContext.messages.maintenanceStatusQuality
                        : uiContext.messages.maintenanceStatusSecurity}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </PublicAuthShell>
  );
}
