import { APP_ROUTES } from "@zootopia/shared-config";
import { Settings2, ShieldCheck } from "lucide-react";
import Image from "next/image";

import { LocaleToggle } from "@/components/preferences/locale-toggle";
import { ThemeToggle } from "@/components/preferences/theme-toggle";
import { ProfileSettingsForm } from "@/components/settings/profile-settings-form";
import {
  resolveAvatarDisplayName,
  resolveAvatarFallbackInitial,
  resolveRoleGenderAvatarSrc,
} from "@/lib/avatar";
import { sanitizeUserReturnTo } from "@/lib/return-to";
import { getRequestUiContext } from "@/lib/server/request-context";
import { requireAuthenticatedUser } from "@/lib/server/session";

type SettingsPageProps = {
  searchParams: Promise<{
    returnTo?: string | string[];
  }>;
};

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const [resolvedSearchParams, user, uiContext] = await Promise.all([
    searchParams,
    requireAuthenticatedUser(),
    getRequestUiContext(),
  ]);

  const requestedReturnTo = Array.isArray(resolvedSearchParams.returnTo)
    ? resolvedSearchParams.returnTo[0]
    : resolvedSearchParams.returnTo;
  const returnTo = sanitizeUserReturnTo(requestedReturnTo);
  const settingsAvatarSrc = resolveRoleGenderAvatarSrc(user);
  const settingsAvatarInitial = resolveAvatarFallbackInitial(user);
  const settingsDisplayName = resolveAvatarDisplayName(user);

  return (
    <div className="space-y-7 animate-in fade-in duration-700 lg:space-y-8">
      <section className="relative overflow-hidden rounded-[2.1rem] border border-white/24 bg-[linear-gradient(135deg,rgba(255,255,255,0.82),rgba(241,249,247,0.62))] px-5 py-6 shadow-[0_22px_64px_rgba(2,6,23,0.07)] backdrop-blur-xl dark:border-white/10 dark:bg-[linear-gradient(145deg,rgba(5,14,23,0.64),rgba(3,11,19,0.54))] sm:px-7 sm:py-7">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.13),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(242,198,106,0.14),transparent_42%)]" />

        <div className="relative z-10 max-w-5xl space-y-3.5">
          {/* Keep settings identity compact and aligned with header avatar policy so this hero does not grow into a second profile card. */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/12 dark:text-emerald-200">
              <Settings2 className="h-4 w-4" />
              {uiContext.messages.navSettings}
            </span>

            <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-white/55 bg-white/62 px-2.5 py-1 shadow-sm dark:border-white/15 dark:bg-slate-950/48">
              <span className="relative flex h-8 w-8 shrink-0 overflow-hidden rounded-full border border-emerald-500/30 bg-emerald-500/20">
                {settingsAvatarSrc ? (
                  <Image
                    src={settingsAvatarSrc}
                    alt=""
                    aria-hidden="true"
                    width={32}
                    height={32}
                    sizes="32px"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-xs font-black uppercase text-emerald-400">
                    {settingsAvatarInitial}
                  </span>
                )}
              </span>
              <span className="max-w-[8.5rem] truncate text-[10px] font-black uppercase tracking-[0.18em] text-foreground-muted sm:max-w-[11rem]">
                {settingsDisplayName}
              </span>
            </span>
          </div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-black tracking-[-0.05em] text-zinc-950 dark:text-white sm:text-3xl lg:text-4xl">
            {uiContext.messages.settingsTitle}
          </h1>
          <p className="max-w-3xl text-sm leading-6 text-foreground-muted sm:text-base">
            {uiContext.messages.settingsSubtitle}
          </p>

          {user.role !== "admin" && !user.profileCompleted ? (
            <div className="inline-flex max-w-3xl items-center gap-2.5 rounded-xl border border-amber-500/24 bg-amber-500/12 px-3.5 py-2.5 text-sm font-semibold text-amber-700 dark:border-amber-400/28 dark:bg-amber-400/12 dark:text-amber-200">
              <ShieldCheck className="h-4.5 w-4.5 shrink-0" />
              <span>{uiContext.messages.profileCompletionRequiredNotice}</span>
            </div>
          ) : null}
        </div>
      </section>

      {/* Settings hierarchy: keep the profile workflow as the single dominant full-width hero,
          then place all informational/support cards below in a lighter secondary grid. */}
      <section>
        <ProfileSettingsForm
          messages={uiContext.messages}
          initialFullName={user.fullName ?? ""}
          initialUniversityCode={user.universityCode ?? ""}
          initialPhoneNumber={user.phoneNumber ?? ""}
          initialPhoneCountryIso2={user.phoneCountryIso2 ?? null}
          initialGender={user.gender ?? ""}
          initialNationality={user.nationality ?? ""}
          locale={uiContext.locale}
          returnTo={returnTo ?? APP_ROUTES.settings}
          profileCompleted={user.role === "admin" || user.profileCompleted}
          isAdmin={user.role === "admin"}
        />
      </section>

      {/* Keep preferences in a single compact strip so settings stays dense and readable
          while preserving theme/locale controls on this page. */}
      <section className="rounded-[1.4rem] border border-white/20 bg-white/56 p-4 shadow-[0_18px_48px_rgba(2,6,23,0.07)] backdrop-blur-xl dark:border-white/8 dark:bg-slate-950/38 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-300/70 bg-white/68 px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-slate-700 shadow-sm dark:border-slate-700/70 dark:bg-slate-950/64 dark:text-slate-200">
            <Settings2 className="h-3.5 w-3.5" />
            {uiContext.messages.preferencesTitle}
          </span>
          {user.role === "admin" ? (
            <span className="inline-flex items-center rounded-full border border-purple-500/24 bg-purple-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-purple-700 dark:border-purple-400/24 dark:bg-purple-400/10 dark:text-purple-200">
              {uiContext.messages.profileCompletionAdminExemptBadge}
            </span>
          ) : null}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <ThemeToggle
            value={uiContext.themeMode}
            label={uiContext.messages.themeLabel}
            labels={{
              light: uiContext.messages.themeLight,
              dark: uiContext.messages.themeDark,
              system: uiContext.messages.themeSystem,
            }}
          />
          <LocaleToggle
            value={uiContext.locale}
            label={uiContext.messages.localeLabel}
            labels={{
              en: uiContext.messages.localeEnglish,
              ar: uiContext.messages.localeArabic,
            }}
          />
        </div>
      </section>
    </div>
  );
}
