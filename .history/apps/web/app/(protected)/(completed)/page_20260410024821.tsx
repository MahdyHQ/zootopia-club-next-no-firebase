import { APP_ROUTES } from "@zootopia/shared-config";
import Link from "next/link";
import Image from "next/image";
import {
  FileText,
  BrainCircuit,
  PieChart,
  UploadCloud,
  Settings2,
  Database,
  ChevronRight,
  MonitorPlay,
  FileCheck,
  Crown,
  ShieldCheck,
} from "lucide-react";

import { getRequestUiContext } from "@/lib/server/request-context";
import { getRuntimeFlags } from "@/lib/server/runtime";
import { getSiteContent } from "@/lib/site-content";
import {
  listAssessmentGenerationsForUser,
  listDocumentsForUser,
  listInfographicGenerationsForUser,
} from "@/lib/server/repository";
import { requireCompletedUser } from "@/lib/server/session";
import { PlatformStoryCta } from "@/components/home/platform-story-cta";
import { Button } from "@/components/ui/button";

export default async function HomePage() {
  const [user, uiContext] = await Promise.all([
    requireCompletedUser(APP_ROUTES.home),
    getRequestUiContext(),
  ]);
  const canAccessInfographic = user.role === "admin";
  const [documents, assessments, infographics] = await Promise.all([
    listDocumentsForUser(user.uid),
    listAssessmentGenerationsForUser(user.uid),
    canAccessInfographic
      ? listInfographicGenerationsForUser(user.uid)
      : Promise.resolve([]),
  ]);
  const runtimeFlags = getRuntimeFlags();
  const siteContent = getSiteContent(uiContext.locale);

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <section className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-white/40 dark:bg-zinc-950/40 backdrop-blur-2xl p-8 md:p-12 shadow-2xl shadow-emerald-900/5">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-teal-900/10 pointer-events-none" />
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-emerald-500/10 dark:bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                <MonitorPlay className="mr-2 h-4 w-4" />
                {uiContext.messages.homeSectionLabel}
              </span>
            </div>
            <h1 className="font-[family-name:var(--font-display)] text-4xl md:text-5xl font-black tracking-tight text-zinc-900 dark:text-white max-w-3xl">
              {uiContext.messages.homeTitle}
            </h1>
            
          </div>
          
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: uiContext.messages.recentDocumentsTitle, value: documents.length, icon: Database, color: "text-blue-500", bg: "bg-blue-500/10" },
              { label: uiContext.messages.recentAssessmentsTitle, value: assessments.length, icon: BrainCircuit, color: "text-purple-500", bg: "bg-purple-500/10" },
              { label: uiContext.messages.recentInfographicsTitle, value: infographics.length, icon: PieChart, color: "text-amber-500", bg: "bg-amber-500/10" },
            ].map((stat, i) => (
              <div key={i} className="group relative overflow-hidden rounded-[1.5rem] border border-white/20 dark:border-white/5 bg-white/60 dark:bg-zinc-900/40 backdrop-blur-xl p-5 shadow-sm transition-all hover:bg-white/80 dark:hover:bg-zinc-900/60 hover:shadow-md">
                <div className="flex justify-between items-start mb-4">
                  <div className={`p-2.5 rounded-xl ${stat.bg}`}>
                    <stat.icon className={`h-5 w-5 ${stat.color}`} />
                  </div>
                </div>
                <div>
                  <div className="text-3xl font-black tracking-tighter text-zinc-900 dark:text-white">
                    {stat.value}
                  </div>
                  <div className="mt-1 text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                    {stat.label}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 mt-10 grid gap-4 lg:grid-cols-4">
          {[
            { href: APP_ROUTES.upload, label: uiContext.messages.navUpload, title: uiContext.messages.uploadWorkspaceTitle, subtitle: uiContext.messages.uploadPageWorkspaceDetail, icon: UploadCloud },
            { href: APP_ROUTES.assessment, label: uiContext.messages.navAssessment, title: uiContext.messages.assessmentTitle, subtitle: uiContext.messages.assessmentSubtitle, icon: BrainCircuit },
            { href: APP_ROUTES.infographic, label: uiContext.messages.navInfographic, title: uiContext.messages.infographicTitle, subtitle: uiContext.messages.infographicSubtitle, icon: PieChart, locked: !canAccessInfographic },
            { href: APP_ROUTES.settings, label: uiContext.messages.navSettings, title: uiContext.messages.settingsTitle, subtitle: uiContext.messages.settingsSubtitle, icon: Settings2 },
          ].map((card, i) => (
            card.locked ? (
              <article key={i} className="relative overflow-hidden rounded-[1.7rem] border border-amber-500/12 bg-white/40 dark:bg-zinc-900/20 p-6">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2">
                    <card.icon className="h-5 w-5 text-amber-500" />
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-500">
                      {card.label}
                    </p>
                  </div>
                  <span className="inline-flex items-center rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-200">
                    {uiContext.messages.comingSoonLabel}
                  </span>
                </div>
                <h2 className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight text-zinc-900 dark:text-white">
                  {card.title}
                </h2>
                <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                  {uiContext.messages.infographicLockedBody}
                </p>
              </article>
            ) : (
              <Link key={i} href={card.href} className="group relative overflow-hidden rounded-[1.7rem] border border-white/20 dark:border-white/5 bg-white/50 dark:bg-zinc-900/30 p-6 transition-all hover:bg-white/80 dark:hover:bg-zinc-900/50 hover:shadow-lg hover:-translate-y-1">
                <div className="absolute top-0 right-0 p-6 opacity-0 -translate-x-4 transition-all group-hover:opacity-10 group-hover:translate-x-0">
                  <card.icon className="h-12 w-12 text-emerald-500" />
                </div>
                <div className="flex items-center gap-2 mb-4">
                  <card.icon className="h-5 w-5 text-emerald-500" />
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">
                    {card.label}
                  </p>
                </div>
                <h2 className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight text-zinc-900 dark:text-white">
                  {card.title}
                </h2>
              </Link>
            )
          ))}
        </div>

        {/* Keep this Hall of Honor access block singular and full-width so homepage discovery
            is clear without crowding the workspace card grid or diluting tool ownership. */}
        <div className="relative z-10 mt-6">
          <Link
            href={APP_ROUTES.hallOfHonor}
            className="group block overflow-hidden rounded-[1.9rem] border border-white/20 dark:border-white/6 bg-white/70 dark:bg-zinc-900/45 p-5 md:p-6 transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/85 dark:hover:bg-zinc-900/65 hover:shadow-lg"
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(242,198,106,0.18),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.12),transparent_34%)] opacity-80" />
            <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div className="space-y-2">
                <p className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-gold">
                  <Crown className="h-4 w-4" />
                  {uiContext.messages.homeHallOfHonorLabel}
                </p>
                <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
                  {uiContext.messages.homeHallOfHonorTitle}
                </h2>
                <p className="max-w-2xl text-sm leading-7 text-zinc-600 dark:text-zinc-300">
                  {uiContext.messages.homeHallOfHonorBody}
                </p>
              </div>

              {/* Preserve dual-portrait framing here as a compact preview only; full tribute hierarchy
                  lives on the Hall of Honor page where Elmahdy remains the clear featured center. */}
              <div className="flex items-center gap-3 md:gap-4">
                <div className="relative h-16 w-16 overflow-hidden rounded-full border-2 border-gold/70 shadow-[0_0_0_4px_rgba(242,198,106,0.18)]">
                  <Image
                    src="/elmahdy1.jpeg"
                    alt="Elmahdy Abdallah Yousef"
                    fill
                    sizes="64px"
                    className="object-cover"
                  />
                </div>
                <div className="relative h-12 w-12 overflow-hidden rounded-full border border-emerald-400/50">
                  <Image
                    src="/adham.jpg"
                    alt="Adham Essam"
                    fill
                    sizes="48px"
                    className="object-cover"
                  />
                </div>
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/12 px-3 py-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-200">
                  {uiContext.messages.homeHallOfHonorAction}
                  <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </div>
          </Link>
        </div>

        {/* Keep this CTA in Home as the discovery entrypoint for the roadmap infographic,
            while the full long-form narrative stays owned by /journey. */}
        <div className="relative z-10 mt-6">
          <PlatformStoryCta />
        </div>

        <div className="relative z-10 mt-8 flex flex-wrap gap-2">
          {[
            { label: "Supabase Auth", status: runtimeFlags.supabaseAuth },
            { label: "Google AI", status: runtimeFlags.googleAi },
            { label: "Qwen", status: runtimeFlags.qwen },
          ].map((flag, i) => (
            <span key={i} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider border ${
              flag.status 
                ? "bg-emerald-100/50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20"
                : "bg-amber-100/50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border-amber-200 dark:border-amber-500/20"
            }`}>
              <div className={`h-1.5 w-1.5 rounded-full ${flag.status ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              {flag.label} {flag.status ? uiContext.messages.statusReady : uiContext.messages.statusFallback}
            </span>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
        <div className="relative overflow-hidden rounded-[2.5rem] border border-white/20 dark:border-white/5 bg-white/60 dark:bg-zinc-950/40 backdrop-blur-2xl p-8 flex flex-col justify-between">
          <div className="absolute top-0 right-0 p-8 opacity-5">
            <UploadCloud className="h-48 w-48 text-emerald-500 -rotate-12" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
                <UploadCloud className="h-5 w-5" />
              </div>
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">
                {uiContext.messages.navUpload}
              </p>
            </div>
            <h2 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
              {uiContext.messages.uploadPageFlowTitle}
            </h2>
            
          </div>
          <div className="relative z-10 mt-8 pt-8 border-t border-zinc-200 dark:border-zinc-800">
            <Button asChild size="lg" className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/20 group">
              <Link href={APP_ROUTES.upload}>
                <UploadCloud className="mr-2 h-5 w-5" />
                {uiContext.messages.navUpload}
                <ChevronRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </Button>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[2.5rem] border border-white/20 dark:border-white/5 bg-white/60 dark:bg-zinc-950/40 backdrop-blur-2xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <Database className="h-6 w-6 text-blue-500" />
            <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
              {uiContext.messages.recentDocumentsTitle}
            </h2>
          </div>
          <div className="space-y-3">
            {documents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-800 bg-white/30 dark:bg-zinc-900/20">
                <FileCheck className="h-10 w-10 text-zinc-400 dark:text-zinc-600 mb-3" />
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400 text-center">{uiContext.messages.noDocuments}</p>
              </div>
            ) : (
              documents.slice(0, 4).map((document) => (
                <div
                  key={document.id}
                  className="group flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-white/40 dark:border-white/5 bg-white/50 dark:bg-zinc-900/50 p-4 transition-all hover:bg-white/80 dark:hover:bg-zinc-800/80"
                >
                  <div className="flex items-start gap-4">
                    <div className="mt-1 p-2 rounded-xl bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-bold text-zinc-900 dark:text-white">{document.fileName}</p>
                      <p className="text-xs font-mono text-zinc-500 dark:text-zinc-400 mt-1">ID: {document.id.slice(0, 8)}...</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider border
                      ${document.status === 'ready'
                        ? 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/50'
                        : 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700'
                      }`}>
                      {document.status}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 text-[10px] font-bold tracking-wider text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                      {Math.max(1, Math.round(document.sizeBytes / 1024))} KB   
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="relative overflow-hidden rounded-[2.5rem] border border-white/20 dark:border-white/5 bg-white/60 dark:bg-zinc-950/40 backdrop-blur-xl p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <BrainCircuit className="h-6 w-6 text-purple-500" />
            <h2 className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight text-zinc-900 dark:text-white">
              {uiContext.messages.recentAssessmentsTitle}
            </h2>
          </div>
          <div className="space-y-3">
            {assessments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-4 rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-800 bg-white/30 dark:bg-zinc-900/20">
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400 text-center">{uiContext.messages.assessmentEmpty}</p>
              </div>
            ) : (
              assessments.slice(0, 4).map((generation) => (
                <div
                  key={generation.id}
                  className="flex items-center justify-between gap-4 rounded-xl border border-white/40 dark:border-white/5 bg-white/40 dark:bg-zinc-900/40 p-4 transition-all hover:bg-white/60 dark:hover:bg-zinc-800/60"
                >
                  <p className="font-bold text-zinc-900 dark:text-white truncate pr-4">{generation.title}</p>
                  <span className="shrink-0 inline-flex items-center rounded-full bg-purple-100 dark:bg-purple-900/30 px-2.5 py-1 text-xs font-bold text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-800/50">
                    {generation.questions.length} Qs
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[2.5rem] border border-white/20 dark:border-white/5 bg-white/60 dark:bg-zinc-950/40 backdrop-blur-xl p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <PieChart className="h-6 w-6 text-amber-500" />
            <h2 className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight text-zinc-900 dark:text-white">
              {uiContext.messages.recentInfographicsTitle}
            </h2>
          </div>
          <div className="space-y-3">
            {!canAccessInfographic ? (
              <div className="rounded-2xl border border-amber-500/12 bg-amber-500/[0.06] px-5 py-6">
                <span className="inline-flex items-center rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-200">
                  {uiContext.messages.comingSoonLabel}
                </span>
                <p className="mt-4 text-base font-semibold text-zinc-900 dark:text-white">
                  {uiContext.messages.infographicLockedTitle}
                </p>
                <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                  {uiContext.messages.infographicLockedBody}
                </p>
              </div>
            ) : infographics.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-4 rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-800 bg-white/30 dark:bg-zinc-900/20">
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400 text-center">{uiContext.messages.infographicEmpty}</p>
              </div>
            ) : (
              infographics.slice(0, 4).map((generation) => (
                <div
                  key={generation.id}
                  className="flex items-center justify-between gap-4 rounded-xl border border-white/40 dark:border-white/5 bg-white/40 dark:bg-zinc-900/40 p-4 transition-all hover:bg-white/60 dark:hover:bg-zinc-800/60"
                >
                  <p className="font-bold text-zinc-900 dark:text-white truncate pr-4">{generation.topic}</p>
                  <span className="shrink-0 inline-flex items-center rounded-full bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 text-[10px] font-mono tracking-tight text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 uppercase">
                    {generation.modelId.split('/').pop() || generation.modelId}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* Slash-route trust and privacy visibility block.
          Keep this at the very end of homepage content so legal discovery stays obvious for reviewers/users
          without crowding the main dashboard cards or changing existing feature ownership. */}
      <section>
        <div className="rounded-[1.35rem] border border-emerald-500/25 bg-emerald-500/8 p-4 dark:border-emerald-400/25 dark:bg-emerald-500/10">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">
            {uiContext.locale === "ar" ? "الثقة والخصوصية" : "Trust & Privacy"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Link
              href={APP_ROUTES.privacy}
              className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-white/70 px-3.5 py-1.5 text-sm font-semibold text-emerald-700 transition-colors hover:bg-white/90 hover:text-emerald-800 dark:border-emerald-300/30 dark:bg-zinc-950/55 dark:text-emerald-200 dark:hover:bg-zinc-900"
            >
              <ShieldCheck className="h-4 w-4" />
              {siteContent.navigation.privacy}
            </Link>
            <p className="text-xs leading-6 text-foreground-muted">
              {uiContext.locale === "ar"
                ? "متاح للعامة بدون تسجيل دخول"
                : "Public access, no sign-in required"}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
