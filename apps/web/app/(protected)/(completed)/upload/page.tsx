import { APP_ROUTES } from "@zootopia/shared-config";
import Link from "next/link";
import { UploadCloud, FileText, BrainCircuit, PieChart, ArrowRight, Zap } from "lucide-react";

import { UploadWorkspace } from "@/components/upload/upload-workspace";
import { getRequestUiContext } from "@/lib/server/request-context";
import { listDocumentsForUser } from "@/lib/server/repository";
import { requireCompletedUser } from "@/lib/server/session";

const uploadQuickActionCardClassName =
  "group relative overflow-hidden rounded-3xl border border-white/55 bg-[linear-gradient(145deg,rgba(255,255,255,0.58),rgba(255,248,242,0.26))] p-6 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.84),0_24px_54px_rgba(148,163,184,0.14)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-white/70 hover:bg-[linear-gradient(145deg,rgba(255,255,255,0.68),rgba(247,250,252,0.34))] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_28px_64px_rgba(148,163,184,0.18)] dark:border-white/10 dark:bg-[linear-gradient(145deg,rgba(6,18,31,0.46),rgba(2,10,20,0.22))] dark:text-white dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_44px_rgba(2,6,23,0.2)] dark:hover:border-white/16 dark:hover:bg-[linear-gradient(145deg,rgba(8,24,39,0.56),rgba(3,12,22,0.26))] dark:hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_24px_56px_rgba(2,6,23,0.28)]";

export default async function UploadPage() {
  const [user, uiContext] = await Promise.all([
    requireCompletedUser(APP_ROUTES.upload),
    getRequestUiContext(),
  ]);
  let documents = [] as Awaited<ReturnType<typeof listDocumentsForUser>>;
  let documentsDataDegraded = false;

  try {
    documents = await listDocumentsForUser(user.uid);
  } catch (error) {
    documentsDataDegraded = true;
    console.warn("[upload-page] failed to load documents; rendering fallback list", {
      uid: user.uid,
      error: error instanceof Error ? error.name : "UNKNOWN",
    });
  }

  const canAccessInfographic = user.role === "admin";

  return (
    <div className="min-w-0 space-y-12 pb-8">
      {documentsDataDegraded ? (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-700 dark:text-amber-200">
          Recent documents are temporarily unavailable. Upload actions are still available.
        </div>
      ) : null}

      <section className="relative flex min-w-0 min-h-[65vh] w-full flex-col items-center justify-center overflow-hidden p-4 sm:p-8 lg:p-14">

        <div className="relative z-10 flex w-full min-w-0 flex-col items-center text-center">
          <div className="mb-8 flex items-center gap-2 rounded-full border border-white/60 bg-white/45 px-4 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.88),0_12px_28px_rgba(148,163,184,0.12)] backdrop-blur-xl sm:mb-10 dark:border-white/10 dark:bg-white/[0.04] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
            <UploadCloud className="h-5 w-5 text-accent-strong dark:text-emerald-400" />
            <h2 className="text-sm font-bold uppercase tracking-[0.25em] text-foreground/80 dark:text-zinc-200">
              {uiContext.messages.navUpload?.toUpperCase() || "UPLOAD RESEARCH DATA"}
            </h2>
          </div>

          {/* UploadWorkspace owns the single translucent intake shell for this route.
              Keep the page wrapper neutral so layered ghost slabs do not reappear behind Document intake. */}
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
        <div className="mb-6 flex items-center gap-3">
          <Zap className="h-6 w-6 text-foreground-muted dark:text-zinc-300/80" />
          <h2 className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight text-foreground dark:text-white">
            {uiContext.messages.uploadPageQuickActionsTitle}
          </h2>
        </div>

        <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            href={APP_ROUTES.assessment}
            className={`${uploadQuickActionCardClassName} hover:border-violet-400/30 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_24px_56px_rgba(76,29,149,0.18)]`}
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(167,139,250,0.16),transparent_38%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            <div className="absolute top-0 right-0 p-6 opacity-0 translate-x-4 transition-all group-hover:opacity-100 group-hover:translate-x-0">
              <ArrowRight className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            </div>
            <BrainCircuit className="mb-4 h-8 w-8 text-violet-600 dark:text-violet-400" />
            <h3 className="truncate font-[family-name:var(--font-display)] text-xl font-bold tracking-tight text-foreground transition-colors group-hover:text-violet-600 dark:text-white dark:group-hover:text-violet-400">
              {uiContext.messages.assessmentTitle}
            </h3>
          </Link>

          {canAccessInfographic ? (
            <Link
              href={APP_ROUTES.infographic}
              className={`${uploadQuickActionCardClassName} hover:border-amber-300/30 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_24px_56px_rgba(180,83,9,0.16)]`}
            >
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.14),transparent_38%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <div className="absolute top-0 right-0 p-6 opacity-0 translate-x-4 transition-all group-hover:opacity-100 group-hover:translate-x-0">
                <ArrowRight className="h-5 w-5 text-amber-500 dark:text-amber-400" />
              </div>
              <PieChart className="mb-4 h-8 w-8 text-amber-500 dark:text-amber-400" />
              <h3 className="truncate font-[family-name:var(--font-display)] text-xl font-bold tracking-tight text-foreground transition-colors group-hover:text-amber-600 dark:text-white dark:group-hover:text-amber-300">
                {uiContext.messages.infographicTitle}
              </h3>
            </Link>
          ) : (
            <article className={uploadQuickActionCardClassName}>
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.12),transparent_38%)] opacity-90" />
              <span className="inline-flex items-center rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">
                {uiContext.messages.comingSoonLabel}
              </span>
              <PieChart className="mb-4 mt-4 h-8 w-8 text-amber-500/90 dark:text-amber-400/90" />
              <h3 className="truncate font-[family-name:var(--font-display)] text-xl font-bold tracking-tight text-foreground dark:text-white">
                {uiContext.messages.infographicTitle}
              </h3>
              <p className="mt-3 text-sm leading-6 text-foreground-muted dark:text-zinc-300">
                {uiContext.messages.infographicLockedBody}
              </p>
            </article>
          )}

          <Link
            href={APP_ROUTES.home}
            className={`${uploadQuickActionCardClassName} hover:border-emerald-400/30 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_24px_56px_rgba(5,150,105,0.16)]`}
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.16),transparent_38%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            <div className="absolute top-0 right-0 p-6 opacity-0 translate-x-4 transition-all group-hover:opacity-100 group-hover:translate-x-0">
              <ArrowRight className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <FileText className="mb-4 h-8 w-8 text-foreground-muted transition-colors group-hover:text-emerald-600 dark:text-zinc-400 dark:group-hover:text-emerald-400" />
            <h3 className="truncate font-[family-name:var(--font-display)] text-xl font-bold tracking-tight text-foreground transition-colors group-hover:text-emerald-600 dark:text-white dark:group-hover:text-emerald-300">
              {uiContext.messages.homeTitle}
            </h3>
          </Link>
        </div>
      </section>
    </div>
  );
}
