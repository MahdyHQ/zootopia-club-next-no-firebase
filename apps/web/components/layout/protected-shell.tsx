"use client";

import { useState, useEffect } from "react";
import { Menu, Search, Bell, Sparkles, CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import type { Locale, SessionUser, ThemeMode } from "@zootopia/shared-types";
import type { AppMessages } from "@/lib/messages";
import { ShellNav } from "./shell-nav";
import { usePathname } from "next/navigation";

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

  const handleMobileOverlayClick = () => setIsSidebarOpen(false);
  const isRtl = locale === 'ar';
  
  const sidebarWidth = isDesktopCollapsed ? "w-[88px]" : "w-[300px]";
  const mobileTranslate = isSidebarOpen ? "translate-x-0" : (isRtl ? "translate-x-full" : "-translate-x-full");

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
        <header className="flex h-[4.5rem] shrink-0 items-center justify-between px-6 lg:px-10 z-30 transition-all border-b border-white/5 bg-background/20 backdrop-blur-md">
          <div className="flex items-center gap-4 min-w-0">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-background-elevated/50 border border-white/5 text-foreground hover:bg-background-strong hover:border-accent hover:text-accent lg:hidden transition-all shadow-sm focus:outline-none"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="hidden lg:flex items-center gap-2 h-10 px-4 shrink-0 rounded-xl bg-white/5 border border-white/5 shadow-sm text-xs font-black uppercase tracking-widest text-foreground">
               <Sparkles className="h-4 w-4 text-emerald-400" />
               <span>{messages.appName} <span className="opacity-40 font-normal mx-1">/</span> Workspace</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
             <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/5 bg-white/5 text-foreground-muted hover:text-foreground hover:border-white/20 transition-all cursor-pointer shadow-sm">
               <Search className="h-4.5 w-4.5" />
             </div>
             <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/5 bg-white/5 text-foreground-muted hover:text-foreground hover:border-white/20 transition-all cursor-pointer shadow-sm relative">
               <Bell className="h-4.5 w-4.5" />
               <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
             </div>
             
             <div className="h-8 w-px bg-white/10 hidden sm:block mx-1" />
             
             <div className="flex items-center gap-3 px-2 sm:px-3 py-1.5 rounded-2xl bg-white/5 border border-white/5 shadow-sm cursor-pointer hover:bg-white/10 transition-colors max-w-[120px] sm:max-w-[200px]">
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
        <main className="flex-1 overflow-y-auto overflow-x-hidden global-scrollbar p-4 sm:p-6 lg:p-10 pb-20 relative">
          <div className="mx-auto w-full max-w-[1400px] animate-in fade-in duration-700 h-full">
            {children}
          </div>
        </main>

        {/* Bottom Footer */}
        <footer className="shrink-0 flex items-center justify-between border-t border-white/5 bg-background/20 backdrop-blur-md px-6 py-4 text-[10px] font-semibold text-foreground-muted z-30 uppercase tracking-widest hidden sm:flex">
          <p className="tracking-[0.2em] opacity-60">© 2026 {messages.appName}.</p>
          <div className="flex gap-6 opacity-60">
             <span className="hover:text-foreground transition-colors cursor-pointer">Privacy</span>
             <span className="hover:text-foreground transition-colors cursor-pointer">Terms</span>
             <span className="hover:text-foreground transition-colors cursor-pointer flex items-center gap-1.5">
               <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
               Status
             </span>
          </div>
        </footer>

      </div>
    </div>
  );
}