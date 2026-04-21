import { redirect } from "next/navigation";
import Image from "next/image";

import { AuthTopControls } from "@/components/auth/auth-top-controls";
import { LoginPanel } from "@/components/auth/login-panel";
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
        {/* Keep both themed background images mounted and viewport-sized so Next/Image fill sizing stays accurate. */}
        <Image
          src="/science-faculty-enhanced-light-5.png"
          alt="Faculty of Science"
          fill
          priority
          className="theme-image-light object-cover object-center"
          sizes="100vw"
        />
        <Image
          src="/science-faculty-enhanced-dark-4.png"
          alt="Faculty of Science"
          fill
          priority
          className="theme-image-dark object-cover object-center"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-background/46 backdrop-blur-[1.5px] transition-colors duration-700" />
      </div>

      {/* Regular-login badge ownership:
          This decorative badge belongs to the public student login page only.
          It is pinned to logical start so it lands top-left in LTR and top-right in RTL,
          while utility controls stay on logical end to prevent overlap across breakpoints. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute start-2 top-2 z-10 sm:start-3 sm:top-3 md:start-6 md:top-6"
      >
        <Image
          src="/light-faculty-badge.png"
          alt=""
          width={288}
          height={175}
          className="h-auto w-16 max-w-[28vw] rounded-lg border border-border/85 bg-background-elevated/62 p-1 shadow-[0_8px_22px_rgba(10,24,39,0.2)] backdrop-blur-[1px] transition-colors duration-500 sm:w-20 md:w-28"
          sizes="(max-width: 640px) min(28vw, 64px), (max-width: 1024px) 80px, 112px"
        />
      </div>

      {/* Top Navigation & Controls */}
      {/* Reserve horizontal space for the decorative badge so control chips never collide with it on tight mobile widths. */}
      <AuthTopControls
        className="absolute end-3 top-3 z-20 max-w-[calc(100%-5.5rem)] sm:end-4 sm:top-4 sm:max-w-[calc(100%-6.75rem)] md:end-8 md:top-8 md:max-w-[calc(100%-10rem)]"
        themeMode={uiContext.themeMode}
        locale={uiContext.locale}
        themeLabel={uiContext.messages.themeLabel}
        themeLabels={{
          light: uiContext.messages.themeLight,
          dark: uiContext.messages.themeDark,
          system: uiContext.messages.themeSystem,
        }}
        localeLabel={uiContext.messages.localeLabel}
        localeLabels={{
          en: uiContext.messages.localeEnglish,
          ar: uiContext.messages.localeArabic,
        }}
      />

      {/* Login Stage Container */}
      {/* Keep a dedicated top offset so absolute controls stay independent from the centered title/panel stack. */}
      <div className="z-10 flex w-full max-w-lg min-h-[calc(100vh-2rem)] flex-col px-4 pb-6 pt-16 sm:min-h-[calc(100vh-3rem)] sm:px-6 sm:pb-8 sm:pt-20 md:pt-10">
        {/* Keep title and primary auth panel centered while reserving a stable footer rail for the signature line. */}
        <div className="flex flex-1 flex-col justify-center">
          <div className="mb-7 text-center sm:mb-8">
            {/* Engraved style Bismillah */}
            <h2 dir="rtl" className="mb-4 font-[family-name:var(--font-amiri)] text-xl text-foreground/80 font-bold tracking-wide drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)] opacity-90 transition-all duration-300 sm:mb-5">
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

          <div className="relative animate-in fade-in zoom-in-95 fill-mode-both duration-700 ease-out">
            <LoginPanel
              messages={uiContext.messages}
              locale={uiContext.locale}
              supabaseAuthReady={runtimeFlags.supabaseAuth}
            />

            {/* Keep this branded attribution attached to the login card edge so it is noticeable on first view. */}
            <div className="pointer-events-none absolute left-1/2 top-full z-10 w-fit max-w-[calc(100%-1rem)] -translate-x-1/2 -translate-y-[35%] rounded-full border border-amber-300/35 bg-background-elevated/78 px-4 py-2 text-center shadow-[0_10px_26px_rgba(15,23,42,0.18)] backdrop-blur-[2px] sm:px-5 [@media(max-height:820px)]:top-0 [@media(max-height:820px)]:-translate-y-[125%]">
              <p
                dir="rtl"
                className="font-[family-name:var(--font-amiri)] text-[0.88rem] font-semibold leading-relaxed text-foreground/85 drop-shadow-sm sm:text-[0.92rem]"
              >
                من تصميم وتطوير ابن عبدالله 2026
              </p>
            </div>
          </div>
        </div>

        {/* Copyright Footer */}
        {/* Keep this footer in-flow (not fixed) so short screens can still scroll without clipping text. */}
        <div className="mt-5 border-t border-border pt-4 text-center sm:mt-6 sm:pt-4">
          <p className="text-xs font-medium text-foreground-muted/70 drop-shadow-sm">
            © {currentYear} Zootopia Club. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
