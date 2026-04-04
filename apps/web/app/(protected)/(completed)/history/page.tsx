import { APP_ROUTES } from "@zootopia/shared-config";
import { Activity, FileClock, FileText } from "lucide-react";

import { AssessmentExportActions } from "@/components/assessment/assessment-export-actions";
import { HistoryDocumentActions } from "@/components/history/history-document-actions";
import { buildAssessmentPreview } from "@/lib/server/assessment-preview";
import { getRequestUiContext } from "@/lib/server/request-context";
import {
  listAssessmentGenerationsForUser,
  listDocumentsForUser,
} from "@/lib/server/repository";
import { requireCompletedUser } from "@/lib/server/session";

function formatHistoryDate(value: string, locale: "en" | "ar") {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getDocumentStatusLabel(
  status: "received" | "processing" | "ready" | "failed",
  messages: Awaited<ReturnType<typeof getRequestUiContext>>["messages"],
) {
  switch (status) {
    case "received":
      return messages.documentStatusReceived;
    case "processing":
      return messages.documentStatusProcessing;
    case "failed":
      return messages.documentStatusFailed;
    default:
      return messages.documentStatusReady;
  }
}

export default async function HistoryPage() {
  /* History is loaded directly from the owner-scoped repository lists so this page stays
     aligned with the same server-authoritative document/result contracts used elsewhere.
     Future agents should extend these loaders instead of introducing a parallel history store. */
  const [user, uiContext] = await Promise.all([
    requireCompletedUser(APP_ROUTES.history),
    getRequestUiContext(),
  ]);
  const [documents, generations] = await Promise.all([
    listDocumentsForUser(user.uid, 50),
    listAssessmentGenerationsForUser(user.uid, 50),
  ]);
  const previewThemeMode = uiContext.themeMode === "light" ? "light" : "dark";
  const previews = generations.map((generation) =>
    buildAssessmentPreview({
      generation,
      locale: uiContext.locale,
      messages: uiContext.messages,
    }),
  );

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-[2.5rem] border border-white/15 bg-[linear-gradient(145deg,rgba(255,255,255,0.78),rgba(241,249,247,0.62))] p-6 shadow-sm backdrop-blur-xl dark:border-white/6 dark:bg-[linear-gradient(145deg,rgba(4,12,21,0.72),rgba(3,10,18,0.56))] sm:p-8 lg:p-10">
        <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-emerald-400/18 blur-3xl" />
        <div className="relative z-10">
          <div className="mb-4 flex items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-200">
              <Activity className="h-3.5 w-3.5" />
              {uiContext.messages.navHistory}
            </span>
          </div>
          <h1 className="page-title max-w-3xl text-balance text-zinc-900 dark:text-white">
            {uiContext.messages.historyTitle}
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-zinc-600 dark:text-zinc-300">
            {uiContext.messages.historyIntro}
          </p>
        </div>
      </section>

      <section className="surface-strong rounded-[2rem] p-5 sm:p-6 lg:p-8">
        <div className="flex items-center gap-3 border-b border-border pb-4">
          <FileClock className="h-5 w-5 text-emerald-500" />
          <div>
            <p className="section-label">{uiContext.messages.historyUploadsTitle}</p>
            <h2 className="mt-2 font-[family-name:var(--font-display)] text-[1.6rem] font-bold tracking-tight">
              {uiContext.messages.historyUploadsHeading}
            </h2>
          </div>
        </div>

        <div className="mt-6">
          {documents.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-background/30 p-8 text-center text-sm font-medium text-foreground-muted">
              {uiContext.messages.historyUploadsEmpty}
            </div>
          ) : (
            <div className="grid gap-3">
              {documents.map((document) => (
                <article
                  key={document.id}
                  className="rounded-[1.4rem] border border-border bg-background-elevated/80 px-5 py-4 transition-all hover:border-emerald-500/15 hover:shadow-sm sm:px-6"
                >
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-foreground">{document.fileName}</p>
                        {document.isActive ? (
                          <span className="inline-flex items-center rounded-full border border-emerald-500/15 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-200">
                            {uiContext.messages.assessmentActiveLinkedDocument}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-foreground-muted">
                        <span>{uiContext.messages.historyCreatedOn}: {formatHistoryDate(document.createdAt, uiContext.locale)}</span>
                        <span>{uiContext.messages.historyExpiresOn}: {formatHistoryDate(document.expiresAt ?? document.createdAt, uiContext.locale)}</span>
                        <span>{uiContext.messages.historyStatusLabel}: {getDocumentStatusLabel(document.status, uiContext.messages)}</span>
                      </div>
                    </div>
                    <HistoryDocumentActions
                      documentId={document.id}
                      canDownload={Boolean(document.storagePath)}
                      messages={uiContext.messages}
                    />
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="surface-strong rounded-[2rem] p-5 sm:p-6 lg:p-8">
        <div className="flex items-center gap-3 border-b border-border pb-4">
          <FileText className="h-5 w-5 text-emerald-500" />
          <div>
            <p className="section-label">{uiContext.messages.assessmentHistoryTitle}</p>
            <h2 className="mt-2 font-[family-name:var(--font-display)] text-[1.6rem] font-bold tracking-tight">
              {uiContext.messages.historyAssessmentsHeading}
            </h2>
          </div>
        </div>

        <div className="mt-6">
          {previews.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-background/30 p-8 text-center text-sm font-medium text-foreground-muted">
              {uiContext.messages.assessmentHistoryEmpty}
            </div>
          ) : (
            <div className="grid gap-4">
              {previews.map((preview) => (
                <article
                  key={preview.id}
                  className="rounded-[1.4rem] border border-border bg-background-elevated/80 px-5 py-5 transition-all hover:border-emerald-500/15 hover:shadow-sm sm:px-6"
                >
                  <div className="flex flex-col gap-5">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-foreground">{preview.title}</p>
                        <span className="inline-flex items-center rounded-full border border-border-strong bg-background-strong px-2.5 py-0.5 text-[11px] font-semibold text-foreground-muted">
                          {preview.statusLabel}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-foreground-muted">
                        {preview.summary}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-foreground-muted">
                        <span>{uiContext.messages.historyCreatedOn}: {preview.generatedAtLabel}</span>
                        <span>{uiContext.messages.historyExpiresOn}: {preview.expiresAtLabel}</span>
                        <span>{uiContext.messages.historyStatusLabel}: {preview.statusLabel}</span>
                      </div>
                    </div>
                    <AssessmentExportActions
                      messages={uiContext.messages}
                      preview={preview}
                      themeMode={previewThemeMode}
                      showPreviewLink
                      showResultLink
                    />
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
