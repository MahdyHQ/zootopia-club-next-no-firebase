import { APP_ROUTES } from "@zootopia/shared-config";
import Link from "next/link";
import { UploadCloud, FileText, BrainCircuit, PieChart, ArrowRight, Zap } from "lucide-react";

import { UploadWorkspace } from "@/components/upload/upload-workspace";
import { getRequestUiContext } from "@/lib/server/request-context";
import { listDocumentsForUser } from "@/lib/server/repository";
import { requireCompletedUser } from "@/lib/server/session";

export default async function UploadPage() {
  const [user, uiContext] = await Promise.all([
    requireCompletedUser(APP_ROUTES.upload),
    getRequestUiContext(),
  ]);
  const documents = await listDocumentsForUser(user.uid);
  const canAccessInfographic = user.role === "admin";

  return (
    <div className="space-y-12 pb-8 min-w-0">
      {/* 1. Hero Upload Section - Dark Premium Glow Design */}
      <section className="relative flex flex-col items-center justify-center min-h-[65vh] w-full rounded-[2.5rem] bg-background-elevated/40 border border-white/5 backdrop-blur-2xl shadow-2xl overflow-hidden p-6 sm:p-12 lg:p-20 min-w-0">
        <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 50% 0%, #1e4d50 0%, transparent 60%)' }} />
        <div className="absolute inset-0 mix-blend-overlay opacity-10 pointer-events-none" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\"60\" height=\"60\" viewBox=\"0 0 60 60\" xmlns=\"http://www.w3.org/2000/svg\"%3E%3Cg fill=\"none\" fill-rule=\"evenodd\"%3E%3Cg fill=\"%239C92AC\" fill-opacity=\"0.15\"%3E%3Cpath d=\"M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\"/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }} />
        
        <div className="relative z-10 w-full min-w-0 flex flex-col items-center text-center">
          <div className="flex items-center gap-2 mb-10 opacity-80">
            <UploadCloud className="h-5 w-5 text-emerald-400" />
            <h2 className="text-sm font-bold uppercase tracking-[0.25em] text-zinc-300">
              {uiContext.messages.navUpload?.toUpperCase() || 'UPLOAD RESEARCH DATA'}
            </h2>
          </div>

          <div className="w-full min-w-0 max-w-[100vw] overflow-x-hidden">
            <UploadWorkspace
              messages={uiContext.messages}
              initialDocuments={documents}
              canAccessInfographic={canAccessInfographic}
            />
          </div>
        </div>
      </section>

      {/* 2. Secondary Metrics & Quick Links (Demoted) */}
      <section className="relative px-2">

        <div className="flex items-center gap-3 mb-6">
          <Zap className="h-6 w-6 text-zinc-400" />
          <h2 className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight text-white">
            {uiContext.messages.uploadPageQuickActionsTitle}
          </h2>
        </div>
        

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 min-w-0">
          <Link href={APP_ROUTES.assessment} className="group relative overflow-hidden rounded-3xl border border-white/5 bg-white/5 backdrop-blur-sm p-6 transition-all hover:bg-white/10 hover:shadow-lg hover:shadow-violet-500/10 hover:border-violet-500/30">
            <div className="absolute top-0 right-0 p-6 opacity-0 translate-x-4 transition-all group-hover:opacity-100 group-hover:translate-x-0">
              <ArrowRight className="h-5 w-5 text-violet-400" />
            </div>
            <BrainCircuit className="h-8 w-8 text-violet-400 mb-4" />
            <h3 className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight text-white group-hover:text-violet-400 transition-colors truncate">
              {uiContext.messages.assessmentTitle}
            </h3>
          </Link>

          {canAccessInfographic ? (
            <Link href={APP_ROUTES.infographic} className="group relative overflow-hidden rounded-3xl border border-white/5 bg-white/5 backdrop-blur-sm p-6 transition-all hover:bg-white/10 hover:shadow-lg hover:shadow-amber-500/10 hover:border-amber-500/30">
              <div className="absolute top-0 right-0 p-6 opacity-0 translate-x-4 transition-all group-hover:opacity-100 group-hover:translate-x-0">
                <ArrowRight className="h-5 w-5 text-amber-400" />
              </div>
              <PieChart className="h-8 w-8 text-amber-400 mb-4" />
              <h3 className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight text-white group-hover:text-amber-400 transition-colors truncate">
                {uiContext.messages.infographicTitle}
              </h3>
            </Link>
          ) : (
            <article className="relative overflow-hidden rounded-3xl border border-amber-500/10 bg-white/[0.04] p-6 backdrop-blur-sm">
              <span className="inline-flex items-center rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300">
                {uiContext.messages.comingSoonLabel}
              </span>
              <PieChart className="mt-4 h-8 w-8 text-amber-400/90 mb-4" />
              <h3 className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight text-white truncate">
                {uiContext.messages.infographicTitle}
              </h3>
              <p className="mt-3 text-sm leading-6 text-zinc-300">
                {uiContext.messages.infographicLockedBody}
              </p>
            </article>
          )}

          <Link href={APP_ROUTES.home} className="group relative overflow-hidden rounded-3xl border border-white/5 bg-white/5 backdrop-blur-sm p-6 transition-all hover:bg-white/10 hover:shadow-lg hover:shadow-emerald-500/10 hover:border-emerald-500/30">
            <div className="absolute top-0 right-0 p-6 opacity-0 translate-x-4 transition-all group-hover:opacity-100 group-hover:translate-x-0">
              <ArrowRight className="h-5 w-5 text-emerald-400" />
            </div>
            <FileText className="h-8 w-8 text-zinc-400 group-hover:text-emerald-400 mb-4 transition-colors" />
            <h3 className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight text-white group-hover:text-emerald-400 transition-colors truncate">
              {uiContext.messages.homeTitle}
            </h3>
          </Link>
        </div>
      </section>
    </div>
  );
}
