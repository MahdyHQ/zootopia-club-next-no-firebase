"use client";

import { APP_ROUTES } from "@zootopia/shared-config";
import type { CSSProperties } from "react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Search, Bell, Sparkles, CheckCircle2, ChevronLeft, ChevronRight, ArrowUp, HandCoins, WalletCards, Plus, X } from "lucide-react";
import type {
  ApiResult,
  AssessmentDailyCreditsSummary,
  Locale,
  SessionUser,
  ThemeMode,
} from "@zootopia/shared-types";
import {
  ASSESSMENT_CREDIT_REFRESH_EVENT,
  dispatchAssessmentCreditSummaryUpdated,
} from "@/lib/assessment-credit-events";
import { logAssessmentCreditClientDiagnostic } from "@/lib/assessment-credit-diagnostics";
import {
  resolveAvatarFallbackInitial,
  resolveRoleGenderAvatarSrc,
} from "@/lib/avatar";
import type { AppMessages } from "@/lib/messages";
import { getSiteContent } from "@/lib/site-content";
import { IdentityAvatar } from "@/components/ui/identity-avatar";
import { ProtectedSignatureSeal } from "./protected-signature-seal";
import { ShellNav } from "./shell-nav";

type ProtectedShellProps = {
  children: React.ReactNode;
  messages: AppMessages;
  user: SessionUser;
  locale: Locale;
  themeMode: ThemeMode;
};

function areCreditSummariesEqual(
  current: AssessmentDailyCreditsSummary | null,
  next: AssessmentDailyCreditsSummary,
) {
  if (!current) {
    return false;
  }

  return (
    current.applies === next.applies &&
    current.isAdminExempt === next.isAdminExempt &&
    current.assessmentAccess === next.assessmentAccess &&
    current.dayKey === next.dayKey &&
    current.dailyDefaultLimit === next.dailyDefaultLimit &&
    current.dailyLimit === next.dailyLimit &&
    current.dailyLimitSource === next.dailyLimitSource &&
    current.usedCount === next.usedCount &&
    current.dailyRemainingCount === next.dailyRemainingCount &&
    current.manualCreditsAvailable === next.manualCreditsAvailable &&
    current.grantCreditsAvailable === next.grantCreditsAvailable &&
    current.extraCreditsAvailable === next.extraCreditsAvailable &&
    current.activeGrantCount === next.activeGrantCount &&
    current.totalRemainingCount === next.totalRemainingCount &&
    current.remainingCount === next.remainingCount &&
    current.resetsAt === next.resetsAt
  );
}

const CREDIT_HELP_DIALOG_TITLE_AR = "طلب كريدت تقييم إضافي";
const CREDIT_HELP_DIALOG_BODY_AR =
  "إذا كنت بحاجة إلى كريدت خاص أو عاجل، يُرجى التواصل مباشرة مع المطور والأدمن Elmahdy Abdallah.";
const CREDIT_HELP_DIALOG_NOTE_AR =
  "يرجى إرسال البريد الإلكتروني للحساب وسبب الطلب لتسريع المعالجة.";

