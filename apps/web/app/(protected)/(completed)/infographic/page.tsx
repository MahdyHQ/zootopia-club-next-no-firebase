import { APP_ROUTES, getModelsForTool } from "@zootopia/shared-config";
import { PieChart, Sparkles } from "lucide-react";

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
