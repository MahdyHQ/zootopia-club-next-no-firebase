import { APP_ROUTES, getModelsForTool } from "@zootopia/shared-config";
import { BrainCircuit, Sparkles } from "lucide-react";

import { AssessmentStudio } from "@/components/assessment/assessment-studio";   
import { getRequestUiContext } from "@/lib/server/request-context";
import {
  listAssessmentGenerationsForUser,
  listDocumentsForUser,
} from "@/lib/server/repository";
import { requireCompletedUser } from "@/lib/server/session";

export default async function AssessmentPage() {
  const [user, uiContext] = await Promise.all([
    requireCompletedUser(APP_ROUTES.assessment),
    getRequestUiContext(),
  ]);
  const [documents, generations] = await Promise.all([
    listDocumentsForUser(user.uid),
    listAssessmentGenerationsForUser(user.uid),
  ]);

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[2.5rem] border border-white/20 dark:border-white/5 bg-white/60 dark:bg-zinc-950/40 backdrop-blur-xl p-8 md:p-12 shadow-sm">
        <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-violet-500/20 blur-3xl" />
        
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <span className="inline-flex items-center rounded-full bg-violet-100 dark:bg-violet-900/30 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-400 border border-violet-200 dark:border-violet-800/50">
              <BrainCircuit className="mr-1.5 h-3.5 w-3.5" />
              {uiContext.messages.navAssessment}
            </span>
          </div>
          
          <h1 className="font-[family-name:var(--font-display)] text-5xl font-bold tracking-tight text-zinc-900 dark:text-white">
            {uiContext.messages.assessmentTitle}
          </h1>
          
        </div>
      </section>

      <AssessmentStudio
        messages={uiContext.messages}
        models={getModelsForTool("assessment")}
        initialDocuments={documents}
        initialGenerations={generations}
      />
    </div>
  );
}