export function ProtectedShell({
  children,
  messages,
  user,
  locale,
  themeMode,
}: ProtectedShellProps) {
  const CREDIT_SUMMARY_RECONCILE_INTERVAL_MS = 5_000;
  const CREDIT_STREAM_STALE_AFTER_MS = 25_000;
  const ASSESSMENT_CREDIT_REQUEST_ID_HEADER =
    "x-zootopia-assessment-credit-request-id";
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDesktopCollapsed, setIsDesktopCollapsed] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [isCreditHelpOpen, setIsCreditHelpOpen] = useState(false);
  const [creditSummary, setCreditSummary] =
    useState<AssessmentDailyCreditsSummary | null>(null);
  const [isCreditStreamHealthy, setIsCreditStreamHealthy] = useState(false);
  const mainScrollRef = useRef<HTMLElement | null>(null);
  const creditSummaryRequestRef = useRef<Promise<void> | null>(null);
  const creditSummaryRef = useRef<AssessmentDailyCreditsSummary | null>(null);
  const lastCreditStreamSignalAtRef = useRef(0);
  const creditHelpTriggerRef = useRef<HTMLButtonElement | null>(null);
  const creditHelpPanelRef = useRef<HTMLDivElement | null>(null);
  const pathname = usePathname();
  const siteContent = getSiteContent(locale);
  const headerAvatarSrc = resolveRoleGenderAvatarSrc(user);
  const headerAvatarInitial = resolveAvatarFallbackInitial(user);

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

  /* The protected shell is the single shared owner of visible credit summary state for protected
     pages. Keep all incoming fetch and SSE updates funneled through this one deduped handler so
     header chrome and downstream Assessment Studio listeners stay aligned to the same server truth. */
  const applyCreditSummary = useEffectEvent(
    (
      nextSummary: AssessmentDailyCreditsSummary,
      meta: {
        source: "fetch" | "sse";
        requestId?: string | null;
        eventId?: string | null;
        emittedAt?: string | null;
      },
    ) => {
      if (areCreditSummariesEqual(creditSummaryRef.current, nextSummary)) {
        return;
      }

      creditSummaryRef.current = nextSummary;
      setCreditSummary(nextSummary);
      dispatchAssessmentCreditSummaryUpdated({
        credits: nextSummary,
        source: meta.source,
        requestId: meta.requestId ?? null,
        eventId: meta.eventId ?? null,
        emittedAt: meta.emittedAt ?? null,
      });
      logAssessmentCreditClientDiagnostic({
        event: "protected_shell_summary_applied",
        details: {
          source: meta.source,
          path: pathname,
          requestId: meta.requestId ?? null,
          eventId: meta.eventId ?? null,
          remainingCount: nextSummary.remainingCount,
          assessmentAccess: nextSummary.assessmentAccess,
        },
      });
    },
  );

  const refreshCreditSummary = useEffectEvent(async () => {
    /* The protected shell receives refresh triggers from focus, visibility, interval, and
       assessment-route events. Coalescing keeps those signals from fan-outing into duplicate
       credit requests against the same owner session. */
    if (creditSummaryRequestRef.current) {
      await creditSummaryRequestRef.current;
      return;
    }

    const requestPromise = (async () => {
      try {
        logAssessmentCreditClientDiagnostic({
          event: "protected_shell_refresh_started",
          details: {
            path: pathname,
          },
        });

        const response = await fetch("/api/assessment/credits", {
          method: "GET",
          cache: "no-store",
        });
        const requestId =
          response.headers.get(ASSESSMENT_CREDIT_REQUEST_ID_HEADER) ?? null;
        const payload = (await response.json()) as ApiResult<{
          credits: AssessmentDailyCreditsSummary;
        }>;
        if (!response.ok || !payload.ok) {
          logAssessmentCreditClientDiagnostic({
            event: "protected_shell_refresh_failed",
            details: {
              path: pathname,
              requestId,
              status: response.status,
              errorCode: payload.ok ? null : payload.error.code,
            },
          });
          return;
        }

        applyCreditSummary(payload.data.credits, {
          source: "fetch",
          requestId,
        });
        logAssessmentCreditClientDiagnostic({
          event: "protected_shell_refresh_result",
          details: {
            path: pathname,
            requestId,
            remainingCount: payload.data.credits.remainingCount,
            assessmentAccess: payload.data.credits.assessmentAccess,
          },
        });
      } catch {
        logAssessmentCreditClientDiagnostic({
          event: "protected_shell_refresh_failed",
          details: {
            path: pathname,
            failureKind: "network_or_parse",
          },
        });
        // Keep the header chip resilient: transient network failures should not break shell UI.
      }
    })();

    creditSummaryRequestRef.current = requestPromise;
    try {
      await requestPromise;
    } finally {
      if (creditSummaryRequestRef.current === requestPromise) {
        creditSummaryRequestRef.current = null;
      }
    }
  });

  useEffect(() => {
    creditSummaryRef.current = creditSummary;
  }, [creditSummary]);

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

    /* SSE is the primary near-real-time lane for protected credit chrome. Focus/visibility and
       the existing interval remain as fallback when the stream is unsupported or reconnecting, so
       server-truth balance still heals without trusting stale client state. */
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshCreditSummary();
      }
    };

    const intervalId = window.setInterval(() => {
      // Skip background polling for hidden tabs; focus/visibility handlers resync on return.
      if (document.visibilityState !== "visible") {
        return;
      }

      const lastSignalAt = lastCreditStreamSignalAtRef.current;
      const streamSignalAgeMs = lastSignalAt > 0 ? Date.now() - lastSignalAt : Number.POSITIVE_INFINITY;
      const hasFreshStreamSignal =
        isCreditStreamHealthy && streamSignalAgeMs < CREDIT_STREAM_STALE_AFTER_MS;

      if (isCreditStreamHealthy && !hasFreshStreamSignal) {
        setIsCreditStreamHealthy(false);
        logAssessmentCreditClientDiagnostic({
          event: "protected_shell_stream_marked_stale",
          details: {
            path: pathname,
            streamSignalAgeMs,
          },
        });
      }

      if (hasFreshStreamSignal) {
        return;
      }

      void refreshCreditSummary();
    }, CREDIT_SUMMARY_RECONCILE_INTERVAL_MS);

    void refreshCreditSummary();
    window.addEventListener(ASSESSMENT_CREDIT_REFRESH_EVENT, handleRefreshCredits);
    window.addEventListener("focus", handleRefreshCredits);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener(
        ASSESSMENT_CREDIT_REFRESH_EVENT,
        handleRefreshCredits,
      );
      window.removeEventListener("focus", handleRefreshCredits);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [isCreditStreamHealthy, pathname]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.EventSource === "undefined") {
      setIsCreditStreamHealthy(false);
      lastCreditStreamSignalAtRef.current = 0;
      return;
    }

    const creditStream = new window.EventSource("/api/assessment/credits/stream");

    /* This same-origin SSE connection is scoped by the authenticated session on the server.
       Keep the browser client read-only here and continue routing every payload through the
       shell's shared summary handler so other protected surfaces only ever see server-resolved truth. */
    const handleStreamSummary = (event: Event) => {
      try {
        const payload = JSON.parse(
          (event as MessageEvent<string>).data,
        ) as {
          credits?: AssessmentDailyCreditsSummary;
          emittedAt?: string;
        };
        if (!payload.credits) {
          return;
        }

        lastCreditStreamSignalAtRef.current = Date.now();
        setIsCreditStreamHealthy(true);
        const eventId = (event as MessageEvent<string>).lastEventId || null;
        logAssessmentCreditClientDiagnostic({
          event: "protected_shell_stream_summary_received",
          details: {
            path: pathname,
            eventId,
            emittedAt: payload.emittedAt ?? null,
            remainingCount: payload.credits.remainingCount,
            assessmentAccess: payload.credits.assessmentAccess,
          },
        });
        applyCreditSummary(payload.credits, {
          source: "sse",
          eventId,
          emittedAt: payload.emittedAt ?? null,
        });
      } catch {
        // Leave fallback refresh active if the stream emits an unreadable payload.
      }
    };

    /* Heartbeats stay intentionally visible to the client so the shell can distinguish
       a genuinely fresh live stream from a socket that opened once but stopped delivering
       actionable credit events. */
    const handleStreamHeartbeat = (event: Event) => {
      try {
        const payload = JSON.parse(
          (event as MessageEvent<string>).data,
        ) as { emittedAt?: string };
        lastCreditStreamSignalAtRef.current = Date.now();
        setIsCreditStreamHealthy(true);
        logAssessmentCreditClientDiagnostic({
          event: "protected_shell_stream_heartbeat_received",
          details: {
            path: pathname,
            eventId: (event as MessageEvent<string>).lastEventId || null,
            emittedAt: payload.emittedAt ?? null,
          },
        });
      } catch {
        lastCreditStreamSignalAtRef.current = Date.now();
        setIsCreditStreamHealthy(true);
      }
    };

    const handleStreamOpen = () => {
      lastCreditStreamSignalAtRef.current = Date.now();
      setIsCreditStreamHealthy(true);
      logAssessmentCreditClientDiagnostic({
        event: "protected_shell_stream_opened",
        details: {
          path: pathname,
        },
      });
    };

    const handleStreamError = () => {
      setIsCreditStreamHealthy(false);
      lastCreditStreamSignalAtRef.current = 0;
      logAssessmentCreditClientDiagnostic({
        event: "protected_shell_stream_error",
        details: {
          path: pathname,
        },
      });
    };

    creditStream.addEventListener("summary", handleStreamSummary);
    creditStream.addEventListener("heartbeat", handleStreamHeartbeat);
    creditStream.addEventListener("open", handleStreamOpen);
    creditStream.addEventListener("error", handleStreamError);

    return () => {
      setIsCreditStreamHealthy(false);
      lastCreditStreamSignalAtRef.current = 0;
      creditStream.removeEventListener("summary", handleStreamSummary);
      creditStream.removeEventListener("heartbeat", handleStreamHeartbeat);
      creditStream.removeEventListener("open", handleStreamOpen);
      creditStream.removeEventListener("error", handleStreamError);
      creditStream.close();
    };
  }, [pathname]);

  useEffect(() => {
    if (!isCreditHelpOpen) {
      return;
    }

    /* Keep the credit-help surface unobtrusive: close on outside pointer and Escape
       so it behaves like a compact header popover instead of a blocking modal. */
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }

      if (creditHelpPanelRef.current?.contains(target)) {
        return;
      }

      if (creditHelpTriggerRef.current?.contains(target)) {
        return;
      }

      setIsCreditHelpOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsCreditHelpOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isCreditHelpOpen]);

  useEffect(() => {
    /* Route transitions inside protected pages should not keep transient header
       popovers open; reset this local support surface on every pathname change. */
    setIsCreditHelpOpen(false);

    /* Protected pages can be entered from prefetched payloads that were captured before an
       external admin credit mutation. Force a fresh server summary on every protected-route
       transition so header and Assessment Studio reflect current backend credit truth quickly. */
    void refreshCreditSummary();
  }, [pathname]);

  const resolvedBalanceLabel = creditSummary?.isAdminExempt
    ? messages.roleAdmin
    : String(creditSummary?.remainingCount ?? siteContent.navigation.balancePlaceholder);
  const resolvedBalanceHint = creditSummary?.isAdminExempt
    ? messages.assessmentDailyCreditsAdminExemptBody
    : creditSummary
      ? `${creditSummary.remainingCount ?? 0} / ${creditSummary.totalRemainingCount ?? 0}`
      : siteContent.navigation.balanceHint;
  const creditHelpTriggerLabel =
    locale === "ar" ? "طلب كريدت عاجل" : "Urgent credit help";
  const creditHelpCloseLabel =
    locale === "ar" ? "إغلاق ملاحظة الدعم" : "Close support note";

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
             {/* These header controls intentionally stay compact so the protected shell
                 preserves space for account and navigation actions across breakpoints. */}
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
             <div className="relative flex items-center gap-1.5">
               <div
                 aria-label={`${siteContent.navigation.balanceLabel}: ${resolvedBalanceLabel}`}
                 title={resolvedBalanceHint}
                 className="inline-flex h-10 items-center gap-2 rounded-xl border border-border/60 bg-background/58 px-2.5 text-foreground-muted shadow-sm"
               >
                 <WalletCards className="h-4.5 w-4.5 shrink-0 text-gold" />
                 <span className="hidden text-[10px] font-black uppercase tracking-[0.16em] md:inline">
                   {siteContent.navigation.balanceLabel}
                 </span>
                 <span className="max-w-[4.75rem] truncate text-sm font-semibold leading-none text-foreground tabular-nums">
                   {resolvedBalanceLabel}
                 </span>
               </div>

               {/* This adjacent plus action opens support guidance only; it never mutates
                   credits client-side and keeps quota authority strictly server-owned. */}
               <button
                 ref={creditHelpTriggerRef}
                 type="button"
                 aria-haspopup="dialog"
                 aria-expanded={isCreditHelpOpen}
                 aria-controls="credit-help-dialog"
                 aria-label={creditHelpTriggerLabel}
                 title={creditHelpTriggerLabel}
                 onClick={() => setIsCreditHelpOpen((current) => !current)}
                 className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 bg-background/58 text-foreground-muted shadow-sm transition-all hover:border-accent/70 hover:text-accent focus:outline-none"
               >
                 <Plus className="h-4 w-4" />
               </button>

               {isCreditHelpOpen ? (
                 <div
                   id="credit-help-dialog"
                   ref={creditHelpPanelRef}
                   role="dialog"
                   aria-modal="false"
                   aria-label={creditHelpTriggerLabel}
                   dir="rtl"
                   className={`absolute top-[calc(100%+0.7rem)] z-40 w-[21rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-border/65 bg-background-elevated/95 p-4 text-right shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150 ${isRtl ? "left-0" : "right-0"}`}
                 >
                   <div className="flex items-start justify-between gap-3">
                     <div className="space-y-1">
                       <p className="text-xs font-black text-accent">
                         {CREDIT_HELP_DIALOG_TITLE_AR}
                       </p>
                     </div>
                     <button
                       type="button"
                       aria-label={creditHelpCloseLabel}
                       title={creditHelpCloseLabel}
                       onClick={() => setIsCreditHelpOpen(false)}
                       className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background/55 text-foreground-muted transition-colors hover:border-accent/70 hover:text-accent"
                     >
                       <X className="h-3.5 w-3.5" />
                     </button>
                   </div>

                   <p className="mt-2 text-sm leading-6 text-foreground/90">
                     {CREDIT_HELP_DIALOG_BODY_AR}
                   </p>
                   <p className="mt-2 text-xs leading-5 text-foreground-muted/95">
                     {CREDIT_HELP_DIALOG_NOTE_AR}
                   </p>
                 </div>
               ) : null}
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
                <IdentityAvatar
                  src={headerAvatarSrc}
                  fallbackInitial={headerAvatarInitial}
                  size={28}
                  sizes="28px"
                  containerClassName="h-7 w-7 border border-emerald-500/30 bg-emerald-500/20 shadow-sm"
                  fallbackClassName="text-xs font-black uppercase text-emerald-400"
                >
                  <span className="absolute -bottom-0.5 -right-0.5 rounded-full border border-background-strong bg-background p-[1px]">
                    <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500" />
                  </span>
                </IdentityAvatar>
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
