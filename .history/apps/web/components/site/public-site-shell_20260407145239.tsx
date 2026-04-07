"use client";

import { APP_ROUTES } from "@zootopia/shared-config";
import type { Locale, ThemeMode } from "@zootopia/shared-types";
import { HandCoins, ArrowUpRight, Sparkles, Crown, Route } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ZootopiaLockup } from "@/components/branding/zootopia-brand";
import { ProtectedSignatureSeal } from "@/components/layout/protected-signature-seal";
import { LocaleToggle } from "@/components/preferences/locale-toggle";
import { ThemeToggle } from "@/components/preferences/theme-toggle";
import { Button } from "@/components/ui/button";
import type { AppMessages } from "@/lib/messages";
import { getSiteContent } from "@/lib/site-content";

type PublicSiteShellProps = {
  children: React.ReactNode;
  locale: Locale;
  themeMode: ThemeMode;
  messages: AppMessages;
  primaryHref: string;
  isAuthenticated: boolean;
};

export function PublicSiteShell({
  children,
  locale,
  themeMode,
  messages,
  primaryHref,
  isAuthenticated,
}: PublicSiteShellProps) {
  const pathname = usePathname();
  const siteContent = getSiteContent(locale);
  const navigationItems = [
    /* Hall of Honor is a public informational route and should stay visible in this
       shared public header nav to keep tribute discovery consistent across site pages. */
    { href: APP_ROUTES.hallOfHonor, label: messages.navHallOfHonor || "Hall of Honor" },
    {
      href: APP_ROUTES.journey,
      label: siteContent.navigation.journey,
    },
    { href: APP_ROUTES.about, label: siteContent.navigation.about },
    { href: APP_ROUTES.contact, label: siteContent.navigation.contact },
    { href: APP_ROUTES.donation, label: siteContent.navigation.donation },
  ];

  return (
    <main className="page-shell px-4 py-4 sm:px-6 sm:py-6 xl:px-8">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6">
        <header className="surface-card relative overflow-hidden px-4 py-4 sm:px-5 sm:py-5">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.14),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(242,198,106,0.18),transparent_30%)]" />
          <div className="relative flex flex-col gap-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              {/* This shell owns the shared public-site header for About, Contact, and Donation.
                  Future agents should extend these informational routes here instead of pushing public-page controls into the protected workspace header. */}
              <Link href={APP_ROUTES.about} className="min-w-0">
                <ZootopiaLockup compact />
              </Link>

              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <ThemeToggle
                  variant="compact"
                  value={themeMode}
                  label={messages.themeLabel}
                  labels={{
                    light: messages.themeLight,
                    dark: messages.themeDark,
                    system: messages.themeSystem,
                  }}
                />
                <LocaleToggle
                  variant="compact"
                  value={locale}
                  label={messages.localeLabel}
                  labels={{
                    en: messages.localeEnglish,
                    ar: messages.localeArabic,
                  }}
                />
                <Button asChild size="sm" className="rounded-full px-4">
                  <Link href={primaryHref}>
                    <ArrowUpRight className="h-4 w-4" />
                    {isAuthenticated
                      ? siteContent.navigation.openWorkspace
                      : siteContent.navigation.signIn}
                  </Link>
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <nav className="flex flex-wrap items-center gap-2">
                {navigationItems.map((item) => {
                  const active =
                    pathname === item.href || pathname.startsWith(`${item.href}/`);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-semibold transition-all ${
                        active
                          ? "border-emerald-500/30 bg-emerald-500/12 text-emerald-700 shadow-sm dark:text-emerald-300"
                          : "border-border bg-white/55 text-foreground-muted hover:border-emerald-500/25 hover:text-foreground dark:bg-zinc-950/35"
                      }`}
                    >
                      {item.href === APP_ROUTES.donation ? <HandCoins className="h-4 w-4" /> : null}
                      {item.href === APP_ROUTES.hallOfHonor ? <Crown className="h-4 w-4" /> : null}
                      {item.href === APP_ROUTES.journey ? <Route className="h-4 w-4" /> : null}
                      {item.href !== APP_ROUTES.donation &&
                      item.href !== APP_ROUTES.hallOfHonor &&
                      item.href !== APP_ROUTES.journey ? (
                        <Sparkles className="h-3.5 w-3.5" />
                      ) : null}
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
              <p className="text-sm leading-6 text-foreground-muted">
                {siteContent.navigation.donationCta}
                <span className="mx-2 opacity-35">•</span>
                {messages.tagline}
              </p>
            </div>
          </div>
        </header>

        <div className="flex-1">{children}</div>

        <footer className="pb-2">
          {/* Reuse the current branded seal here so public informational pages stay aligned with the platform attribution system instead of inventing a second footer language. */}
          <div className="flex justify-center">
            <ProtectedSignatureSeal locale={locale} className="w-full max-w-5xl" />
          </div>
        </footer>
      </div>
    </main>
  );
}
