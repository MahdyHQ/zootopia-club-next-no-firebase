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
  Settings,
  ShieldCheck,
  Users,
  Activity,
  LogOut,
  Moon,
  Globe
} from "lucide-react";

import type { AppMessages } from "@/lib/messages";

import { SignOutButton } from "@/components/auth/sign-out-button";
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

  const getIconForRoute = (href: string) => {
    switch (href) {
      case APP_ROUTES.home:
        return Home;
      case APP_ROUTES.upload:
        return UploadCloud;
      case APP_ROUTES.assessment:
        return FileText;
      case APP_ROUTES.infographic:
        return PieChart;
      case APP_ROUTES.settings:
        return Settings;
      case APP_ROUTES.admin:
        return ShieldCheck;
      case APP_ROUTES.adminUsers:
        return Users;
      default:
        return Activity;
    }
  };

  const menuItems = [
    ...(canAccessUserWorkspace
      ? [
          { href: APP_ROUTES.upload, label: messages.navUpload || "Upload Data" },
          { href: APP_ROUTES.home, label: messages.navHome || "Platform Home" },
          { href: APP_ROUTES.assessment, label: messages.navAssessment || "AI Assessment" },
          { href: APP_ROUTES.infographic, label: messages.navInfographic || "Generate Visual" },
        ]
      : []),
    { href: APP_ROUTES.settings, label: messages.navSettings || "Settings" },
    ...(user.role === "admin"
      ? [
          { href: APP_ROUTES.admin, label: messages.navAdmin || "Admin Portal" },
          { href: APP_ROUTES.adminUsers, label: messages.navAdminUsers || "User Directory" },
        ]
      : []),
  ];

  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-[2.5rem] border border-white/5 bg-background-elevated/40 backdrop-blur-2xl shadow-2xl transition-all duration-300 w-full text-foreground max-h-full">
      {/* Decorative gradient blur - Emerald glow mapped to background palette */}
      <div className="absolute top-0 right-0 -mr-20 -mt-20 h-64 w-64 rounded-full bg-emerald-500/10 blur-[100px] pointer-events-none" />

      {/* Header / Branding */}
      <div className={`relative z-10 border-b border-white/5 ${isCollapsed ? 'p-5 flex items-center justify-center' : 'p-6 pb-6'} shrink-0`}>
        {!isCollapsed && (
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-400/80 mb-2 truncate">
            {messages.tagline || "Powered by AI"}
          </p>
        )}
        
        <div className={`flex ${isCollapsed ? 'justify-center mt-2' : 'justify-start'}`}>
           <h1 className={`font-display font-black tracking-tight text-white transition-all duration-300 truncate w-full ${isCollapsed ? 'text-2xl text-center' : 'text-3xl'}`}>
             {isCollapsed ? "ZC" : (messages.appName || "ZOOTOPIA")}
           </h1>
        </div>

        {!isCollapsed && (
          <div className="mt-6 rounded-2xl bg-white/5 p-4 border border-white/5 backdrop-blur-md shadow-sm overflow-hidden flex flex-col gap-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-500 truncate">
              {messages.signedInAs || "Signed in as"}
            </p>
            <p className="text-sm font-bold text-white truncate w-full" title={user.displayName || user.email || "User"}>
              {user.displayName || user.email?.split('@')[0] || "User"}
            </p>
          </div>
        )}
      </div>

      {/* Navigation Links */}
      <nav className={`relative z-10 flex flex-1 flex-col gap-2 overflow-y-auto side-scrollbar ${isCollapsed ? 'px-3 py-6 items-center' : 'px-5 py-6'}`}>
        {menuItems.map((link) => {
          const active =
            link.href === APP_ROUTES.home
              ? pathname === link.href
              : pathname === link.href || pathname.startsWith(`${link.href}/`);
          const Icon = getIconForRoute(link.href);

          return (
            <Link
              key={link.href}
              href={link.href}
              title={isCollapsed ? link.label : undefined}
              className={`group flex items-center gap-3 flex-shrink-0 rounded-2xl border transition-all duration-300 ${
                active
                  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400 font-bold shadow-lg shadow-emerald-500/5"
                  : "border-transparent text-zinc-400 hover:bg-white/5 hover:text-white font-medium"
              } ${isCollapsed ? 'justify-center p-3.5 w-12 h-12' : 'px-4 py-3.5 text-[15px]'}`}
            >
              <Icon
                className={`transition-transform duration-300 shrink-0 ${isCollapsed ? 'h-5 w-5' : 'h-[1.125rem] w-[1.125rem] opacity-80'} ${
                  active ? "scale-110 shadow-emerald-500/20 opacity-100" : "group-hover:scale-110"
                }`}
              />
              {!isCollapsed && <span className="truncate whitespace-nowrap leading-none">{link.label}</span>}
              {!isCollapsed && active && (
                <div className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer Area */}
      <div className={`relative z-10 shrink-0 border-t border-white/5 ${isCollapsed ? 'p-3 flex flex-col items-center gap-3' : 'p-5 space-y-4'}`}>
        {!isCollapsed ? (
           <>
            <div className="grid grid-cols-2 gap-3 min-w-0">
              <ThemeToggle
                value={themeMode}
                label={messages.themeLabel || "Theme"}
                labels={{
                  light: messages.themeLight || "Light",
                  dark: messages.themeDark || "Dark",
                  system: "Auto",
                }}
              />
              <LocaleToggle
                value={locale}
                label={messages.localeLabel || "Locale"}
                labels={{
                  en: messages.localeEnglish || "EN",
                  ar: messages.localeArabic || "AR",
                }}
              />
            </div>
            
            <div className="flex flex-col gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-3.5 backdrop-blur-sm min-w-0">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500 truncate">
                  {messages.statusActive ? "Profile Status" : "State"}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center justify-center rounded px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-white/10 text-zinc-300 truncate max-w-full">
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
             <button title="Change Theme" className="p-3.5 rounded-2xl text-zinc-400 hover:text-white hover:bg-white/5 transition-colors border border-transparent w-full flex justify-center"><Moon className="h-5 w-5 opacity-80" /></button>
             <button title="Change Locale" className="p-3.5 rounded-2xl text-zinc-400 hover:text-white hover:bg-white/5 transition-colors border border-transparent w-full flex justify-center"><Globe className="h-5 w-5 opacity-80" /></button>
             <div className="w-full h-px bg-white/10 my-1" />
             <button title="Sign Out" className="p-3.5 rounded-2xl text-red-400/80 hover:text-red-400 hover:bg-red-500/10 transition-colors border border-transparent hover:border-red-500/20 w-full flex justify-center"><LogOut className="h-5 w-5 ml-0.5" /></button>
           </div>
        )}
      </div>
    </div>
  );
}
