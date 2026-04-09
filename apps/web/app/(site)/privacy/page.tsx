import { APP_ROUTES } from "@zootopia/shared-config";
import { Cookie, Database, FileText, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { getSiteContent } from "@/lib/site-content";
import { getRequestUiContext } from "@/lib/server/request-context";

const PRIVACY_SECTION_ICONS = [ShieldCheck, Database, Cookie, FileText] as const;

export default async function PrivacyPage() {
  const { locale } = await getRequestUiContext();
  const content = getSiteContent(locale).privacy;

  return (
    <div className="space-y-6">
      <section className="surface-card relative overflow-hidden px-6 py-7 sm:px-8 sm:py-9 lg:px-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.13),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(242,198,106,0.16),transparent_34%)]" />
        <div className="relative space-y-5">
          <p className="section-label">{content.eyebrow}</p>
          <h1 className="page-title max-w-4xl text-balance">{content.title}</h1>
          <p className="page-subtitle max-w-3xl">{content.subtitle}</p>

          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-200">
            <ShieldCheck className="h-4 w-4" />
            {content.effectiveDateLabel}: {content.effectiveDateValue}
          </div>

          <p className="max-w-3xl text-base leading-8 text-foreground-muted">{content.intro}</p>
        </div>
      </section>

      <section className="surface-card p-6 sm:p-7">
        <p className="section-label">{content.sectionsTitle}</p>

        {/* Keep policy clauses as cards so legal reviewers can scan quickly on desktop and mobile
            without mixing this page into protected workspace UI patterns. */}
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {content.sections.map((section, index) => {
            const Icon = PRIVACY_SECTION_ICONS[index % PRIVACY_SECTION_ICONS.length] ?? Sparkles;

            return (
              <article
                key={section.title}
                className="rounded-[1.5rem] border border-white/30 bg-white/65 p-5 shadow-sm dark:border-white/8 dark:bg-zinc-950/40"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-emerald-500/12 text-emerald-700 dark:text-emerald-300">
                    <Icon className="h-4.5 w-4.5" />
                  </span>
                  <h2 className="text-base font-bold leading-7 text-foreground">{section.title}</h2>
                </div>
                <p className="mt-3 text-sm leading-7 text-foreground-muted">{section.body}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(250px,0.95fr)]">
        <article className="surface-card p-6 sm:p-7">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-300" />
            <h2 className="text-xl font-bold tracking-tight text-foreground">{content.rightsTitle}</h2>
          </div>
          <p className="mt-4 text-base leading-8 text-foreground-muted">{content.rightsBody}</p>
        </article>

        <article className="surface-card p-6 sm:p-7">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-gold" />
            <h2 className="text-xl font-bold tracking-tight text-foreground">{content.contactTitle}</h2>
          </div>
          <p className="mt-4 text-base leading-8 text-foreground-muted">{content.contactBody}</p>
          <Button asChild className="mt-6 w-full sm:w-auto">
            <Link href={APP_ROUTES.contact}>{content.contactCta}</Link>
          </Button>
        </article>
      </section>
    </div>
  );
}
