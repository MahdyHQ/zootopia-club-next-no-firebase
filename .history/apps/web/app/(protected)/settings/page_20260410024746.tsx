import { APP_ROUTES } from "@zootopia/shared-config";
import {
  Activity,
  BookOpen,
  Globe2,
  Mail,
  Phone,
  Settings2,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import { LocaleToggle } from "@/components/preferences/locale-toggle";
import { ThemeToggle } from "@/components/preferences/theme-toggle";
import { ProfileSettingsForm } from "@/components/settings/profile-settings-form";
import {
  buildProfileCountryOptions,
  findProfileCountryOptionByCanonicalLabel,
  resolveProfileCountryOption,
} from "@/lib/profile-country-options";
import { sanitizeUserReturnTo } from "@/lib/return-to";
import { getRequestUiContext } from "@/lib/server/request-context";
import { getRuntimeFlags } from "@/lib/server/runtime";
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

  const runtimeFlags = getRuntimeFlags();
  const requestedReturnTo = Array.isArray(resolvedSearchParams.returnTo)
    ? resolvedSearchParams.returnTo[0]
    : resolvedSearchParams.returnTo;
  const returnTo = sanitizeUserReturnTo(requestedReturnTo);
  const countryOptions = buildProfileCountryOptions(uiContext.locale);
  const nationalityOption = user.nationality
    ? findProfileCountryOptionByCanonicalLabel(countryOptions, user.nationality)
    : null;
  const phoneCountryOption = user.phoneCountryIso2
    ? resolveProfileCountryOption(countryOptions, user.phoneCountryIso2)
    : null;

  const runtimeServices = [
    { label: "Supabase Auth", status: runtimeFlags.supabaseAuth },
    { label: "Google AI", status: runtimeFlags.googleAi },
    { label: "Qwen Models", status: runtimeFlags.qwen },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <section className="relative overflow-hidden rounded-[2.5rem] border border-white/30 bg-[linear-gradient(135deg,rgba(255,255,255,0.88),rgba(241,249,247,0.72))] px-6 py-7 shadow-[0_26px_80px_rgba(2,6,23,0.08)] backdrop-blur-xl dark:border-white/10 dark:bg-[linear-gradient(145deg,rgba(5,14,23,0.72),rgba(3,11,19,0.62))] sm:px-8 sm:py-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.13),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(242,198,106,0.14),transparent_42%)]" />

        <div className="relative z-10 max-w-5xl space-y-3">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/12 dark:text-emerald-200">
            <Settings2 className="h-4 w-4" />
            {uiContext.messages.navSettings}
          </span>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-black tracking-[-0.05em] text-zinc-950 dark:text-white sm:text-4xl lg:text-5xl">
            {uiContext.messages.settingsTitle}
          </h1>
          <p className="max-w-3xl text-sm leading-7 text-foreground-muted sm:text-base">
            {uiContext.messages.settingsSubtitle}
          </p>

          {user.role !== "admin" && !user.profileCompleted ? (
            <div className="inline-flex max-w-3xl items-center gap-3 rounded-[1.25rem] border border-amber-500/24 bg-amber-500/12 px-4 py-3 text-sm font-semibold text-amber-700 dark:border-amber-400/28 dark:bg-amber-400/12 dark:text-amber-200">
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
          initialNationality={user.nationality ?? ""}
          locale={uiContext.locale}
          returnTo={returnTo ?? APP_ROUTES.settings}
          profileCompleted={user.role === "admin" || user.profileCompleted}
          isAdmin={user.role === "admin"}
        />
      </section>

      <section className="space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-slate-300/70 bg-white/75 px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-slate-700 shadow-sm dark:border-slate-700/70 dark:bg-slate-950/70 dark:text-slate-200">
          <Activity className="h-3.5 w-3.5" />
          {uiContext.messages.preferencesTitle}
        </div>

        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          <section className="rounded-[1.9rem] border border-white/28 bg-[linear-gradient(160deg,rgba(255,255,255,0.9),rgba(244,249,248,0.8))] p-5 shadow-[0_20px_54px_rgba(2,6,23,0.08)] backdrop-blur-xl dark:border-white/10 dark:bg-[linear-gradient(150deg,rgba(8,18,29,0.74),rgba(4,12,21,0.66))]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-600 dark:text-zinc-300">
                  {uiContext.messages.signedInAs}
                </p>
                <h2 className="mt-2 truncate font-[family-name:var(--font-display)] text-2xl font-black tracking-[-0.04em] text-zinc-950 dark:text-white">
                  {user.fullName || user.displayName || user.email || user.uid}
                </h2>
                <p className="mt-1 truncate text-sm text-foreground-muted">
                  {user.email || user.uid}
                </p>
              </div>
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-zinc-200/85 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                <UserRound className="h-5 w-5" />
              </span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${
                  user.role === "admin"
                    ? "border border-purple-500/20 bg-purple-500/10 text-purple-700 dark:border-purple-400/20 dark:bg-purple-400/10 dark:text-purple-200"
                    : "border border-slate-300/80 bg-white/85 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                }`}
              >
                {user.role === "admin"
                  ? uiContext.messages.roleAdmin
                  : uiContext.messages.roleUser}
              </span>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${
                  user.status === "active"
                    ? "border border-emerald-500/18 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/18 dark:bg-emerald-400/10 dark:text-emerald-200"
                    : "border border-red-500/18 bg-red-500/10 text-red-700 dark:border-red-400/18 dark:bg-red-400/10 dark:text-red-200"
                }`}
              >
                {user.status === "active"
                  ? uiContext.messages.statusActive
                  : uiContext.messages.statusSuspended}
              </span>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${
                  user.role === "admin" || user.profileCompleted
                    ? "border border-blue-500/18 bg-blue-500/10 text-blue-700 dark:border-blue-400/18 dark:bg-blue-400/10 dark:text-blue-200"
                    : "border border-amber-500/18 bg-amber-500/10 text-amber-700 dark:border-amber-400/18 dark:bg-amber-400/10 dark:text-amber-200"
                }`}
              >
                {user.role === "admin"
                  ? uiContext.messages.profileCompletionAdminExemptBadge
                  : user.profileCompleted
                    ? uiContext.messages.profileCompletionCompleteStatus
                    : uiContext.messages.profileCompletionIncompleteStatus}
              </span>
            </div>

            <div className="mt-4 space-y-2.5">
              <div className="flex items-center gap-2.5 rounded-[1rem] border border-white/40 bg-white/80 px-3 py-2.5 dark:border-white/10 dark:bg-slate-950/70">
                <Mail className="h-4 w-4 text-emerald-700 dark:text-emerald-200" />
                <span className="min-w-0 truncate text-sm text-foreground-muted">{user.email || user.uid}</span>
              </div>
              {user.universityCode ? (
                <div className="flex items-center gap-2.5 rounded-[1rem] border border-white/40 bg-white/80 px-3 py-2.5 dark:border-white/10 dark:bg-slate-950/70">
                  <BookOpen className="h-4 w-4 text-emerald-700 dark:text-emerald-200" />
                  <span className="text-sm text-foreground-muted">{uiContext.messages.settingsUniversityCodeLabel}</span>
                  <span className="ms-auto rounded-md border border-slate-300/75 bg-white/85 px-2 py-0.5 font-mono text-sm text-zinc-950 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                    {user.universityCode}
                  </span>
                </div>
              ) : null}
              {user.phoneNumber ? (
                <div className="flex items-center gap-2.5 rounded-[1rem] border border-white/40 bg-white/80 px-3 py-2.5 dark:border-white/10 dark:bg-slate-950/70">
                  <Phone className="h-4 w-4 text-emerald-700 dark:text-emerald-200" />
                  <span className="text-sm text-foreground-muted">
                    {phoneCountryOption ? `${phoneCountryOption.flag} ` : ""}
                    {user.phoneNumber}
                  </span>
                </div>
              ) : null}
              {nationalityOption ? (
                <div className="flex items-center gap-2.5 rounded-[1rem] border border-white/40 bg-white/80 px-3 py-2.5 dark:border-white/10 dark:bg-slate-950/70">
                  <Globe2 className="h-4 w-4 text-emerald-700 dark:text-emerald-200" />
                  <span className="text-sm text-foreground-muted">
                    {nationalityOption.flag} {nationalityOption.label}
                  </span>
                </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-[1.9rem] border border-white/28 bg-[linear-gradient(160deg,rgba(255,255,255,0.9),rgba(243,247,255,0.8))] p-5 shadow-[0_20px_54px_rgba(2,6,23,0.08)] backdrop-blur-xl dark:border-white/10 dark:bg-[linear-gradient(150deg,rgba(9,16,31,0.72),rgba(5,12,25,0.66))]">
            <div className="mb-5 flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-500/12 text-blue-700 dark:text-blue-200">
                <Settings2 className="h-4.5 w-4.5" />
              </span>
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-blue-700 dark:text-blue-200">
                  {uiContext.messages.preferencesTitle}
                </p>
                <p className="mt-1 text-sm text-foreground-muted">{uiContext.messages.settingsSubtitle}</p>
              </div>
            </div>

            <div className="space-y-5">
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

          <section className="rounded-[1.9rem] border border-white/28 bg-[linear-gradient(165deg,rgba(255,255,255,0.9),rgba(241,248,246,0.82))] p-5 shadow-[0_20px_54px_rgba(2,6,23,0.08)] backdrop-blur-xl dark:border-white/10 dark:bg-[linear-gradient(150deg,rgba(7,16,28,0.72),rgba(3,11,21,0.66))] lg:col-span-2 2xl:col-span-1">
            <div className="mb-5 flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/12 text-emerald-700 dark:text-emerald-200">
                <Activity className="h-4.5 w-4.5" />
              </span>
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-200">
                  {uiContext.messages.runtimeStatusTitle}
                </p>
                <p className="mt-1 text-sm text-foreground-muted">{uiContext.messages.authRuntimeTitle}</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-1">
              {runtimeServices.map((service) => (
                <div
                  key={service.label}
                  className="rounded-[1.15rem] border border-white/40 bg-white/80 px-4 py-3 shadow-[0_12px_26px_rgba(2,6,23,0.06)] dark:border-white/10 dark:bg-slate-950/72"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-zinc-950 dark:text-white">{service.label}</p>
                    <span
                      className={`inline-flex h-2.5 w-2.5 rounded-full ${
                        service.status
                          ? "bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.8)]"
                          : "bg-amber-500"
                      }`}
                    />
                  </div>
                  <p className="mt-2 text-[11px] font-black uppercase tracking-[0.16em] text-foreground-muted">
                    {service.status ? uiContext.messages.statusOn : uiContext.messages.statusOff}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {user.role === "admin" ? (
            <section className="rounded-[1.9rem] border border-purple-500/20 bg-purple-500/8 p-5 shadow-[0_20px_50px_rgba(2,6,23,0.08)] dark:border-purple-400/18 dark:bg-purple-400/10 lg:col-span-2 2xl:col-span-3">
              <div className="flex items-start gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-purple-500/14 text-purple-700 dark:text-purple-200">
                  <ShieldCheck className="h-4.5 w-4.5" />
                </span>
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-purple-700 dark:text-purple-200">
                    {uiContext.messages.profileCompletionAdminExemptTitle}
                  </p>
                  <p className="mt-2 text-sm leading-7 text-foreground-muted">
                    {uiContext.messages.profileCompletionAdminExemptBody}
                  </p>
                </div>
              </div>
            </section>
          ) : null}
        </div>
      </section>
    </div>
  );
}
