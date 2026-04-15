import { APP_ROUTES, getModelsForTool } from "@zootopia/shared-config";
import type { AssessmentDailyCreditsSummary } from "@zootopia/shared-types";
import { BrainCircuit } from "lucide-react";

import { AssessmentStudio } from "@/components/assessment/assessment-studio";   
import { resolveDefaultModelIdForTool } from "@/lib/server/ai/default-models";
import { getAssessmentPromptAccessStateForUser } from "@/lib/server/assessment-prompt-lock";
import { getRequestUiContext } from "@/lib/server/request-context";
import {
  getActiveDocumentForOwner,
  getAssessmentDailyCreditsSummaryForUser,
  listAssessmentGenerationsForUser,
  listDocumentsForUser,
} from "@/lib/server/repository";
import { requireCompletedUser } from "@/lib/server/session";

function buildFallbackAssessmentDailyCreditsSummary(
  role: "admin" | "user",
): AssessmentDailyCreditsSummary {
  const now = new Date();
  const dayKey = now.toISOString().slice(0, 10);

  return {
    applies: role !== "admin",
    isAdminExempt: role === "admin",
    assessmentAccess: "enabled",
    dayKey,
    dailyDefaultLimit: 0,
    dailyLimit: 0,
    dailyLimitSource: "default",
    usedCount: 0,
    dailyRemainingCount: null,
    manualCreditsAvailable: 0,
    grantCreditsAvailable: 0,
    extraCreditsAvailable: 0,
    activeGrantCount: 0,
    totalRemainingCount: null,
    remainingCount: null,
    resetsAt: now.toISOString(),
  };
}

export default async function AssessmentPage() {
  const [user, uiContext] = await Promise.all([
    requireCompletedUser(APP_ROUTES.assessment),
    getRequestUiContext(),
  ]);
  const promptAccess = await getAssessmentPromptAccessStateForUser({
    uid: user.uid,
    role: user.role,
  });

  let documents = [] as Awaited<ReturnType<typeof listDocumentsForUser>>;
  let generations = [] as Awaited<ReturnType<typeof listAssessmentGenerationsForUser>>;
  let activeDocument: Awaited<ReturnType<typeof listDocumentsForUser>>[number] | null = null;
  let credits = buildFallbackAssessmentDailyCreditsSummary(user.role);
  let assessmentDataDegraded = false;

  try {
    [documents, generations, activeDocument, credits] = await Promise.all([
      listDocumentsForUser(user.uid),
      listAssessmentGenerationsForUser(user.uid),
      getActiveDocumentForOwner(user.uid),
      getAssessmentDailyCreditsSummaryForUser({
        uid: user.uid,
        role: user.role,
      }),
    ]);
  } catch (error) {
    assessmentDataDegraded = true;
    console.warn("[assessment-page] failed to load initial datasets; rendering fallbacks", {
      uid: user.uid,
      error: error instanceof Error ? error.name : "UNKNOWN",
    });
  }

  return (
    <div className="space-y-6">
      {assessmentDataDegraded ? (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-700 dark:text-amber-200">
          Assessment data is temporarily limited. You can still continue with available controls.
        </div>
      ) : null}

      <section className="relative overflow-hidden rounded-[2.5rem] border border-white/15 bg-[linear-gradient(145deg,rgba(255,255,255,0.64),rgba(241,249,247,0.46))] p-6 shadow-sm backdrop-blur-xl dark:border-white/6 dark:bg-[linear-gradient(145deg,rgba(4,12,21,0.58),rgba(3,10,18,0.42))] sm:p-8 lg:p-10">
        <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-emerald-400/18 blur-3xl" />
        <div className="absolute -bottom-24 left-[-4rem] h-56 w-56 rounded-full bg-sky-400/12 blur-3xl" />
        
        <div className="relative z-10">
          <div className="mb-4 flex items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-200">
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
        initialPromptAccess={promptAccess}
        defaultModelId={resolveDefaultModelIdForTool("assessment")}
        models={getModelsForTool("assessment")}
        initialDocuments={documents}
        initialGenerations={generations}
        initialActiveDocumentId={activeDocument?.id ?? null}
        initialCreditSummary={credits}
      />
    </div>
  );
}
