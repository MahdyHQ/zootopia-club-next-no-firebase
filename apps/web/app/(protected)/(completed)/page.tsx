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
  ChevronDown,
  MonitorPlay,
  FileCheck,
  Crown,
  ShieldCheck,
  Rocket,
  MessageCircleMore,
  HandCoins,
  Lightbulb,
} from "lucide-react";

import { getRequestUiContext } from "@/lib/server/request-context";
import { getRuntimeFlags } from "@/lib/server/runtime";
import { getSiteContent } from "@/lib/site-content";
import { buildSmartTitleDisplay } from "@/lib/smart-title-display";
import {
  listAssessmentGenerationsForUser,
  listDocumentsForUser,
  listInfographicGenerationsForUser,
} from "@/lib/server/repository";
import { requireCompletedUser } from "@/lib/server/session";
import { PlatformStoryCta } from "@/components/home/platform-story-cta";
import { LectureSummaryComingSoonTeaser } from "@/components/home/lecture-summary-coming-soon-teaser";
import { PlatformSloganNote } from "@/components/branding/platform-slogan-note";
import { Button } from "@/components/ui/button";

export default async function HomePage() {
  const [user, uiContext] = await Promise.all([
    requireCompletedUser(APP_ROUTES.home),
    getRequestUiContext(),
  ]);
  const canAccessInfographic = user.role === "admin";
  let documents = [] as Awaited<ReturnType<typeof listDocumentsForUser>>;
  let assessments = [] as Awaited<ReturnType<typeof listAssessmentGenerationsForUser>>;
  let infographics = [] as Awaited<ReturnType<typeof listInfographicGenerationsForUser>>;

  try {
    [documents, assessments, infographics] = await Promise.all([
      listDocumentsForUser(user.uid),
      listAssessmentGenerationsForUser(user.uid),
      canAccessInfographic
        ? listInfographicGenerationsForUser(user.uid)
        : Promise.resolve([]),
    ]);
  } catch (error) {
    console.warn("[home-page] failed to load workspace datasets; rendering safe fallbacks", {
      uid: user.uid,
      error: error instanceof Error ? error.name : "UNKNOWN",
    });
  }

  const runtimeFlags = getRuntimeFlags();
  const siteContent = getSiteContent(uiContext.locale);
  const homeStats = [
    {
      key: "documents",
      label: uiContext.messages.recentDocumentsTitle,
      value: documents.length,
      icon: Database,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      key: "assessments",
      label: uiContext.messages.recentAssessmentsTitle,
      value: assessments.length,
      icon: BrainCircuit,
      color: "text-purple-500",
      bg: "bg-purple-500/10",
    },
    {
      key: "infographics",
      label: uiContext.messages.recentInfographicsTitle,
      value: infographics.length,
      icon: PieChart,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
    },
  ];

  const homeVisionCards = [
    {
      key: "platform-build-journey",
      title: "رحلة بناء المنصة",
      body: "تم تطوير وبرمجة هذه المنصة خلال شهر كامل من الجهد والتعب والتكلفة، ولولا فضل الله ثم الخبرة والبحث العميق والاستعانة بأحدث الأدوات والتقنيات المتاحة في الوقت الحالي، لامتد تنفيذ هذا العمل إلى تسعة أشهر أو أكثر بالطرق التقليدية القديمة. وقد حرصت على ابتكار العديد من الأفكار الجديدة والمميزة التي لم تكن موجودة من قبل في أي منصات أخرى حتى أبريل 2026.",
      emoji: "🛠️",
      icon: Rocket,
      iconTone:
        "border-cyan-300/35 bg-cyan-500/12 text-cyan-700 dark:border-cyan-400/30 dark:bg-cyan-400/10 dark:text-cyan-200",
    },
    {
      key: "community-voice",
      title: "عايز اسمك وصورتك ورأيك هنا؟",
      body: "لو حابب أضيف اسمك وصورتك ورأيك عن المنصة بشكل جميل داخل التجربة، تواصل معي وسأرتب ذلك بإذن الله.",
      emoji: "🖼️",
      icon: MessageCircleMore,
      iconTone:
        "border-fuchsia-300/35 bg-fuchsia-500/12 text-fuchsia-700 dark:border-fuchsia-400/30 dark:bg-fuchsia-400/10 dark:text-fuchsia-200",
    },
    {
      key: "app-support",
      title: "ادعم تحويل المنصة إلى تطبيق",
      body: "إذا كنت ترغب في دعم تحويل فكرة المنصة إلى تطبيق احترافي على أندرويد وآيفون، فتواصلك ودعمك سيساعدان كثيرًا في تحقيق ذلك.",
      emoji: "📱",
      icon: HandCoins,
      iconTone:
        "border-emerald-300/35 bg-emerald-500/12 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200",
    },
    {
      key: "feature-ideas",
      title: "عندك فكرة تتمناها في المنصة؟",
      body: "لو عندك فكرة أو ميزة أو شيء تتمنى وجوده داخل المنصة، راسلني وسأحاول إضافته وتطويره بإذن الله.",
      emoji: "💡",
      icon: Lightbulb,
      iconTone:
        "border-amber-300/35 bg-amber-500/12 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200",
    },
  ];

  return (
    <div className="min-w-0 max-w-full space-y-5 animate-in fade-in duration-700 md:space-y-6">
      <section
        dir="rtl"
        aria-label="دعوة للتمرير لأسفل"
        className="relative overflow-hidden rounded-[1.2rem] border border-emerald-300/30 bg-white/58 px-4 py-2.5 shadow-[0_10px_30px_rgba(16,185,129,0.08)] backdrop-blur-xl dark:border-emerald-300/15 dark:bg-zinc-900/52 sm:px-5"
      >
        <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-emerald-300/20 to-transparent dark:from-emerald-400/12" aria-hidden />
        <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-cyan-300/20 to-transparent dark:from-cyan-400/12" aria-hidden />

        <div className="relative z-10 flex flex-wrap items-center justify-center gap-2.5 text-center sm:gap-3">
          <span
            aria-hidden
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-500/10 text-sm text-emerald-700 dark:border-emerald-300/30 dark:bg-emerald-400/10 dark:text-emerald-200"
          >
            👇
          </span>
          <p className="text-[12px] font-bold leading-6 text-zinc-700 dark:text-zinc-100 sm:text-[13px]">
            لا تفوّت أي تفصيل — مرّر لأسفل واكتشف كل ما يميز المنصة
          </p>
          {/* Keep motion gentle and hint-like so the strip invites scrolling without creating noisy movement pressure. */}
          <ChevronDown className="h-4 w-4 text-emerald-600 animate-[bounce_2.3s_ease-in-out_infinite] motion-reduce:animate-none dark:text-emerald-300" />
        </div>
      </section>

      {/* Keep the shared slogan near the top fold so brand context appears early,
          while preserving the same reusable component and responsive wrapping behavior. */}
        <PlatformSloganNote className="mx-auto max-w-2xl" />

      <section
        dir="rtl"
        className="relative overflow-hidden rounded-[2rem] border border-white/15 bg-white/44 p-5 backdrop-blur-2xl dark:border-white/5 dark:bg-zinc-950/34 md:p-8"
      >
        <div className="pointer-events-none absolute -left-20 -top-20 h-56 w-56 rounded-full bg-emerald-400/10 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-24 -right-20 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" aria-hidden />

        <div className="relative z-10 space-y-4">
          <div className="space-y-2">
            <p className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-black tracking-[0.08em] text-emerald-700 dark:border-emerald-300/30 dark:bg-emerald-400/10 dark:text-emerald-200">
              <span aria-hidden>✨</span>
              من قلب الرحلة
            </p>
            <h2 className="font-[family-name:var(--font-display)] text-2xl font-black tracking-tight text-zinc-900 dark:text-white sm:text-[1.8rem]">
              محطات تحكي رؤية المنصة والمجتمع
            </h2>
          </div>

          {/* Keep these cards vertically stacked to present a calm narrative flow: platform story, community voice, support vision, then feature wishes. */}
          <div className="space-y-3.5">
            {homeVisionCards.map((card) => (
              <article
                key={card.key}
                className="rounded-[1.35rem] border border-white/35 bg-white/60 p-4 shadow-[0_16px_34px_rgba(15,23,42,0.08)] backdrop-blur-xl transition-colors dark:border-white/10 dark:bg-zinc-900/45 sm:p-5"
              >
                <div className="flex items-start gap-3.5 sm:gap-4">
                  <div
                    className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${card.iconTone}`}
                    aria-hidden
                  >
                    <card.icon className="h-5 w-5" />
                  </div>

                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300/55 bg-white/70 px-2.5 py-0.5 text-[11px] font-bold text-zinc-700 dark:border-white/20 dark:bg-zinc-950/60 dark:text-zinc-200">
                      <span aria-hidden>{card.emoji}</span>
                    </div>
                    <h3 className="text-lg font-black leading-tight tracking-tight text-zinc-900 dark:text-white sm:text-[1.25rem]">
                      {card.title}
                    </h3>
                    <p className="text-sm leading-7 text-zinc-700 dark:text-zinc-200 sm:text-[0.96rem]">
                      {card.body}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          ZONE 1 — UNIFIED HERO SURFACE
          Merges: title, stats, workspace nav, Hall of Honor, platform story,
          runtime status, and scroll hint into one cohesive container.
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/34 dark:bg-zinc-950/34 backdrop-blur-2xl shadow-xl shadow-emerald-900/5">

        {/* Ambient background gradients — subtle, not distracting */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-teal-900/8" />
        <div className="pointer-events-none absolute -top-20 -right-20 h-72 w-72 rounded-full bg-emerald-500/8 blur-3xl" />

        {/* ── Header: title + stat counters ─────────────────────────── */}
        <div className="relative z-10 p-5 pb-0 md:p-10 md:pb-0">
          <div className="flex flex-col gap-3">
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
              <MonitorPlay className="h-3.5 w-3.5" />
              {uiContext.messages.homeSectionLabel}
            </span>
            <h1 className="max-w-2xl font-[family-name:var(--font-display)] text-3xl font-black tracking-tight text-zinc-900 md:text-4xl dark:text-white">
              {uiContext.messages.homeTitle}
            </h1>
          </div>
        </div>

        {/* ── Workspace navigation cards ────────────────────────────── */}
        <div className="relative z-10 px-5 pt-5 md:px-10 md:pt-8">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { href: APP_ROUTES.upload, label: uiContext.messages.navUpload, title: uiContext.messages.uploadWorkspaceTitle, icon: UploadCloud },
              { href: APP_ROUTES.assessment, label: uiContext.messages.navAssessment, title: uiContext.messages.assessmentTitle, icon: BrainCircuit },
              { href: APP_ROUTES.infographic, label: uiContext.messages.navInfographic, title: uiContext.messages.infographicTitle, icon: PieChart, locked: !canAccessInfographic },
              { href: APP_ROUTES.settings, label: uiContext.messages.navSettings, title: uiContext.messages.settingsTitle, icon: Settings2 },
            ].map((card, i) =>
              card.locked ? (
                <article
                  key={i}
                  className="rounded-[1.25rem] border border-amber-500/12 bg-white/24 p-5 dark:bg-zinc-900/16"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <card.icon className="h-4.5 w-4.5 text-amber-500" />
                    <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-300">
                      {uiContext.messages.comingSoonLabel}
                    </span>
                  </div>
                  <h2 className="font-[family-name:var(--font-display)] text-base font-bold tracking-tight text-zinc-900 dark:text-white">
                    {card.title}
                  </h2>
                </article>
              ) : (
                <Link
                  key={i}
                  href={card.href}
                  className="group rounded-[1.25rem] border border-white/15 bg-white/34 p-5 transition-all hover:-translate-y-0.5 hover:bg-white/60 hover:shadow-md dark:border-white/5 dark:bg-zinc-900/24 dark:hover:bg-zinc-900/42"
                >
                  <card.icon className="mb-3 h-4.5 w-4.5 text-emerald-500" />
                  <h2 className="font-[family-name:var(--font-display)] text-base font-bold tracking-tight text-zinc-900 dark:text-white">
                    {card.title}
                  </h2>
                </Link>
              ),
            )}
          </div>
        </div>

        {/* ── Hall of Honor — compact inline block ──────────────────── */}
        <div className="relative z-10 px-5 pt-4 md:px-10 md:pt-6">
          <Link
            href={APP_ROUTES.hallOfHonor}
            className="group flex flex-col gap-4 rounded-[1.25rem] border border-white/15 bg-white/44 p-5 transition-all hover:-translate-y-0.5 hover:bg-white/62 hover:shadow-md dark:border-white/5 dark:bg-zinc-900/30 dark:hover:bg-zinc-900/48 md:flex-row md:items-center md:justify-between"
          >
            {/* Keep wrapper visually neutral so Hall of Honor content card remains the only emphasized surface. */}

            <div className="relative space-y-1.5">
              <p className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-gold">
                <Crown className="h-3.5 w-3.5" />
                {uiContext.messages.homeHallOfHonorLabel}
              </p>
              <h2 className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight text-zinc-900 dark:text-white">
                {uiContext.messages.homeHallOfHonorTitle}
              </h2>
              <p className="max-w-xl text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
                {uiContext.messages.homeHallOfHonorBody}
              </p>
            </div>

            <div className="relative flex items-center gap-3">
              <div className="relative h-14 w-14 overflow-hidden rounded-full border-2 border-gold/60 shadow-[0_0_0_3px_rgba(242,198,106,0.15)]">
                <Image src="/elmahdy1.jpeg" alt="Elmahdy Abdallah Yousef" fill sizes="56px" className="object-cover" />
              </div>
              <div className="relative h-10 w-10 overflow-hidden rounded-full border border-emerald-400/40">
                <Image src="/adham.jpg" alt="Adham Essam" fill sizes="40px" className="object-cover" />
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                {uiContext.messages.homeHallOfHonorAction}
                <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
              </span>
            </div>
          </Link>
        </div>

        {/* ── Platform Story CTA ───────────────────────────────────── */}
        <div className="relative z-10 px-5 pt-4 md:px-10 md:pt-6">
          <PlatformStoryCta />
        </div>

        <LectureSummaryComingSoonTeaser />

        {/* ── Runtime status pills + scroll hint ───────────────────── */}
        <div className="relative z-10 flex flex-col gap-3 px-5 pb-5 pt-5 md:flex-row md:flex-wrap md:items-center md:justify-between md:gap-4 md:px-10 md:pb-8 md:pt-8">
          {/* Status pills */}
          <div className="flex flex-wrap gap-2">
            {[
              { label: "Supabase Auth", status: runtimeFlags.supabaseAuth },
              { label: "Google AI", status: runtimeFlags.googleAi },
              { label: "Qwen", status: runtimeFlags.qwen },
            ].map((flag, i) => (
              <span
                key={i}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider ${
                  flag.status
                    ? "border-emerald-200 bg-emerald-100/50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400"
                    : "border-amber-200 bg-amber-100/50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400"
                }`}
              >
                <div className={`h-1.5 w-1.5 rounded-full ${flag.status ? "bg-emerald-500" : "bg-amber-500"}`} />
                {flag.label} {flag.status ? uiContext.messages.statusReady : uiContext.messages.statusFallback}
              </span>
            ))}
          </div>

          {/* Home fold-discovery cue: keep this subtle and centered on mobile to signal more content below without competing with status pills. */}
          <span
            aria-label={uiContext.locale === "ar" ? "هذه الصفحة تحتوي على محتوى إضافي بالأسفل" : "This page contains more content below"}
            className="inline-flex items-center justify-center gap-1.5 self-center rounded-full border border-white/20 bg-white/45 px-3 py-1 text-[11px] font-medium tracking-wide text-zinc-500 dark:border-white/10 dark:bg-zinc-900/40 dark:text-zinc-400 md:self-auto"
          >
            {uiContext.locale === "ar" ? "مرر للأسفل" : "Scroll down"}
            <ChevronDown className="h-3 w-3 animate-[bounce_1.8s_ease-in-out_infinite] motion-reduce:animate-none" />
          </span>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          ZONE 2 — CONTENT: Recent Activity + Upload CTA
          Clean two-column layout on desktop, stacked on mobile.
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="grid min-w-0 gap-5 xl:grid-cols-2">

        {/* ── Recent Documents ──────────────────────────────────────── */}
        <div className="min-w-0 rounded-[2rem] border border-white/15 bg-white/44 p-5 backdrop-blur-2xl dark:border-white/5 dark:bg-zinc-950/34 md:p-8">
          <div className="mb-5 flex items-center gap-3">
            <Database className="h-5 w-5 text-blue-500" />
            <h2 className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight text-zinc-900 dark:text-white">
              {uiContext.messages.recentDocumentsTitle}
            </h2>
          </div>
          <div className="space-y-2.5">
            {documents.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-[1.25rem] border border-dashed border-zinc-300 bg-white/30 px-4 py-10 dark:border-zinc-800 dark:bg-zinc-900/20">
                <FileCheck className="mb-2 h-8 w-8 text-zinc-400 dark:text-zinc-600" />
                <p className="text-center text-sm font-medium text-zinc-500 dark:text-zinc-400">
                  {uiContext.messages.noDocuments}
                </p>
              </div>
            ) : (
              documents.slice(0, 4).map((document) => (
                <div
                  key={document.id}
                  className="flex w-full min-w-0 max-w-full flex-col justify-between gap-3 overflow-hidden rounded-[1.25rem] border border-white/30 bg-white/34 p-4 transition-all hover:bg-white/60 sm:flex-row sm:items-center dark:border-white/5 dark:bg-zinc-900/32 dark:hover:bg-zinc-800/50"
                >
                  <div className="flex min-w-0 items-start gap-3 sm:flex-1">
                    <div className="mt-0.5 rounded-lg bg-blue-100 p-1.5 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      {/* Home document names use wrap-first + clamp so long values stay inside cards while still showing a clean ellipsis boundary. */}
                      <p
                        className="min-w-0 w-full max-w-full line-clamp-1 break-words text-sm font-bold leading-5 text-zinc-900 [overflow-wrap:anywhere] dark:text-white sm:line-clamp-2 sm:text-base sm:leading-6"
                        title={document.fileName}
                      >
                        <span className="inline-block align-top sm:hidden">
                          {buildSmartTitleDisplay(document.fileName, {
                            maxLength: 34,
                            suffixLengthWithExtension: 7,
                          })}
                        </span>
                        <span className="hidden sm:inline">{document.fileName}</span>
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
                        {document.id.slice(0, 8)}…
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                        document.status === "ready"
                          ? "border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-900/30 dark:text-emerald-400"
                          : "border-zinc-200 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                      }`}
                    >
                      {document.status}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-[9px] font-bold tracking-wider text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
                      {Math.max(1, Math.round(document.sizeBytes / 1024))} KB
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── Recent Assessments ────────────────────────────────────── */}
        <div className="min-w-0 rounded-[2rem] border border-white/15 bg-white/44 p-5 backdrop-blur-2xl dark:border-white/5 dark:bg-zinc-950/34 md:p-8">
          <div className="mb-5 flex items-center gap-3">
            <BrainCircuit className="h-5 w-5 text-purple-500" />
            <h2 className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight text-zinc-900 dark:text-white">
              {uiContext.messages.recentAssessmentsTitle}
            </h2>
          </div>
          <div className="space-y-2.5">
            {assessments.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-[1.25rem] border border-dashed border-zinc-300 bg-white/30 px-4 py-10 dark:border-zinc-800 dark:bg-zinc-900/20">
                <p className="text-center text-sm font-medium text-zinc-500 dark:text-zinc-400">
                  {uiContext.messages.assessmentEmpty}
                </p>
              </div>
            ) : (
              assessments.slice(0, 4).map((generation) => (
                <div
                  key={generation.id}
                  className="flex w-full min-w-0 max-w-full flex-col gap-3 overflow-hidden rounded-[1.25rem] border border-white/30 bg-white/34 p-4 transition-all hover:bg-white/60 sm:flex-row sm:items-start sm:justify-between dark:border-white/5 dark:bg-zinc-900/32 dark:hover:bg-zinc-800/50"
                >
                  {/* Recent-result names wrap first, then clamp with ellipsis only when needed so cards stay stable across breakpoints. */}
                  <p
                    className="min-w-0 w-full max-w-full line-clamp-1 break-words text-sm font-bold leading-5 text-zinc-900 [overflow-wrap:anywhere] sm:w-auto sm:flex-1 sm:line-clamp-2 sm:pr-3 sm:text-base sm:leading-6 dark:text-white"
                    title={generation.title}
                  >
                    <span className="inline-block align-top sm:hidden">
                      {buildSmartTitleDisplay(generation.title, {
                        maxLength: 36,
                        suffixLengthWithExtension: 7,
                      })}
                    </span>
                    <span className="hidden sm:inline">{generation.title}</span>
                  </p>
                  <span className="self-start rounded-full border border-purple-200 bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-700 sm:shrink-0 dark:border-purple-800/50 dark:bg-purple-900/30 dark:text-purple-400">
                    {generation.questions.length} Qs
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          ZONE 3 — WORKSPACE SNAPSHOT
          Keep stats below the hero so the title area stays cleaner on all widths.
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="rounded-[2rem] border border-white/15 bg-white/44 p-5 backdrop-blur-2xl dark:border-white/5 dark:bg-zinc-950/34 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {homeStats.map((stat) => (
            <div
              key={stat.key}
              className="rounded-[1.25rem] border border-white/15 bg-white/48 p-4 backdrop-blur-xl dark:border-white/5 dark:bg-zinc-900/38"
            >
              <div className={`mb-2 inline-flex rounded-lg p-1.5 ${stat.bg}`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
              <div className="text-2xl font-black tracking-tighter text-zinc-900 dark:text-white">
                {stat.value}
              </div>
              <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          ZONE 4 — UPLOAD CTA + TRUST FOOTER
          Clear action point + privacy link. Minimal, intentional.
          ═══════════════════════════════════════════════════════════════════ */}
      <section className="space-y-5">

        {/* ── Primary Upload CTA ───────────────────────────────────── */}
        <div className="relative overflow-hidden rounded-[2rem] border border-white/15 bg-white/44 p-5 backdrop-blur-2xl dark:border-white/5 dark:bg-zinc-950/34 md:p-8">
          {/* Subtle background icon */}
          <div className="pointer-events-none absolute right-6 top-6 opacity-[0.04]">
            <UploadCloud className="h-36 w-36 -rotate-12 text-emerald-500" />
          </div>
          <div className="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
                {uiContext.messages.uploadPageFlowTitle}
              </h2>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {uiContext.messages.navUpload}
              </p>
            </div>
            <Button
              asChild
              size="lg"
              className="group w-full bg-emerald-600 text-white shadow-lg shadow-emerald-900/20 hover:bg-emerald-500 sm:w-auto"
            >
              <Link href={APP_ROUTES.upload}>
                <UploadCloud className="mr-2 h-5 w-5" />
                {uiContext.messages.navUpload}
                <ChevronRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
          </div>
        </div>

        {/* ── Trust & Privacy footer ───────────────────────────────── */}
        <div className="rounded-[1.25rem] border border-emerald-500/20 bg-emerald-500/[0.05] p-4 dark:border-emerald-400/20 dark:bg-emerald-500/7">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={APP_ROUTES.privacy}
              className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-white/54 px-3 py-1.5 text-sm font-semibold text-emerald-700 transition-colors hover:bg-white/82 dark:border-emerald-300/25 dark:bg-zinc-950/44 dark:text-emerald-200 dark:hover:bg-zinc-900"
            >
              <ShieldCheck className="h-4 w-4" />
              {siteContent.navigation.privacy}
            </Link>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700/60 dark:text-emerald-300/50">
              {uiContext.locale === "ar"
                ? "متاح للعامة بدون تسجيل دخول"
                : "Public access · No sign-in required"}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
