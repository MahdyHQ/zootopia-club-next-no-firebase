"use client";

import { APP_ROUTES } from "@zootopia/shared-config";
import type { CSSProperties } from "react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Search, Bell, Sparkles, CheckCircle2, ChevronLeft, ChevronRight, ArrowUp, HandCoins, WalletCards, Plus, X } from "lucide-react";
import type {
  AssessmentDailyCreditsSummary,
  Locale,
  SessionUser,
  ThemeMode,
} from "@zootopia/shared-types";
import { logAssessmentCreditClientDiagnostic } from "@/lib/assessment-credit-diagnostics";
import {
  formatAssessmentCreditCount,
  resolveAssessmentCreditDisplayModel,
} from "@/lib/assessment-credit-display";
import {
  ASSESSMENT_CREDIT_SUMMARY_STALE_TIME_MS,
  reconcileAssessmentCreditQueries,
  useAssessmentCreditSummaryQuery,
} from "@/lib/assessment-credit-query";
import {
  ASSESSMENT_CREDIT_REALTIME_EVENT,
  type AssessmentCreditRealtimePayload,
} from "@/lib/assessment-credit-realtime";
import {
  resolveAvatarFallbackInitial,
  resolveRoleGenderAvatarSrc,
} from "@/lib/avatar";
import type { AppMessages } from "@/lib/messages";
import { getSiteContent } from "@/lib/site-content";
import {
  getSupabaseClient,
  isSupabaseWebConfigured,
} from "@/lib/supabase/client";
import { IdentityAvatar } from "@/components/ui/identity-avatar";
import { ProtectedSignatureSeal } from "./protected-signature-seal";
import { ShellNav } from "./shell-nav";

