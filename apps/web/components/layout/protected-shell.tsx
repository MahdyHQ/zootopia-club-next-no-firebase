"use client";

import { APP_ROUTES } from "@zootopia/shared-config";
import type { CSSProperties } from "react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import Link from "next/link";
import { Menu, Search, Bell, Sparkles, CheckCircle2, ChevronLeft, ChevronRight, ArrowUp, HandCoins, WalletCards } from "lucide-react";
import type {
  ApiResult,
  AssessmentDailyCreditsSummary,
  Locale,
  SessionUser,
  ThemeMode,
} from "@zootopia/shared-types";
import { ASSESSMENT_CREDIT_REFRESH_EVENT } from "@/lib/assessment-credit-events";
import type { AppMessages } from "@/lib/messages";
import { getSiteContent } from "@/lib/site-content";
import { ProtectedSignatureSeal } from "./protected-signature-seal";
import { ShellNav } from "./shell-nav";

type ProtectedShellProps = {
  children: React.ReactNode;
  messages: AppMessages;
  user: SessionUser;
  locale: Locale;
  themeMode: ThemeMode;
};

export function ProtectedShell({
  children,
  messages,
  user,
  locale,
  themeMode,
}: ProtectedShellProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDesktopCollapsed, setIsDesktopCollapsed] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [creditSummary, setCreditSummary] =
    useState<AssessmentDailyCreditsSummary | null>(null);
  const mainScrollRef = useRef<HTMLElement | null>(null);
  const siteContent = getSiteContent(locale);

  const handleMobileOverlayClick = () => setIsSidebarOpen(false);
  const isRtl = locale === 'ar';
  
  const sidebarWidth = isDesktopCollapsed ? "w-[88px]" : "w-[300px]";
  const mobileTranslate = isSidebarOpen ? "translate-x-0" : (isRtl ? "translate-x-full" : "-translate-x-full");
  const scrollButtonStyle = {
    "--protected-scroll-left": isRtl
      ? "1rem"
      : `calc(${isDesktopCollapsed ? 88 : 300}px + 1.5rem)`,
  } as CSSProperties;

  const syncScrollTopButton = useEffectEvent(() => {
    const scrolledEnough = (mainScrollRef.current?.scrollTop ?? 0) > 280;
    setShowScrollTop((current) =>
      current === scrolledEnough ? current : scrolledEnough,
    );
  });

  const refreshCreditSummary = useEffectEvent(async () => {
    try {
      const response = await fetch("/api/assessment/credits", {
        method: "GET",
        cache: "no-store",
      });
      const payload = (await response.json()) as ApiResult<{
        credits: AssessmentDailyCreditsSummary;
      }>;
      if (!response.ok || !payload.ok) {
        return;
      }

      setCreditSummary(payload.data.credits);
    } catch {
      // Keep the header chip resilient: transient network failures should not break shell UI.
    }
  });

  useEffect(() => {
    const scrollContainer = mainScrollRef.current;
    if (!scrollContainer) {
      return;
    }

    /* The protected shell owns the real vertical scroll container.
       This listener stays attached here so shared controls like the scroll-to-top button track the correct element on every protected page. */
    const handleScroll = () => {
      syncScrollTopButton();
    };

    syncScrollTopButton();
    scrollContainer.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      scrollContainer.removeEventListener("scroll", handleScroll);
    };
  }, []);

  useEffect(() => {
    const handleRefreshCredits = () => {
      void refreshCreditSummary();
    };

    void refreshCreditSummary();
    window.addEventListener(ASSESSMENT_CREDIT_REFRESH_EVENT, handleRefreshCredits);

    return () => {
      window.removeEventListener(
        ASSESSMENT_CREDIT_REFRESH_EVENT,
        handleRefreshCredits,
      );
    };
  }, []);

  const resolvedBalanceLabel = creditSummary?.isAdminExempt
    ? messages.roleAdmin
    : String(creditSummary?.remainingCount ?? siteContent.navigation.balancePlaceholder);
  const resolvedBalanceHint = creditSummary?.isAdminExempt
    ? messages.assessmentDailyCreditsAdminExemptBody
    : creditSummary
      ? `${creditSummary.remainingCount ?? 0} / ${creditSummary.totalRemainingCount ?? 0}`
      : siteContent.navigation.balanceHint;

  function handleScrollToTop() {
    mainScrollRef.current?.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  // Keep the overall page background completely seamless 
  // with my-app-background.png defined in layout.tsx.
  return (
    <div className="flex h-screen w-full overflow-hidden text-foreground selection:bg-accent/30 selection:text-accent relative">
      {/* Mobile Overlay */}
      <div 
        className={`fixed inset-0 z-40 bg-zinc-950/60 backdrop-blur-sm lg:hidden transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={handleMobileOverlayClick}
      />

      {/* Sidebar Container */}
      <aside
        className={`fixed inset-y-0 ${isRtl ? 'right-0' : 'left-0'} z-50 transform flex-shrink-0 transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] lg:static lg:translate-x-0 ${sidebarWidth} ${mobileTranslate}`}
      >
        <div className="h-full p-4 md:p-6 w-full relative">
           <ShellNav 
              messages={messages} 
              user={user} 
              locale={locale} 
              themeMode={themeMode}
              isCollapsed={isDesktopCollapsed} 
           />
           
           {/* Desktop collapse toggle */}
           <button
             onClick={() => setIsDesktopCollapsed(!isDesktopCollapsed)}
             className={`hidden lg:flex absolute top-12 ${isRtl ? '-left-3' : '-right-3'} z-50 h-6 w-6 items-center justify-center rounded-full border border-border/50 bg-background-elevated backdrop-blur-md text-foreground-muted shadow-lg hover:text-accent hover:border-accent/80 transition-colors focus:outline-none`}
           >
             {isRtl 
               ? (isDesktopCollapsed ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />)
               : (isDesktopCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />)}
           </button>
        </div>
      </aside>

      {/* Main Content Column */}
      <div className="flex w-full min-w-0 flex-1 flex-col h-full overflow-hidden relative z-10 transition-all duration-300">
        
        {/* Top Header */}
        <header className="z-30 flex h-[4.5rem] shrink-0 items-center justify-between border-b border-border/60 bg-background-elevated/70 px-6 backdrop-blur-xl transition-all lg:px-10">
          <div className="flex items-center gap-4 min-w-0">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background-elevated/80 text-foreground shadow-sm transition-all hover:border-accent-strong hover:bg-background-strong hover:text-accent lg:hidden focus:outline-none"
            >
              <Menu className="h-5 w-5" />
            </button>
          <div className="hidden h-10 shrink-0 items-center gap-2 rounded-xl border border-border/60 bg-background/55 px-4 text-xs font-black uppercase tracking-widest text-foreground shadow-sm lg:flex">
               <Sparkles className="h-4 w-4 text-accent-strong" />
            <span className="truncate">{messages.appName || "Zootopia Club"}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
             {/* These header controls intentionally stay compact so the protected shell keeps room for the existing theme and account actions.
                 Do not expand them into fake wallet logic or oversized CTAs until a real balance backend and broader support navigation exist. */}
             <Link
               href={APP_ROUTES.donation}
               aria-label={siteContent.navigation.donationCta}
               title={siteContent.navigation.donationCta}
               className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 text-emerald-700 shadow-sm transition-all hover:border-emerald-500/35 hover:bg-emerald-500/16 hover:text-emerald-800 dark:text-emerald-300 dark:hover:text-emerald-200"
             >
               <HandCoins className="h-4.5 w-4.5 shrink-0" />
               <span className="hidden sm:inline text-xs font-black uppercase tracking-[0.18em]">
                 {siteContent.navigation.donationCta}
               </span>
             </Link>

             {/* The shell badge mirrors server-authoritative assessment credits for the signed-in
                 owner. Keep this read-only so quota authority remains in backend reserve/commit routes. */}
             <div
               aria-label={`${siteContent.navigation.balanceLabel}: ${resolvedBalanceLabel}`}
               title={resolvedBalanceHint}
               className="inline-flex h-10 items-center gap-2 rounded-xl border border-border/60 bg-background/58 px-3 text-foreground-muted shadow-sm"
             >
               <WalletCards className="h-4.5 w-4.5 shrink-0 text-gold" />
               <div className="hidden xl:flex xl:flex-col xl:items-start xl:leading-none">
                 <span className="text-[10px] font-black uppercase tracking-[0.18em]">
                   {siteContent.navigation.balanceLabel}
                 </span>
                 <span className="mt-1 text-[11px] font-semibold text-foreground">
                   {resolvedBalanceLabel}
                 </span>
               </div>
             </div>

             <div className="hidden h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-border/60 bg-background/55 text-foreground-muted shadow-sm transition-all hover:border-accent/60 hover:text-foreground xl:flex">
               <Search className="h-4.5 w-4.5" />
             </div>
             <div className="relative hidden h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-border/60 bg-background/55 text-foreground-muted shadow-sm transition-all hover:border-accent/60 hover:text-foreground xl:flex">
               <Bell className="h-4.5 w-4.5" />
               <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
             </div>
             
             <div className="mx-1 hidden h-8 w-px bg-border/80 sm:block" />
             
             <div className="flex max-w-[120px] cursor-pointer items-center gap-3 rounded-2xl border border-border/60 bg-background/55 px-2 py-1.5 shadow-sm transition-colors hover:bg-background/70 sm:max-w-[200px] sm:px-3">
                <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-black text-xs uppercase shadow-sm">
                  {user.displayName?.[0] || user.email?.[0] || "U"}
                  <span className="absolute -bottom-0.5 -right-0.5 rounded-full border border-background-strong bg-background p-[1px]">
                    <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500" />
                  </span>
                </span>
                <span className="text-sm font-bold truncate text-foreground pr-1 hidden sm:block">
                  {user.displayName || user.email?.split('@')[0]}
                </span>
             </div>
          </div>
        </header>

        {/* Global App Scroll Area */}
        <main
          ref={mainScrollRef}
          className="flex-1 overflow-y-auto overflow-x-hidden global-scrollbar p-4 sm:p-6 lg:p-10 pb-12 sm:pb-14 lg:pb-16 relative"
        >
          <div className="mx-auto flex min-h-full w-full max-w-[1400px] animate-in fade-in duration-700 flex-col">
            <div className="flex-1">
              {children}
            </div>

            {/* The protected attribution seal now lives at the end of the scroll flow instead of a persistent footer bar.
                Keep it attached to page content here so branding stays visible without permanently taking workspace height away from users. */}
            <div className="mt-10 flex justify-center pt-4 sm:mt-12 sm:pt-6">
              <ProtectedSignatureSeal
                locale={locale}
                variant="compact"
                className="w-full max-w-4xl"
              />
            </div>
          </div>
        </main>

        <button
          type="button"
          aria-label={messages.scrollToTopLabel}
          title={messages.scrollToTopLabel}
          onClick={handleScrollToTop}
          style={scrollButtonStyle}
          className={`protected-scroll-top${showScrollTop ? " protected-scroll-top--visible" : ""}`}
        >
          <ArrowUp className="h-4.5 w-4.5" />
        </button>

      </div>
    </div>
  );
}
