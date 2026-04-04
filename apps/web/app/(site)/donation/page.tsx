import {
  BadgeCheck,
  HandCoins,
  HeartHandshake,
  MessageCircleMore,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  SITE_DONATION_NUMBER,
  SITE_WHATSAPP_LINK,
  SITE_WHATSAPP_NUMBER,
  getSiteContent,
} from "@/lib/site-content";
import { getRequestUiContext } from "@/lib/server/request-context";

const STORY_CARD_ICONS = [HeartHandshake, BadgeCheck, ShieldCheck] as const;

export default async function DonationPage() {
  const { locale } = await getRequestUiContext();
  const content = getSiteContent(locale).donation;

  return (
    <div className="space-y-6">
      <section className="surface-card relative overflow-hidden px-6 py-7 sm:px-8 sm:py-9 lg:px-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.15),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(242,198,106,0.18),transparent_34%)]" />
        <div className="relative grid gap-8 xl:grid-cols-[minmax(0,1.08fr)_minmax(290px,0.92fr)] xl:items-center">
          <div>
            <p className="section-label">{content.eyebrow}</p>
            <h1 className="page-title mt-3 max-w-4xl text-balance">{content.title}</h1>
            <p className="page-subtitle mt-4 max-w-3xl">{content.subtitle}</p>
            <p className="mt-5 max-w-3xl text-base leading-8 text-foreground-muted">{content.intro}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              {content.heroHighlights.map((highlight) => (
                <span
                  key={highlight}
                  className="inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-2 text-sm font-semibold text-emerald-800 dark:text-emerald-200"
                >
                  {highlight}
                </span>
              ))}
            </div>
          </div>

          {/* This support card keeps donation communication personal and trustworthy.
              Future agents should preserve direct WhatsApp contact as the primary human path until a real payment flow exists. */}
          <article className="rounded-[2rem] border border-white/30 bg-white/75 p-6 shadow-lg dark:border-white/10 dark:bg-zinc-950/45">
            <div className="flex items-center gap-3">
              <MessageCircleMore className="h-5 w-5 text-emerald-600 dark:text-emerald-300" />
              <h2 className="text-xl font-bold text-foreground">{content.contactTitle}</h2>
            </div>
            <p className="mt-4 text-sm leading-7 text-foreground-muted">{content.contactBody}</p>
            <div className="mt-6 rounded-[1.8rem] border border-emerald-500/25 bg-emerald-500/10 px-5 py-5">
              <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                {content.contactLabel}
              </p>
              <p className="mt-3 font-mono text-3xl font-bold tracking-tight text-foreground">
                {SITE_WHATSAPP_NUMBER}
              </p>
              <p className="mt-3 text-sm leading-7 text-foreground-muted">{content.contactNote}</p>
            </div>
            <div className="mt-4 rounded-[1.6rem] border border-white/30 bg-white/65 px-5 py-4 dark:border-white/8 dark:bg-zinc-950/35">
              <div className="flex items-center gap-3">
                <WalletCards className="h-4 w-4 text-gold" />
                <p className="text-sm font-bold text-foreground">{content.walletTitle}</p>
              </div>
              <p className="mt-3 text-sm leading-7 text-foreground-muted">{content.walletBody}</p>
              <p className="mt-4 text-xs font-bold text-gold">
                {content.walletNumberLabel}
              </p>
              <p className="mt-2 font-mono text-xl font-bold tracking-tight text-foreground">
                {SITE_DONATION_NUMBER}
              </p>
            </div>
            <Button asChild className="mt-6 w-full sm:w-auto">
              <Link href={SITE_WHATSAPP_LINK} target="_blank" rel="noreferrer">
                <Sparkles className="h-4 w-4" />
                {content.contactCta}
              </Link>
            </Button>
          </article>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.92fr)]">
        {content.storyCards.map((card, index) => {
          const Icon = STORY_CARD_ICONS[index] ?? Sparkles;

          return (
            <article key={card.title} className="surface-card p-6">
              <div className="flex items-center gap-3">
                <Icon
                  className={
                    index === 1 ? "h-5 w-5 text-gold" : "h-5 w-5 text-emerald-600 dark:text-emerald-300"
                  }
                />
                <h2 className="text-xl font-bold text-foreground">{card.title}</h2>
              </div>
              <p className="mt-4 text-base leading-8 text-foreground-muted">{card.body}</p>
            </article>
          );
        })}
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
        {/* This cost section explains the real recurring expenses behind the donation ask.
            Future agents should keep these operating costs specific and visible so the page stays sincere and transparent. */}
        <article className="surface-card p-6 sm:p-7">
          <div className="flex items-center gap-3">
            <HandCoins className="h-5 w-5 text-gold" />
            <h2 className="text-2xl font-bold tracking-tight text-foreground">{content.costsTitle}</h2>
          </div>
          <p className="mt-4 text-base leading-8 text-foreground-muted">{content.costsIntro}</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {content.costItems.map((item) => (
              <article
                key={item.title}
                className="rounded-[1.5rem] border border-white/30 bg-white/60 px-4 py-4 dark:border-white/8 dark:bg-zinc-950/35"
              >
                <p className="text-sm font-bold text-foreground">
                  {item.title}
                </p>
                <p className="mt-3 text-sm leading-7 text-foreground-muted">{item.body}</p>
              </article>
            ))}
          </div>
        </article>

        <div className="surface-card p-6 sm:p-7">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-300" />
            <h2 className="text-2xl font-bold tracking-tight text-foreground">{content.supportTitle}</h2>
          </div>
          <p className="mt-4 text-base leading-8 text-foreground-muted">{content.supportBody}</p>
          <div className="mt-6 grid gap-3">
            {content.supportItems.map((item) => (
              <article
                key={item}
                className="rounded-[1.4rem] border border-white/30 bg-white/60 px-4 py-4 text-sm font-medium leading-7 text-foreground dark:border-white/8 dark:bg-zinc-950/35"
              >
                {item}
              </article>
            ))}
          </div>
          <div className="mt-6 rounded-[1.6rem] border border-emerald-500/20 bg-emerald-500/10 p-5">
            <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
              {content.trustTitle}
            </p>
            <p className="mt-3 text-sm leading-7 text-foreground-muted">{content.trustBody}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
