"use client";

import { APP_ROUTES } from "@zootopia/shared-config";
import type { Locale, SessionUser, ThemeMode } from "@zootopia/shared-types";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  UploadCloud,
  FileText,
  PieChart,
  BarChart3,
  Crown,
  Info,
  MessagesSquare,
  Lock,
  Settings,
  ShieldCheck,
  Users,
  Activity,
  WalletCards,
  Route as RouteIcon,
  LogOut,
} from "lucide-react";

import type { AppMessages } from "@/lib/messages";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { ZootopiaMark } from "@/components/branding/zootopia-brand";
import { LocaleToggle } from "@/components/preferences/locale-toggle";
import { ThemeToggle } from "@/components/preferences/theme-toggle";

type ShellNavProps = {
  messages: AppMessages;
  user: SessionUser;
  locale: Locale;
  themeMode: ThemeMode;
  isCollapsed?: boolean;
};

export function ShellNav({
  messages,
  user,
  locale,
  themeMode,
  isCollapsed = false,
}: ShellNavProps) {
  const pathname = usePathname();
  const canAccessUserWorkspace = user.role === "admin" || user.profileCompleted;
  const canAccessInfographic = user.role === "admin";

  const getIconForRoute = (href: string) => {
    switch (href) {
      case APP_ROUTES.home:
        return Home;
      case APP_ROUTES.upload:
        return UploadCloud;
      case APP_ROUTES.history:
        return Activity;
      case APP_ROUTES.assessment:
        return FileText;
      case APP_ROUTES.assessmentCreditDetails:
      case APP_ROUTES.assessmentCredits:
      case APP_ROUTES.globalCredits:
        return WalletCards;
      case APP_ROUTES.infographic:
        return PieChart;
      case APP_ROUTES.settings:
        return Settings;
      case APP_ROUTES.about:
        return Info;
      case APP_ROUTES.contact:
        return MessagesSquare;
      case APP_ROUTES.reviews:
        return MessagesSquare;
      case APP_ROUTES.hallOfHonor:
        return Crown;
      case APP_ROUTES.journey:
        return RouteIcon;
      case APP_ROUTES.lectureSummary:
        return RouteIcon;
      case APP_ROUTES.admin:
        return ShieldCheck;
      case APP_ROUTES.adminUsers:
        return Users;
      case APP_ROUTES.adminReviews:
        return MessagesSquare;
      case APP_ROUTES.adminPlatformUsage:
        return BarChart3;
      default:
        return Activity;
    }
  };

  const menuItems = [
    ...(canAccessUserWorkspace
      ? [
          { href: APP_ROUTES.upload, label: messages.navUpload || "Upload Data" },
          { href: APP_ROUTES.home, label: messages.navHome || "Platform Home" },
          { href: APP_ROUTES.history, label: messages.navHistory || "History" },
          { href: APP_ROUTES.assessment, label: messages.navAssessment || "AI Assessment" },
          {
            href: APP_ROUTES.assessmentCreditDetails,
            label:
              messages.navAssessmentCredits
              || messages.navGlobalCredits
              || "Assessment credits",
          },
          {
            href: APP_ROUTES.infographic,
            label: messages.navInfographic || "Generate Visual",
            locked: !canAccessInfographic,
          },
        ]
      : []),
    /* About and Contact stay in the protected sidebar even though they are public routes.
       Keep them in this shared nav so signed-in users and admins can reach platform context/support without forking a second sidebar system. */
    { href: APP_ROUTES.settings, label: messages.navSettings || "Settings" },
     /* Keep Hall of Honor in the shared protected sidebar so both users and admins
       can reach the public tribute route from inside the workspace without duplicating nav systems. */
     { href: APP_ROUTES.hallOfHonor, label: messages.navHallOfHonor || "Hall of Honor" },
     /* Journey is a shared informational product page that should remain reachable
       from inside the workspace without forcing users to leave the protected nav model. */
     { href: APP_ROUTES.journey, label: messages.navJourney || "Platform Journey" },
    /* Reviews is public, but keeping it in the protected sidebar lets signed-in users
       reach the community proof surface without creating a second navigation owner. */
    { href: APP_ROUTES.reviews, label: messages.navReviews || "User Reviews" },
    /* Keep lecture-summary reachable from the protected sidebar so users can revisit
       the teaser destination even after dismissing the Home prompt. */
    { href: APP_ROUTES.lectureSummary, label: "Coming Soon" },
    { href: APP_ROUTES.about, label: messages.navAbout || "About" },
    { href: APP_ROUTES.contact, label: messages.navContact || "Contact" },
    ...(user.role === "admin"
      ? [
          /* Keep admin-only platform observability in the same canonical admin nav group so
             desktop/mobile/collapsed sidebar states all inherit one route-owned source of truth. */
          { href: APP_ROUTES.admin, label: messages.navAdmin || "Admin Portal" },
          { href: APP_ROUTES.adminUsers, label: messages.navAdminUsers || "User Directory" },
          { href: APP_ROUTES.adminReviews, label: messages.navAdminReviews || "Reviews" },
          {
            href: APP_ROUTES.adminPlatformUsage,
            label: messages.navAdminPlatformUsage || "Platform Usage",
          },
        ]
      : []),
  ];

  return (
    <div className="relative flex h-full max-h-full w-full flex-col overflow-hidden rounded-[2.5rem] border border-border/60 bg-background-elevated/72 text-foreground shadow-2xl backdrop-blur-2xl transition-all duration-300">
      {/* Decorative gradient blur - Emerald glow mapped to background palette */}
      <div className="absolute top-0 right-0 -mr-20 -mt-20 h-64 w-64 rounded-full bg-emerald-500/10 blur-[100px] pointer-events-none" />

      {/* Header / Branding */}
      <div className={`relative z-10 border-b border-border/60 ${isCollapsed ? 'p-5 flex items-center justify-center' : 'p-5 pb-5'} shrink-0`}>
        {/* The main protected-workspace logo lives in the sidebar header so the top toolbar can stay focused on controls and user context. */}
        <Link
          href={APP_ROUTES.home}
          title={messages.appName || "Zootopia Club"}
          className={`group flex min-w-0 items-center ${isCollapsed ? "justify-center" : "gap-3.5"}`}
        >
          <ZootopiaMark className={`${isCollapsed ? "h-11 w-11" : "h-10 w-10"} transition-transform duration-300 group-hover:scale-[1.03]`} />
          {!isCollapsed && (
            <div className="min-w-0">
              <h1 className="truncate text-[1.45rem] font-black leading-none tracking-[-0.02em] text-foreground transition-all duration-300">
                {messages.appName || "Zootopia Club"}
              </h1>
            </div>
          )}
        </Link>

        {!isCollapsed && (
          <div className="mt-4 flex flex-col gap-1 overflow-hidden rounded-2xl border border-border/60 bg-background/50 p-3.5 shadow-sm backdrop-blur-md">
            <p className="truncate text-[10px] font-bold uppercase tracking-wider text-accent-strong">
              {messages.signedInAs || "Signed in as"}
            </p>
            <p className="w-full truncate text-sm font-bold text-foreground" title={user.displayName || user.email || "User"}>
              {user.displayName || user.email?.split('@')[0] || "User"}
            </p>
          </div>
        )}
      </div>

      {/* Navigation Links */}
      <nav className={`relative z-10 flex flex-1 flex-col gap-2 overflow-y-auto side-scrollbar ${isCollapsed ? 'px-3 py-6 items-center' : 'px-5 py-6'}`}>
        {menuItems.map((link) => {
          const locked = link.locked === true;
          const active =
            link.href === APP_ROUTES.home
              ? pathname === link.href
              : pathname === link.href || pathname.startsWith(`${link.href}/`);
          const Icon = getIconForRoute(link.href);

          const content = (
            <>
              <Icon
                className={`transition-transform duration-300 shrink-0 ${isCollapsed ? 'h-5 w-5' : 'h-[1.125rem] w-[1.125rem] opacity-80'} ${
                  active ? "scale-110 shadow-emerald-500/20 opacity-100" : locked ? "" : "group-hover:scale-110"
                }`}
              />
              {!isCollapsed && <span className="truncate whitespace-nowrap leading-none">{link.label}</span>}
              {!isCollapsed && locked && (
                <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
                  <Lock className="h-3 w-3" />
                  {messages.comingSoonLabel}
                </span>
              )}
              {!isCollapsed && active && !locked && (
                <div className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
              )}
            </>
          );

          if (locked) {
            /* This is an intentional UI lock only.
               Admin access is preserved elsewhere; non-admins simply should not reach Infographic from protected navigation right now. */
            return (
              <div
                key={link.href}
                aria-disabled="true"
                title={
                  isCollapsed
                    ? `${link.label} • ${messages.comingSoonLabel}`
                    : undefined
                }
                className={`group flex items-center gap-3 flex-shrink-0 rounded-2xl border border-border/45 bg-background/35 text-foreground-muted ${
                  isCollapsed ? 'justify-center p-3.5 w-12 h-12' : 'px-4 py-3.5 text-[15px]'
                }`}
              >
                {content}
              </div>
            );
          }

          return (
            <Link
              key={link.href}
              href={link.href}
              title={isCollapsed ? link.label : undefined}
              className={`group flex items-center gap-3 flex-shrink-0 rounded-2xl border transition-all duration-300 ${
                active
                  ? "border-emerald-500/20 bg-emerald-500/10 text-accent-strong font-bold shadow-lg"
                  : "border-transparent text-foreground-muted hover:bg-background/55 hover:text-foreground font-medium"
              } ${isCollapsed ? 'justify-center p-3.5 w-12 h-12' : 'px-4 py-3.5 text-[15px]'}`}
            >
              {content}
            </Link>
          );
        })}
      </nav>

      {/* Footer Area */}
      <div className={`relative z-10 shrink-0 border-t border-border/60 ${isCollapsed ? 'p-3 flex flex-col items-center gap-3' : 'p-5 space-y-4'}`}>
        {!isCollapsed ? (
           <>
            <div className="min-w-0 rounded-2xl border border-border/60 bg-background/45 p-4 backdrop-blur-sm">
              {/* Language and theme belong together in the sidebar utility rail so the header can stay focused on navigation and account context.
                  Future shell polish should preserve this grouping instead of moving theme back into the top chrome. */}
              <div className="space-y-4">
                <LocaleToggle
                  variant="compact"
                  value={locale}
                  label={messages.localeLabel || "Locale"}
                  labels={{
                    en: messages.localeEnglish || "EN",
                    ar: messages.localeArabic || "AR",
                  }}
                />
                <div className="h-px bg-white/8" />
                <ThemeToggle
                  variant="compact"
                  value={themeMode}
                  modes={["light", "dark"]}
                  label={messages.themeLabel || "Theme"}
                  labels={{
                    light: messages.themeLight || "Light",
                    dark: messages.themeDark || "Dark",
                    system: messages.themeSystem || "System",
                  }}
                />
              </div>
            </div>
            
            <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-border/55 bg-background/35 p-3.5 backdrop-blur-sm">
                <p className="truncate text-[9px] font-black uppercase tracking-[0.2em] text-foreground-muted">
                  {messages.statusActive ? "Profile Status" : "State"}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex max-w-full items-center justify-center rounded border border-border/55 bg-background/70 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-foreground-muted truncate">
                    {user.role === "admin" ? (messages.roleAdmin || "Admin") : (messages.roleUser || "User")}
                  </span>
                  <span className={`inline-flex items-center justify-center rounded px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider border truncate max-w-full ${
                    user.status === "active"
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      : "bg-red-500/10 text-red-400 border-red-500/20"
                  }`}>
                    {user.status === "active" ? (messages.statusActive || "Active") : (messages.statusSuspended || "Suspended")}
                  </span>
                </div>
            </div>
            
            <div className="pt-2">
              <SignOutButton
                label={messages.logout || "Sign Out"}
                redirectTo={user.role === "admin" ? APP_ROUTES.adminLogin : APP_ROUTES.login}
              />
            </div>
          </>
        ) : (
           <div className="flex flex-col gap-3 w-full items-center">
             <LocaleToggle
               variant="toolbar"
               value={locale}
               label={messages.localeLabel || "Locale"}
               labels={{
                 en: messages.localeEnglish || "EN",
                 ar: messages.localeArabic || "AR",
               }}
             />
             {/* The collapsed rail keeps theme switching available with a single cycle action so the relocated control still fits the narrow sidebar width. */}
             <ThemeToggle
               variant="cycle-icon"
               value={themeMode}
               modes={["light", "dark"]}
               label={messages.themeLabel || "Theme"}
               labels={{
                 light: messages.themeLight || "Light",
                 dark: messages.themeDark || "Dark",
                 system: messages.themeSystem || "System",
               }}
             />
             <div className="my-1 h-px w-full bg-border/80" />
             <SignOutButton
               label={messages.logout || "Sign Out"}
               redirectTo={user.role === "admin" ? APP_ROUTES.adminLogin : APP_ROUTES.login}
               title={messages.logout || "Sign Out"}
               variant="icon"
               icon={<LogOut className="h-5 w-5 ml-0.5" />}
             />
           </div>
        )}
      </div>
    </div>
  );
}
