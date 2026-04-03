import { APP_ROUTES, getModelsForTool } from "@zootopia/shared-config";
import { BrainCircuit } from "lucide-react";

import { AssessmentStudio } from "@/components/assessment/assessment-studio";   
import { getRequestUiContext } from "@/lib/server/request-context";
import {
  getActiveDocumentForOwner,
  listAssessmentGenerationsForUser,
  listDocumentsForUser,
} from "@/lib/server/repository";
import { requireCompletedUser } from "@/lib/server/session";

export default async function AssessmentPage() {
  const [user, uiContext] = await Promise.all([
    requireCompletedUser(APP_ROUTES.assessment),
    getRequestUiContext(),
  ]);
  const [documents, generations, activeDocument] = await Promise.all([
    listDocumentsForUser(user.uid),
    listAssessmentGenerationsForUser(user.uid),
    getActiveDocumentForOwner(user.uid),
  ]);

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[2.5rem] border border-white/20 bg-white/60 p-6 shadow-sm backdrop-blur-xl dark:border-white/5 dark:bg-zinc-950/40 sm:p-8 lg:p-10">
        <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-violet-500/20 blur-3xl" />
        
        <div className="relative z-10">
          <div className="mb-4 flex items-center gap-3">
            <span className="inline-flex items-center rounded-full bg-violet-100 dark:bg-violet-900/30 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-400 border border-violet-200 dark:border-violet-800/50">
              <BrainCircuit className="h-3.5 w-3.5" />
              {uiContext.messages.navAssessment}
            </span>
          </div>
          
          <h1 className="page-title max-w-3xl text-balance text-zinc-900 dark:text-white">
            {uiContext.messages.assessmentTitle}
          </h1>
          
        </div>
      </section>

      <AssessmentStudio
        locale={uiContext.locale}
        messages={uiContext.messages}
        models={getModelsForTool("assessment")}
        initialDocuments={documents}
        initialGenerations={generations}
        initialActiveDocumentId={activeDocument?.id ?? null}
      />
    </div>
  );
}
