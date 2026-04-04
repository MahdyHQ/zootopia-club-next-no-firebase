import { APP_ROUTES } from "@zootopia/shared-config";
import { BadgeCheck, FlaskConical, GraduationCap, Microscope, Sparkles, Stars } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { SITE_WHATSAPP_LINK, getSiteContent } from "@/lib/site-content";
import { getRequestUiContext } from "@/lib/server/request-context";

export default async function AboutPage() {
  const { locale } = await getRequestUiContext();
  const content = getSiteContent(locale);

  return (
    <div className="space-y-6">
      <section className="surface-card relative overflow-hidden px-6 py-7 sm:px-8 sm:py-9 lg:px-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.14),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(242,198,106,0.18),transparent_34%)]" />
        <div className="relative grid gap-8 xl:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)] xl:items-center">
          <div className="space-y-6">
            <div className="space-y-3">
              <p className="section-label">{content.about.eyebrow}</p>
              <h1 className="page-title max-w-4xl text-balance">{content.about.title}</h1>
              <p className="page-subtitle max-w-3xl">{content.about.subtitle}</p>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <article className="rounded-[1.7rem] border border-white/30 bg-white/65 p-5 shadow-sm dark:border-white/8 dark:bg-zinc-950/35">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-300">
                  {content.about.signatureArabicLabel}
                </p>
                <p dir="rtl" className="mt-3 font-[family-name:var(--font-amiri)] text-lg leading-8 text-foreground">
                  {content.about.signatureArabic}
                </p>
              </article>
              <article className="rounded-[1.7rem] border border-white/30 bg-white/65 p-5 shadow-sm dark:border-white/8 dark:bg-zinc-950/35">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-gold">
                  {content.about.signatureEnglishLabel}
                </p>
                <p className="mt-3 text-sm leading-7 text-foreground">
                  {content.about.signatureEnglish}
                </p>
              </article>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href={SITE_WHATSAPP_LINK} target="_blank" rel="noreferrer">
                  <Sparkles className="h-4 w-4" />
                  {content.about.whatsappCta}
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={APP_ROUTES.contact}>{content.navigation.contact}</Link>
              </Button>
            </div>
          </div>

          {/* This illustration block gives the About page its person/profile presence without inventing a second branding system.
              Keep it decorative, science-themed, and secondary to the core platform story. */}
          <div className="relative mx-auto flex w-full max-w-md justify-center">
            <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[2.4rem] border border-white/25 bg-[linear-gradient(160deg,rgba(255,255,255,0.9),rgba(226,232,240,0.55))] p-6 shadow-2xl dark:border-white/10 dark:bg-[linear-gradient(160deg,rgba(15,23,42,0.88),rgba(2,6,23,0.7))]">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.16),transparent_34%),radial-gradient(circle_at_bottom,rgba(242,198,106,0.18),transparent_38%)]" />
              <div className="relative flex h-full flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                    <Microscope className="h-4 w-4" />
                    {content.about.illustrationLabel}
                  </span>
                  <Stars className="h-5 w-5 text-gold" />
                </div>

                <div className="mx-auto flex h-56 w-56 items-center justify-center rounded-full border border-white/40 bg-white/70 shadow-lg dark:border-white/10 dark:bg-zinc-900/65">
                  <div className="relative flex h-40 w-40 items-center justify-center rounded-full bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.22),rgba(15,23,42,0.08))] dark:bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.3),rgba(2,6,23,0.22))]">
                    <div className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-500/14 text-emerald-700 dark:text-emerald-300">
                      <GraduationCap className="h-12 w-12" />
                    </div>
                    <div className="absolute -left-3 top-6 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/40 bg-white/85 text-emerald-700 shadow-md dark:border-white/10 dark:bg-zinc-900/80 dark:text-emerald-300">
                      <FlaskConical className="h-5 w-5" />
                    </div>
                    <div className="absolute -right-3 bottom-8 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/40 bg-white/85 text-gold shadow-md dark:border-white/10 dark:bg-zinc-900/80">
                      <Sparkles className="h-5 w-5" />
                    </div>
                  </div>
                </div>

                <article className="rounded-[1.7rem] border border-white/30 bg-white/70 p-5 dark:border-white/8 dark:bg-zinc-950/55">
                  <div className="flex items-center gap-3">
                    <BadgeCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-300" />
                    <h2 className="text-lg font-bold text-foreground">{content.about.profileTitle}</h2>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-foreground-muted">{content.about.profileBody}</p>
                </article>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.95fr)]">
        <article className="surface-card p-6">
          <p className="section-label">{content.about.platformIntroTitle}</p>
          <p className="mt-4 text-base leading-8 text-foreground">{content.about.platformIntroBody}</p>
        </article>
        <article className="surface-card p-6">
          <p className="section-label">{content.about.purposeTitle}</p>
          <p className="mt-4 text-base leading-8 text-foreground">{content.about.purposeBody}</p>
        </article>
        <article className="surface-card p-6">
          <p className="section-label">{content.about.missionTitle}</p>
          <p className="mt-4 text-base leading-8 text-foreground">{content.about.missionBody}</p>
        </article>
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
        <article className="surface-card relative overflow-hidden p-6 sm:p-7">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(16,185,129,0.08),transparent_45%),radial-gradient(circle_at_top_right,rgba(242,198,106,0.14),transparent_34%)]" />
          <div className="relative">
            <span className="inline-flex items-center rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">
              {content.about.infographicSoonLabel}
            </span>
            <h2 className="mt-4 text-2xl font-bold tracking-tight text-foreground">
              {content.about.infographicSoonTitle}
            </h2>
            <p className="mt-4 max-w-3xl text-base leading-8 text-foreground-muted">
              {content.about.infographicSoonBody}
            </p>
          </div>
        </article>

        <article className="surface-card p-6 sm:p-7">
          <p className="section-label">{content.about.whatsappTitle}</p>
          <p className="mt-4 text-base leading-8 text-foreground-muted">{content.about.whatsappBody}</p>
          <div className="mt-6 rounded-[1.6rem] border border-emerald-500/25 bg-emerald-500/10 p-4">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
              WhatsApp
            </p>
            <p className="mt-2 text-xl font-bold tracking-tight text-foreground">+201124511183</p>
          </div>
          <Button asChild className="mt-6 w-full sm:w-auto">
            <Link href={SITE_WHATSAPP_LINK} target="_blank" rel="noreferrer">
              <Sparkles className="h-4 w-4" />
              {content.about.whatsappCta}
            </Link>
          </Button>
        </article>
      </section>
    </div>
  );
}