type ProtectedShellProps = {
  children: React.ReactNode;
  messages: AppMessages;
  user: SessionUser;
  locale: Locale;
  themeMode: ThemeMode;
  assessmentCreditRealtimeTopic: string | null;
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

const CREDIT_SUMMARY_RECONCILE_INTERVAL_MS = 5_000;
const CREDIT_SUMMARY_HEALTHY_REVALIDATE_INTERVAL_MS = 60_000;
const CREDIT_SUMMARY_RETURN_RESET_THRESHOLD_MS =
  ASSESSMENT_CREDIT_SUMMARY_STALE_TIME_MS;
const CREDIT_SUMMARY_RESUME_DEDUP_WINDOW_MS = 1_500;

const CREDIT_HELP_DIALOG_TITLE_AR = "طلب رصيد إضافي";
const CREDIT_HELP_DIALOG_BODY_AR =
  "إذا كنت بحاجة إلى رصيد خاص أو عاجل، يُرجى التواصل مباشرة مع المطور والأدمن Elmahdy Abdallah.";
const CREDIT_HELP_DIALOG_NOTE_AR =
  "يرجى إرسال البريد الإلكتروني للحساب وسبب الطلب لتسريع المعالجة.";

function buildHeaderCreditHint(input: {
  locale: Locale;
  totalAvailable: number;
  dailyAvailable: number;
  extraAvailable: number;
  hasManualCredits: boolean;
  hasGrantCredits: boolean;
}) {
  const total = formatAssessmentCreditCount(input.totalAvailable, input.locale);
  const daily = formatAssessmentCreditCount(input.dailyAvailable, input.locale);
  const extra = formatAssessmentCreditCount(input.extraAvailable, input.locale);
  const sourceLabels = [
    input.extraAvailable > 0 && input.hasManualCredits
      ? input.locale === "ar"
        ? "إضافة إدارية"
        : "Admin-added"
      : null,
    input.extraAvailable > 0 && input.hasGrantCredits
      ? input.locale === "ar"
        ? "منح"
        : "Grant"
      : null,
  ].filter((value): value is string => Boolean(value));

  const summaryParts = input.locale === "ar"
    ? [`المتاح الآن: ${total}`, `اليومي: ${daily}`, `الإضافي: ${extra}`]
    : [`Available now: ${total}`, `Daily: ${daily}`, `Extra: ${extra}`];

  return [...summaryParts, ...sourceLabels].join(" • ");
}

export function ProtectedShell({
  children,
  messages,
  user,
  locale,
  themeMode,
  assessmentCreditRealtimeTopic,
}: ProtectedShellProps) {
  const queryClient = useQueryClient();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDesktopCollapsed, setIsDesktopCollapsed] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [isCreditHelpOpen, setIsCreditHelpOpen] = useState(false);
  const [isCreditRealtimeHealthy, setIsCreditRealtimeHealthy] = useState(false);
  const mainScrollRef = useRef<HTMLElement | null>(null);
  const creditHelpTriggerRef = useRef<HTMLButtonElement | null>(null);
  const creditHelpPanelRef = useRef<HTMLDivElement | null>(null);
  const lastAppliedCreditSummaryRef =
    useRef<AssessmentDailyCreditsSummary | null>(null);
  const hiddenAtRef = useRef<number | null>(null);
  const lastResumeReconcileAtRef = useRef(0);
  const pathname = usePathname();
  const creditSummaryQuery = useAssessmentCreditSummaryQuery({
    source: "protected-shell",
    refetchIntervalMs: isCreditRealtimeHealthy
      ? CREDIT_SUMMARY_HEALTHY_REVALIDATE_INTERVAL_MS
      : CREDIT_SUMMARY_RECONCILE_INTERVAL_MS,
  });
  const creditSummary = creditSummaryQuery.data ?? null;
  const creditDisplay = creditSummary
    ? resolveAssessmentCreditDisplayModel(creditSummary)
    : null;
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

  /* ProtectedShell no longer keeps a private credit state copy. All refresh triggers reconcile
     the shared summary query plus the richer owner-details query so protected chrome, Assessment
     Studio, and the credit details page stay aligned to the same server-owned truth refreshes. */
  const requestCreditSummaryRefetch = useEffectEvent(
    async (
      reason: string,
      details?: Record<string, unknown>,
      strategy: "invalidate-active" | "reset-active" = "invalidate-active",
    ) => {
      try {
        await reconcileAssessmentCreditQueries(queryClient, {
          source: "protected-shell",
          reason,
          strategy,
          details: {
            path: pathname,
            ...(details ?? {}),
          },
        });
      } catch {
        logAssessmentCreditClientDiagnostic({
          event: "protected_shell_refresh_failed",
          details: {
            path: pathname,
            reason,
            failureKind: "query_reconcile_failed",
          },
        });
      }
    },
  );

  useEffect(() => {
    if (!creditSummary) {
      return;
    }

    if (areCreditSummariesEqual(lastAppliedCreditSummaryRef.current, creditSummary)) {
      return;
    }

    lastAppliedCreditSummaryRef.current = creditSummary;
    logAssessmentCreditClientDiagnostic({
      event: "protected_shell_summary_applied",
      details: {
        source: "query-cache",
        path: pathname,
        displayState: creditDisplay?.state ?? null,
        dailyAvailable: creditDisplay?.dailyAvailable ?? null,
        extraAvailable: creditDisplay?.extraAvailable ?? null,
        remainingCount: creditSummary.remainingCount,
        manualCreditsAvailable: creditSummary.manualCreditsAvailable,
        grantCreditsAvailable: creditSummary.grantCreditsAvailable,
        assessmentAccess: creditSummary.assessmentAccess,
      },
    });
  }, [creditDisplay, creditSummary, pathname]);

  useEffect(() => {
    if (!creditSummaryQuery.error) {
      return;
    }

    logAssessmentCreditClientDiagnostic({
      event: "protected_shell_summary_query_failed",
      details: {
        path: pathname,
        errorCode: creditSummaryQuery.error.code ?? null,
      },
    });
  }, [creditSummaryQuery.error, pathname]);

  const handleCreditRealtimeMessage = useEffectEvent(
    (payload: AssessmentCreditRealtimePayload | null | undefined) => {
      if (!payload) {
        logAssessmentCreditClientDiagnostic({
          event: "protected_shell_realtime_message_ignored",
          details: {
            path: pathname,
            reason: "missing_payload",
          },
        });
        return;
      }

      setIsCreditRealtimeHealthy(true);
      logAssessmentCreditClientDiagnostic({
        event: "protected_shell_realtime_message_received",
        details: {
          path: pathname,
          eventId: payload.eventId,
          emittedAt: payload.emittedAt,
          traceId: payload.traceId ?? null,
        },
      });
      /* Provider-backed realtime is an invalidation lane only. Re-fetching `/api/assessment/credits`
         here keeps the header and Assessment Studio pinned to the same server-owned summary path
         even if broadcasts arrive duplicated, out-of-order, or from a legacy client. */
      void requestCreditSummaryRefetch("realtime-broadcast", {
        eventId: payload.eventId,
        emittedAt: payload.emittedAt,
        traceId: payload.traceId ?? null,
      });
    },
  );

  const handleCreditRealtimeStatus = useEffectEvent((status: string) => {
    const normalizedStatus = String(status ?? "").trim().toUpperCase();
    const isHealthyStatus =
      normalizedStatus === "SUBSCRIBED" || normalizedStatus === "JOINED";

    setIsCreditRealtimeHealthy(isHealthyStatus);
    logAssessmentCreditClientDiagnostic({
      event: "protected_shell_realtime_status_changed",
      details: {
        path: pathname,
        status: normalizedStatus || "UNKNOWN",
      },
    });

    if (isHealthyStatus) {
      void requestCreditSummaryRefetch("realtime-status-healthy", {
        status: normalizedStatus,
      });
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
    /* Provider-backed realtime is the primary near-real-time lane for protected credit chrome.
       Focus and visibility still trigger query invalidation so tabs recover quickly after sleep,
       network blips, or auth-refresh windows without reviving the old custom browser event bridge. */
    const handleWindowFocus = () => {
      if (
        Date.now() - lastResumeReconcileAtRef.current
        < CREDIT_SUMMARY_RESUME_DEDUP_WINDOW_MS
      ) {
        return;
      }

      void requestCreditSummaryRefetch("window-focus");
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
        return;
      }

      if (document.visibilityState === "visible") {
        const hiddenDurationMs = hiddenAtRef.current === null
          ? null
          : Math.max(0, Date.now() - hiddenAtRef.current);
        hiddenAtRef.current = null;

        if (
          hiddenDurationMs !== null
          && hiddenDurationMs >= CREDIT_SUMMARY_RETURN_RESET_THRESHOLD_MS
        ) {
          lastResumeReconcileAtRef.current = Date.now();
          /* Returning from a longer absence can leave an old balance resident in the in-memory
             React Query cache until the background refetch finishes. Reset the shared credit query
             for this protected-shell resume path so header and Assessment Studio show loading
             instead of a stale number while `/api/assessment/credits` resolves fresh truth. */
          void requestCreditSummaryRefetch(
            "visibility-visible-return",
            {
              hiddenDurationMs,
            },
            "reset-active",
          );
          return;
        }

        void requestCreditSummaryRefetch("visibility-visible", {
          hiddenDurationMs,
        });
      }
    };

    void requestCreditSummaryRefetch("shell-mounted");
    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [pathname]);

  useEffect(() => {
    if (
      typeof window === "undefined"
      || !assessmentCreditRealtimeTopic
      || !isSupabaseWebConfigured()
    ) {
      return;
    }

    const supabaseClient = getSupabaseClient();
    let disposed = false;
    let creditRealtimeChannel: ReturnType<typeof supabaseClient.channel> | null =
      null;

    const removeCreditRealtimeChannel = () => {
      if (!creditRealtimeChannel) {
        return;
      }

      const channelToRemove = creditRealtimeChannel;
      creditRealtimeChannel = null;
      void supabaseClient.removeChannel(channelToRemove);
    };

    const attachCreditRealtimeChannel = async (input: {
      accessToken: string;
      reason: string;
      authEvent: string;
    }) => {
      if (disposed) {
        return;
      }

      const normalizedAccessToken = input.accessToken.trim();
      if (!normalizedAccessToken) {
        setIsCreditRealtimeHealthy(false);
        logAssessmentCreditClientDiagnostic({
          event: "protected_shell_realtime_auth_missing_token",
          details: {
            path: pathname,
            reason: input.reason,
            authEvent: input.authEvent,
          },
        });
        removeCreditRealtimeChannel();
        return;
      }

      try {
        await supabaseClient.realtime.setAuth(normalizedAccessToken);
      } catch {
        setIsCreditRealtimeHealthy(false);
        logAssessmentCreditClientDiagnostic({
          event: "protected_shell_realtime_auth_apply_failed",
          details: {
            path: pathname,
            reason: input.reason,
            authEvent: input.authEvent,
          },
        });
        removeCreditRealtimeChannel();
        return;
      }

      logAssessmentCreditClientDiagnostic({
        event: "protected_shell_realtime_auth_applied",
        details: {
          path: pathname,
          reason: input.reason,
          authEvent: input.authEvent,
        },
      });

      if (creditRealtimeChannel) {
        return;
      }

      const nextRealtimeChannel = supabaseClient.channel(
        assessmentCreditRealtimeTopic,
        {
          config: {
            private: true,
            broadcast: {
              self: false,
            },
          },
        },
      );

      /* This provider-backed private channel replaces the same-instance SSE lane for credit
         delivery. Keep the shell as the only browser subscriber and continue treating
         broadcasts as invalidation-only signals so protected chrome and Assessment Studio stay
         aligned to one canonical `/api/assessment/credits` read path. */
      nextRealtimeChannel.on(
        "broadcast",
        { event: ASSESSMENT_CREDIT_REALTIME_EVENT },
        ({ payload }) => {
          handleCreditRealtimeMessage(
            payload as AssessmentCreditRealtimePayload | null | undefined,
          );
        },
      );

      nextRealtimeChannel.subscribe((status) => {
        handleCreditRealtimeStatus(status);
      });

      creditRealtimeChannel = nextRealtimeChannel;
    };

    const initializeCreditRealtimeChannel = async () => {
      const { data, error } = await supabaseClient.auth.getSession();
      if (disposed) {
        return;
      }

      if (error) {
        setIsCreditRealtimeHealthy(false);
        logAssessmentCreditClientDiagnostic({
          event: "protected_shell_realtime_auth_session_read_failed",
          details: {
            path: pathname,
            reason: "initial-session-read",
          },
        });
        return;
      }

      const accessToken = data.session?.access_token ?? "";
      if (!accessToken.trim()) {
        setIsCreditRealtimeHealthy(false);
        logAssessmentCreditClientDiagnostic({
          event: "protected_shell_realtime_auth_session_missing",
          details: {
            path: pathname,
            reason: "initial-session-read",
          },
        });
        return;
      }

      await attachCreditRealtimeChannel({
        accessToken,
        reason: "initial-session-read",
        authEvent: "initial-session",
      });
    };

    void initializeCreditRealtimeChannel();

    const authStateChange = supabaseClient.auth.onAuthStateChange((event, session) => {
      const normalizedEvent = String(event ?? "UNKNOWN").toUpperCase();
      const nextAccessToken = session?.access_token ?? "";

      logAssessmentCreditClientDiagnostic({
        event: "protected_shell_realtime_auth_state_changed",
        details: {
          path: pathname,
          authEvent: normalizedEvent,
          hasSession: Boolean(session),
        },
      });

      /* Supabase recommends deferring extra auth client calls outside of the auth callback.
         Use a zero-delay task so Realtime token updates cannot deadlock with auth event
         processing while still reacting immediately to token refresh/sign-out changes. */
      window.setTimeout(() => {
        if (disposed) {
          return;
        }

        if (!nextAccessToken.trim()) {
          setIsCreditRealtimeHealthy(false);
          removeCreditRealtimeChannel();
          return;
        }

        void attachCreditRealtimeChannel({
          accessToken: nextAccessToken,
          reason: "auth-state-change",
          authEvent: normalizedEvent,
        });
      }, 0);
    });

    return () => {
      disposed = true;
      setIsCreditRealtimeHealthy(false);
      authStateChange.data.subscription.unsubscribe();
      removeCreditRealtimeChannel();
    };
  }, [assessmentCreditRealtimeTopic, pathname]);

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
    const closeHelpPopoverTimeoutId = window.setTimeout(() => {
      setIsCreditHelpOpen(false);
    }, 0);

    /* Protected pages can be entered from prefetched payloads that were captured before an
       external admin credit mutation. Force a fresh server summary on every protected-route
       transition so header and Assessment Studio reflect current backend credit truth quickly. */
    void requestCreditSummaryRefetch("pathname-change");

    return () => {
      window.clearTimeout(closeHelpPopoverTimeoutId);
    };
  }, [pathname]);

  /* Keep the header neutral until the canonical shared query resolves. Rendering a placeholder
     balance here while Assessment Studio waits on the same query would recreate a temporary
     two-state credit UI during first load or post-mutation reconciliation. */
  const resolvedBalanceLabel = !creditSummary
    ? messages.loading
    : creditDisplay?.state === "admin_exempt"
      ? messages.roleAdmin
      : formatAssessmentCreditCount(creditDisplay?.totalAvailable ?? 0, locale);
  const resolvedBalanceHint = !creditSummary
    ? messages.loading
    : creditDisplay?.state === "admin_exempt"
      ? messages.assessmentDailyCreditsAdminExemptBody
      : creditDisplay?.state === "access_disabled"
        ? messages.assessmentAccessDisabledBody
        : buildHeaderCreditHint({
            locale,
            totalAvailable: creditDisplay?.totalAvailable ?? 0,
            dailyAvailable: creditDisplay?.dailyAvailable ?? 0,
            extraAvailable: creditDisplay?.extraAvailable ?? 0,
            hasManualCredits: creditDisplay?.hasManualCredits ?? false,
            hasGrantCredits: creditDisplay?.hasGrantCredits ?? false,
          });
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

             {/* The shell badge mirrors the server-authoritative global balance for the signed-in
               owner. Keep this read-only so quota authority remains in backend reserve/commit routes. */}
            <div className="relative flex items-center gap-1.5">
              <Link
                href={APP_ROUTES.globalCredits}
                aria-label={`${siteContent.navigation.balanceLabel}: ${resolvedBalanceLabel}`}
                title={resolvedBalanceHint}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-border/60 bg-background/58 px-2.5 text-foreground-muted shadow-sm transition hover:border-emerald-500/30 hover:text-foreground"
              >
                 <WalletCards className="h-4.5 w-4.5 shrink-0 text-gold" />
                 <span className="hidden text-[10px] font-black uppercase tracking-[0.16em] md:inline">
                   {siteContent.navigation.balanceLabel}
                 </span>
                 <span className="max-w-[4.75rem] truncate text-sm font-semibold leading-none text-foreground tabular-nums">
                   {resolvedBalanceLabel}
                 </span>
              </Link>

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
