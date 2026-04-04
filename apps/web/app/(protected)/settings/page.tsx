import { LocaleToggle } from "@/components/preferences/locale-toggle";
import { ProfileSettingsForm } from "@/components/settings/profile-settings-form";
import { ThemeToggle } from "@/components/preferences/theme-toggle";
import { sanitizeUserReturnTo } from "@/lib/return-to";
import { getRequestUiContext } from "@/lib/server/request-context";
import { getRuntimeFlags } from "@/lib/server/runtime";
import { requireAuthenticatedUser } from "@/lib/server/session";
import { Settings2, User, ShieldCheck, Activity, BookOpen, AlertTriangle } from "lucide-react";

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

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <section className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-white/40 dark:bg-zinc-950/40 backdrop-blur-2xl p-8 md:p-12 shadow-2xl shadow-emerald-900/5">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-teal-900/10 pointer-events-none" />
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-emerald-500/10 dark:bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
              <Settings2 className="mr-2 h-4 w-4" />
              {uiContext.messages.navSettings}
            </span>
          </div>
          <h1 className="font-[family-name:var(--font-display)] text-4xl md:text-5xl font-black tracking-tight text-zinc-900 dark:text-white">
            {uiContext.messages.settingsTitle}
          </h1>
          
          {user.role !== "admin" && !user.profileCompleted ? (
            <div className="mt-4 flex items-start gap-3 rounded-[1.5rem] border border-red-500/20 bg-red-500/10 p-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
              <p className="text-sm font-semibold leading-relaxed text-red-700 dark:text-red-400">
                {uiContext.messages.profileCompletionRequiredNotice}
              </p>
            </div>
          ) : null}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div className="space-y-6">
          {user.role === "admin" ? (
            <section className="relative overflow-hidden rounded-[2.5rem] border border-white/20 dark:border-white/5 bg-white/60 dark:bg-zinc-950/40 backdrop-blur-xl p-8 shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-purple-600 dark:text-purple-400">
                  {uiContext.messages.settingsProfileTitle}
                </p>
              </div>
              <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
                {uiContext.messages.profileCompletionAdminExemptTitle}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">      
                {uiContext.messages.profileCompletionAdminExemptBody}
              </p>
            </section>
          ) : (
            <ProfileSettingsForm
              messages={uiContext.messages}
              initialFullName={user.fullName ?? ""}
              initialUniversityCode={user.universityCode ?? ""}
              returnTo={returnTo}
              profileCompleted={user.profileCompleted}
            />
          )}

          <section className="relative overflow-hidden rounded-[2.5rem] border border-white/20 dark:border-white/5 bg-white/60 dark:bg-zinc-950/40 backdrop-blur-xl p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-8">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                <Settings2 className="h-5 w-5" />
              </div>
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400">
                {uiContext.messages.preferencesTitle}
              </p>
            </div>
            <div className="space-y-6">
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

        <section className="relative overflow-hidden rounded-[2.5rem] border border-white/20 dark:border-white/5 bg-white/60 dark:bg-zinc-950/40 backdrop-blur-xl p-8 shadow-sm flex flex-col h-full">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
                <Activity className="h-5 w-5" />
              </div>
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">
                {uiContext.messages.runtimeStatusTitle}
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 mb-8">
            {[
              { label: "Firebase Admin", status: runtimeFlags.firebaseAdmin },
              { label: "Google AI", status: runtimeFlags.googleAi },
              { label: "Qwen Models", status: runtimeFlags.qwen }
            ].map((service, i) => (
              <div key={i} className="group relative overflow-hidden rounded-2xl border border-white/40 dark:border-white/5 bg-white/40 dark:bg-zinc-900/40 p-5 transition-all hover:bg-white/60 dark:hover:bg-zinc-800/60">
                <div className={`mb-3 inline-flex h-2 w-2 rounded-full ${service.status ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-amber-500'}`} />
                <div className="text-xl font-black tracking-tight text-zinc-900 dark:text-white">
                  {service.status ? uiContext.messages.statusOn : uiContext.messages.statusOff}
                </div>
                <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  {service.label}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-auto relative overflow-hidden rounded-[2rem] border border-white/40 dark:border-white/5 bg-white/50 dark:bg-zinc-900/50 p-6 backdrop-blur-sm">
            <div className="absolute top-0 right-0 p-6 opacity-5 dark:opacity-10 pointer-events-none">
              <User className="h-24 w-24" />
            </div>
            <div className="relative z-10">
              <p className="font-bold text-lg text-zinc-900 dark:text-white flex items-center gap-2">
                {user.fullName || user.displayName || user.email || user.uid}
              </p>
              
              <div className="mt-4 flex flex-wrap gap-2">
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                  user.role === "admin" 
                    ? "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300 border border-purple-200 dark:border-purple-500/30"
                    : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-700"
                }`}>
                  {user.role === "admin" ? <ShieldCheck className="mr-1 h-3 w-3" /> : <User className="mr-1 h-3 w-3" />}
                  {user.role === "admin" ? uiContext.messages.roleAdmin : uiContext.messages.roleUser}
                </span>

                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                  user.status === "active"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30"
                    : "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300 border border-red-200 dark:border-red-500/30"
                }`}>
                  {user.status === "active" ? uiContext.messages.statusActive : uiContext.messages.statusSuspended}
                </span>
                
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider border ${
                  user.role === "admin" || user.profileCompleted
                    ? "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800/50"
                    : "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800/50"
                }`}>
                  {user.role === "admin"
                    ? uiContext.messages.profileCompletionAdminExemptTitle
                    : user.profileCompleted
                      ? uiContext.messages.profileCompletionCompleteStatus
                      : uiContext.messages.profileCompletionIncompleteStatus}       
                </span>
              </div>

              {user.universityCode ? (
                <div className="mt-4 flex items-center gap-2 text-sm font-medium text-zinc-600 dark:text-zinc-400">      
                  <BookOpen className="h-4 w-4" />
                  <span>{uiContext.messages.settingsUniversityCodeLabel}:</span>
                  <span className="font-mono text-zinc-900 dark:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-md border border-zinc-200 dark:border-zinc-700">{user.universityCode}</span>
                </div>
              ) : null}
            </div>          </div>
        </section>
      </div>
    </div>
  );
}
