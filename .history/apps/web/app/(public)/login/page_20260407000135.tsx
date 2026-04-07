import { redirect } from "next/navigation";
import Image from "next/image";

import { LoginPanel } from "@/components/auth/login-panel";
import { LocaleToggle } from "@/components/preferences/locale-toggle";
import { ThemeToggle } from "@/components/preferences/theme-toggle";
import { getAuthenticatedUserRedirectPath } from "@/lib/return-to";
import { getRequestUiContext } from "@/lib/server/request-context";
import { getRuntimeFlags } from "@/lib/server/runtime";
import { getAuthenticatedSessionUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const [user, uiContext] = await Promise.all([
    getAuthenticatedSessionUser(),
    getRequestUiContext(),
  ]);

  if (user) {
    redirect(getAuthenticatedUserRedirectPath(user));
  }

  const runtimeFlags = getRuntimeFlags();
  const isArabic = uiContext.locale === "ar";
  const currentYear = new Date().getFullYear();

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-x-hidden overflow-y-auto">
      {/* Keep the public login surface scroll-safe on short mobile heights so the panel and footer never clip. */}
      {/* Absolute Full Screen Background */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/science-faculty-enhanced-light-5.png"
          alt="Faculty of Science"
          fill
          priority
          className="object-cover object-center dark:hidden"
          sizes="100vw"
        />
        <Image
          src="/science-faculty-enhanced-dark-4.png"
          alt="Faculty of Science"
          fill
          priority
          className="hidden object-cover object-center dark:block"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-background/50 backdrop-blur-[2px] transition-colors duration-700 dark:bg-background/70 dark:backdrop-blur-sm" />
      </div>

      {/* Top Navigation & Controls */}
      <div className="absolute end-3 top-3 z-20 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center justify-end gap-2 sm:end-4 sm:top-4 sm:gap-3 md:end-8 md:top-8">
        <ThemeToggle
          value={uiContext.themeMode}
          label={uiContext.messages.themeLabel}
          labels={{
            light: uiContext.messages.themeLight,
            dark: uiContext.messages.themeDark,
            system: uiContext.messages.themeSystem,
          }}
          variant="compact"
        />
        <LocaleToggle
          value={uiContext.locale}
          label={uiContext.messages.localeLabel}
          labels={{
            en: uiContext.messages.localeEnglish,
            ar: uiContext.messages.localeArabic,
          }}
          variant="compact"
        />
      </div>

      {/* Login Stage Container */}
      <div className="z-10 flex w-full max-w-lg min-h-[calc(100vh-2rem)] flex-col px-4 py-6 sm:min-h-[calc(100vh-3rem)] sm:px-6 sm:py-8">
        {/* Keep title and primary auth panel centered while reserving a stable footer rail for the signature line. */}
        <div className="flex flex-1 flex-col justify-center">
          <div className="mb-10 text-center">
            {/* Engraved style Bismillah */}
            <h2 dir="rtl" className="mb-6 font-[family-name:var(--font-amiri)] text-xl text-foreground/80 font-bold tracking-wide drop-shadow-[0_1px_1px_rgba(255,255,255,0.5)] dark:drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] opacity-90 transition-all duration-300">
              بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
            </h2>
            <div className="inline-flex flex-col items-center justify-center">
              <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-foreground sm:text-4xl drop-shadow-sm">
                {isArabic ? "كلية العلوم" : "Faculty of Science"}
              </h1>
              <p className="mt-2 text-lg font-medium text-foreground-muted drop-shadow-sm">
                {isArabic ? "جامعة القاهرة" : "Cairo University"}
              </p>
            </div>
          </div>

          <div className="animate-in fade-in zoom-in-95 fill-mode-both duration-700 ease-out">
            <LoginPanel
              messages={uiContext.messages}
              locale={uiContext.locale}
              firebaseAdminReady={runtimeFlags.firebaseAdmin}
            />
          </div>
        </div>

        {/* Copyright Footer */}
        {/* Keep this footer in-flow (not fixed) so short screens can still scroll without clipping text. */}
        <div className="mt-6 border-t border-white/30 pt-4 text-center sm:mt-8 sm:pt-5 dark:border-white/10">
          <p className="text-xs font-medium text-foreground-muted/70 drop-shadow-sm">
            © {currentYear} Zootopia Club. All rights reserved.
          </p>
          {/* Keep this subtle designer credit scoped to the regular login page so admin login stays strictly operational. */}
          <p
            dir="rtl"
            className="public-login-signature mx-auto mt-2 max-w-[20rem] px-2 font-[family-name:var(--font-amiri)] text-[0.8rem] leading-relaxed text-foreground-muted/75 drop-shadow-sm"
          >
            من تصميم ابن عبدالله يوسف
          </p>
        </div>
      </div>
    </div>
  );
}
