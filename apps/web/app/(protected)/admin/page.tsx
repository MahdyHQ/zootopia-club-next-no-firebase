import Link from "next/link";
import { Users, FileText, BrainCircuit, Activity, ChevronRight, ShieldCheck, User, Shield, TerminalSquare, Settings2, Server } from "lucide-react";

import { getRequestUiContext } from "@/lib/server/request-context";
import { getAdminOverviewData, listUsers } from "@/lib/server/repository";
import { getRuntimeFlags } from "@/lib/server/runtime";
import { Button } from "@/components/ui/button";

export default async function AdminPage() {
  const [uiContext, overview, users] = await Promise.all([
    getRequestUiContext(),
    getAdminOverviewData(),
    listUsers(),
  ]);
  const runtimeFlags = getRuntimeFlags();

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <section className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-white/40 dark:bg-zinc-950/40 backdrop-blur-2xl p-8 md:p-12 shadow-2xl shadow-emerald-900/5">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-teal-900/10 pointer-events-none" />
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-emerald-500/10 dark:bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
              <ShieldCheck className="mr-2 h-4 w-4" />
              {uiContext.messages.navAdmin}
            </span>
          </div>
          <h1 className="font-[family-name:var(--font-display)] text-4xl md:text-5xl font-black tracking-tight text-zinc-900 dark:text-white">
            {uiContext.messages.adminTitle}
          </h1>
          
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: uiContext.messages.metricUsers, value: overview.totalUsers, icon: Users, color: "text-blue-500", bg: "bg-blue-500/10" },
          { label: uiContext.messages.metricActiveUsers, value: overview.activeUsers, icon: Activity, color: "text-emerald-500", bg: "bg-emerald-500/10" },
          { label: uiContext.messages.metricDocuments, value: overview.totalDocuments, icon: FileText, color: "text-amber-500", bg: "bg-amber-500/10" },
          { label: uiContext.messages.metricAssessments, value: overview.totalAssessmentGenerations, icon: BrainCircuit, color: "text-purple-500", bg: "bg-purple-500/10" },
        ].map((stat, i) => (
          <div key={i} className="group relative overflow-hidden rounded-[2rem] border border-white/20 dark:border-white/5 bg-white/60 dark:bg-zinc-900/40 backdrop-blur-xl p-6 shadow-sm transition-all hover:bg-white/80 dark:hover:bg-zinc-900/60 hover:shadow-md">
            <div className="flex items-center justify-between">
              <div className={`p-3 rounded-2xl ${stat.bg}`}>
                <stat.icon className={`h-6 w-6 ${stat.color}`} />
              </div>
              <Activity className="h-4 w-4 text-zinc-300 dark:text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="mt-6">
              <div className="text-4xl font-black tracking-tighter text-zinc-900 dark:text-white">
                {stat.value}
              </div>
              <div className="mt-1 text-sm font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                {stat.label}
              </div>
            </div>
          </div>
        ))}
      </section>

      <section className="grid gap-8 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="relative overflow-hidden rounded-[2.5rem] border border-white/20 dark:border-white/5 bg-white/60 dark:bg-zinc-950/40 backdrop-blur-2xl p-6 sm:p-8 flex flex-col hide-scrollbar">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-zinc-900 dark:text-white flex items-center gap-2">
                <Users className="h-6 w-6 text-emerald-500" />
                {uiContext.messages.adminUsersTitle}
              </h2>
              <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mt-1">
                {uiContext.messages.adminUsersSubtitle}
              </p>
            </div>
            <Button asChild variant="outline" className="rounded-full bg-white/50 dark:bg-zinc-900/50 backdrop-blur border-white/20 dark:border-white/10 hover:bg-zinc-100 dark:hover:bg-zinc-800">
              <Link href="/admin/users" className="group">
                {uiContext.messages.navAdminUsers}
                <ChevronRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </Button>
          </div>

          <div className="space-y-3">
            {users.slice(0, 5).map((user) => (
              <div
                key={user.uid}
                className="group flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-[1.5rem] border border-transparent bg-white/50 dark:bg-zinc-900/30 p-4 transition-all hover:border-emerald-500/20 hover:bg-white/80 dark:hover:bg-zinc-900/50 hover:shadow-sm"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 font-bold shadow-inner">
                    <User className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-zinc-900 dark:text-zinc-100">
                      {user.fullName || user.displayName || user.email || user.uid}
                    </h3>
                    <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400 font-mono tracking-tight">
                      {user.email || user.uid}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wider ${
                    user.role === "admin" 
                      ? "bg-purple-100 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400 border border-purple-200 dark:border-purple-500/20" 
                      : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700"
                  }`}>
                    {user.role === "admin" && <Shield className="mr-1 h-3 w-3" />}
                    {user.role === "admin" ? uiContext.messages.roleAdmin : uiContext.messages.roleUser}
                  </span>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wider ${
                    user.status === "active"
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20"
                      : "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400 border border-red-200 dark:border-red-500/20"
                  }`}>
                    <div className={`mr-1.5 h-1.5 w-1.5 rounded-full ${user.status === "active" ? "bg-emerald-500" : "bg-red-500"}`} />
                    {user.status === "active" ? uiContext.messages.statusActive : uiContext.messages.statusSuspended}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[2.5rem] border border-white/20 dark:border-white/5 bg-white/60 dark:bg-zinc-950/40 backdrop-blur-2xl p-6 sm:p-8">
          <div className="absolute top-0 right-0 p-6 opacity-10">
            <Server className="h-32 w-32" />
          </div>
          
          <div className="relative z-10 flex flex-col h-full">
            <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-zinc-900 dark:text-white flex items-center gap-2 mb-2">
              <TerminalSquare className="h-6 w-6 text-zinc-500" />
              {uiContext.messages.runtimeStatusTitle}
            </h2>
            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-8">
              System configuration and external service bindings
            </p>

            <div className="flex-1 space-y-4">
              {[
                { label: "Firebase Admin", status: runtimeFlags.firebaseAdmin },
                { label: "Google AI", status: runtimeFlags.googleAi },
                { label: "Qwen Models", status: runtimeFlags.qwen },
                { label: "Datalab Formatting", status: runtimeFlags.datalab }
              ].map((service, i) => (
                <div key={i} className="flex items-center justify-between rounded-2xl border border-white/40 dark:border-white/5 bg-white/40 dark:bg-zinc-900/50 p-4 backdrop-blur transition-all hover:bg-white/60 dark:hover:bg-zinc-800/80">
                  <div className="flex items-center gap-3">
                    <Settings2 className="h-5 w-5 text-zinc-400 dark:text-zinc-500" />
                    <span className="font-bold text-zinc-700 dark:text-zinc-300">
                      {service.label}
                    </span>
                  </div>
                  {service.status ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 dark:bg-emerald-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
                      <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                      {uiContext.messages.statusReady}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 dark:bg-amber-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-400">
                      <div className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                      {uiContext.messages.statusFallback ?? "Fallback/Pending"}
                    </span>
                  )}
                </div>
              ))}
            </div>
            
            <div className="mt-8 pt-6 border-t border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center justify-between text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">
                <span>Environment</span>
                <span className="font-mono text-zinc-900 dark:text-white">Production 2026</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
