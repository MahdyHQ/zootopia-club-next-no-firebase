import { APP_ROUTES, getModelsForTool } from "@zootopia/shared-config";
import { BrainCircuit } from "lucide-react";

import { AssessmentPlatformInfoNote } from "@/components/assessment/assessment-platform-info-note";
import { AssessmentStudio } from "@/components/assessment/assessment-studio";
import { getAssessmentUiLockConfig } from "@/lib/assessment-ui-lock-config";
import { isActiveNormalUserExemptEmail } from "@/lib/server/active-normal-user-session-governance";
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

export default async function AssessmentPage() {
  const [user, uiContext] = await Promise.all([
    requireCompletedUser(APP_ROUTES.assessment),
    getRequestUiContext(),
  ]);
  // UI-only product access toggles are env-driven here and passed to the client studio.
  // Backend authorization remains unchanged in API/session/repository layers.
  const assessmentUiLockConfig = getAssessmentUiLockConfig();
  const promptAccess = await getAssessmentPromptAccessStateForUser({
    uid: user.uid,
    role: user.role,
  });
  let documents = [] as Awaited<ReturnType<typeof listDocumentsForUser>>;
  let generations = [] as Awaited<ReturnType<typeof listAssessmentGenerationsForUser>>;
  let activeDocument: Awaited<ReturnType<typeof listDocumentsForUser>>[number] | null = null;
  let assessmentDataDegraded = false;
  let initialCreditSummary: Awaited<
    ReturnType<typeof getAssessmentDailyCreditsSummaryForUser>
  > | null = null;

  try {
    [documents, generations, activeDocument, initialCreditSummary] = await Promise.all([
      listDocumentsForUser(user.uid),
      listAssessmentGenerationsForUser(user.uid),
      getActiveDocumentForOwner(user.uid),
      getAssessmentDailyCreditsSummaryForUser({
        uid: user.uid,
        role: user.role,
        email: user.email,
      }),
    ]);
  } catch (error) {
    assessmentDataDegraded = true;
    console.warn("[assessment-page] failed to load initial datasets; rendering fallbacks", {
      uid: user.uid,
      error: error instanceof Error ? error.name : "UNKNOWN",
    });
    try {
      initialCreditSummary = await getAssessmentDailyCreditsSummaryForUser({
        uid: user.uid,
        role: user.role,
        email: user.email,
      });
    } catch (creditError) {
      console.warn("[assessment-page] failed to load initial credit summary", {
        uid: user.uid,
        error: creditError instanceof Error ? creditError.name : "UNKNOWN",
      });
    }
  }

  /* Assessment Studio must know whether this signed-in identity is exempt before hydration so
     the UI can fail closed for standard users when shared capacity truth is missing, without
     accidentally blocking admin or configured exempt-email identities. Prefer the canonical
     summary flags when they are already available from the server render. */
  const platformLockUiExempt =
    initialCreditSummary?.platformDailyUsage.isAdminExempt === true
    || initialCreditSummary?.platformDailyUsage.isEmailExempt === true
    || user.role === "admin"
    || isActiveNormalUserExemptEmail(user.email);

  return (
    <div className="min-w-0 space-y-5 px-0.5 sm:space-y-6 sm:px-0">
      {assessmentDataDegraded ? (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-700 dark:text-amber-200">
          Assessment data is temporarily limited. You can still continue with available controls.
        </div>
      ) : null}

      <section className="relative overflow-hidden rounded-[2rem] border border-white/15 bg-[linear-gradient(145deg,rgba(255,255,255,0.64),rgba(241,249,247,0.46))] p-4 shadow-sm backdrop-blur-xl dark:border-white/6 dark:bg-[linear-gradient(145deg,rgba(4,12,21,0.58),rgba(3,10,18,0.42))] sm:rounded-[2.5rem] sm:p-8 lg:p-10">
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
          {/* Keep this reassurance note in the hero body so it uses existing empty space
              and does not crowd the studio controls below. */}
          <AssessmentPlatformInfoNote className="mt-4 max-w-3xl" />
        </div>
      </section>

      <AssessmentStudio
        locale={uiContext.locale}
        messages={uiContext.messages}
        uiLockConfig={assessmentUiLockConfig}
        platformLockUiExempt={platformLockUiExempt}
        initialPromptAccess={promptAccess}
        defaultModelId={resolveDefaultModelIdForTool("assessment")}
        models={getModelsForTool("assessment")}
        initialDocuments={documents}
        initialGenerations={generations}
        initialActiveDocumentId={activeDocument?.id ?? null}
        initialCreditSummary={initialCreditSummary}
      />
    </div>
  );
}
