import { APP_ROUTES, getModelsForTool } from "@zootopia/shared-config";
import { PieChart } from "lucide-react";
import Link from "next/link";

import { InfographicStudio } from "@/components/infographic/infographic-studio";
import { getRequestUiContext } from "@/lib/server/request-context";
import {
  listDocumentsForUser,
  listInfographicGenerationsForUser,
} from "@/lib/server/repository";
import { requireCompletedUser } from "@/lib/server/session";

export default async function InfographicPage() {
  const [user, uiContext] = await Promise.all([
    requireCompletedUser(APP_ROUTES.infographic),
    getRequestUiContext(),
  ]);

  if (user.role !== "admin") {
    return (
      <div className="space-y-6">
        <section className="relative overflow-hidden rounded-[2.5rem] border border-amber-500/15 bg-[linear-gradient(145deg,rgba(255,255,255,0.76),rgba(255,247,237,0.66))] p-8 shadow-sm backdrop-blur-xl dark:bg-[linear-gradient(145deg,rgba(14,9,4,0.72),rgba(18,11,3,0.62))]">
          <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-amber-500/20 blur-3xl" />

          <div className="relative z-10 max-w-3xl">
            {/* This is an intentional non-admin UI lock only.
                Admin access stays intact, and future agents should not mistake this placeholder for the real authorization boundary. */}
            <span className="inline-flex items-center rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-200">
              <PieChart className="mr-1.5 h-3.5 w-3.5" />
              {uiContext.messages.comingSoonLabel}
            </span>

            <h1 className="mt-5 font-[family-name:var(--font-display)] text-4xl font-bold tracking-tight text-zinc-900 dark:text-white">
              {uiContext.messages.infographicLockedTitle}
            </h1>
            <p className="mt-4 text-base leading-8 text-zinc-700 dark:text-zinc-300">
              {uiContext.messages.infographicLockedBody}
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href={APP_ROUTES.assessment}
                className="inline-flex items-center rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(16,185,129,0.24)] transition-all hover:-translate-y-0.5"
              >
                {uiContext.messages.infographicLockedPrimaryAction}
              </Link>
              <Link
                href={APP_ROUTES.upload}
                className="inline-flex items-center rounded-xl border border-border-strong bg-background-strong px-5 py-3 text-sm font-semibold text-foreground transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:text-accent"
              >
                {uiContext.messages.infographicLockedSecondaryAction}
              </Link>
            </div>
          </div>
        </section>
      </div>
    );
  }

  const [documents, generations] = await Promise.all([
    listDocumentsForUser(user.uid),
    listInfographicGenerationsForUser(user.uid),
  ]);

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[2.5rem] border border-white/20 dark:border-white/5 bg-white/60 dark:bg-zinc-950/40 backdrop-blur-xl p-8 md:p-12 shadow-sm">
        <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-amber-500/20 blur-3xl" />
        
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/30 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50">
              <PieChart className="mr-1.5 h-3.5 w-3.5" />
              {uiContext.messages.navInfographic}
            </span>
          </div>
          
          <h1 className="font-[family-name:var(--font-display)] text-5xl font-bold tracking-tight text-zinc-900 dark:text-white">
            {uiContext.messages.infographicTitle}
          </h1>
          
        </div>
      </section>

      <InfographicStudio
        messages={uiContext.messages}
        models={getModelsForTool("infographic")}
        initialDocuments={documents}
        initialGenerations={generations}
      />
    </div>
  );
}
