"use client";

import type {
  AssessmentPreviewThemeMode,
  NormalizedAssessmentPreview,
} from "@/lib/assessment-preview-model";
import { buildAssessmentFileQuestionPages } from "@/lib/assessment-file-layout";
import type { AppMessages } from "@/lib/messages";

import { AssessmentGroupedView } from "@/components/assessment/assessment-grouped-view";
import { AssessmentFileFooter } from "@/components/assessment/assessment-file-footer";
import { AssessmentPreviewPageFooter } from "@/components/assessment/assessment-preview-page-footer";
import { AssessmentFileSupportPage } from "@/components/assessment/assessment-file-support-page";

interface AssessmentResultViewerProps {
  messages: AppMessages;
  preview: NormalizedAssessmentPreview;
  qrCodeDataUrl: string;
  themeMode: AssessmentPreviewThemeMode;
  view: "preview" | "result";
}

/* Preview and saved-result pages intentionally share one translucent file-surface language.
   Keep these helpers aligned with the PDF card treatment so the detached assessment surfaces
   feel like one system instead of drifting into separate card materials per route. */
function getQuestionSectionTone(dark: boolean) {
  return dark
    ? "border-white/12 bg-[linear-gradient(145deg,rgba(5,15,28,0.42),rgba(2,10,21,0.18))] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_18px_44px_rgba(2,6,23,0.18)] backdrop-blur-xl"
    : "border-white/65 bg-[linear-gradient(145deg,rgba(255,255,255,0.56),rgba(244,251,249,0.34))] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_16px_36px_rgba(15,23,42,0.08)] backdrop-blur-xl";
}

export function AssessmentResultViewer({
  messages,
  preview,
  qrCodeDataUrl,
  themeMode,
  view,
}: AssessmentResultViewerProps) {
  const dark = themeMode === "dark";
  const questionPages = buildAssessmentFileQuestionPages(preview.questions);
  const sealAssetUrl = dark
    ? preview.fileSurface.sealDarkAssetUrl
    : preview.fileSurface.sealLightAssetUrl;
  const footerThemeMode = dark ? "dark" : "light";
  /* Preview and saved-result pages share the same grouped question body, but preview owns a
     dedicated footer surface so it can match the current screenshot target without changing
     saved-result or export footer contracts. */
  const usePreviewOnlyFooter = view === "preview";

  return (
    <div className="space-y-6">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {preview.metadata.map((item) => (
          <article
            key={`${item.label}-${item.value}`}
            className={`rounded-[1.5rem] border px-5 py-4 ${
              dark ? "border-white/10 bg-white/[0.04]" : "border-slate-200 bg-white/80"
            }`}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-inherit/60">
              {item.label}
            </p>
            <p className="mt-2 text-sm font-semibold text-inherit">{item.value}</p>
          </article>
        ))}
      </section>

      <div className="space-y-5">
        {questionPages.map((page, pageIndex) => (
          <section
            key={`page-${pageIndex}`}
            className={`flex flex-col gap-5 rounded-[1.8rem] border px-5 py-5 sm:px-6 ${getQuestionSectionTone(
              dark,
            )}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span
                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                  dark ? "bg-white/10 text-white/80" : "bg-slate-900/5 text-slate-700"
                }`}
              >
                {pageIndex === 0 ? preview.questionCountLabel : `Page ${pageIndex + 1}`}
              </span>
              {pageIndex === 0 && preview.sourceDocumentLabel ? (
                <span
                  className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                    dark ? "bg-blue-500/15 text-blue-100" : "bg-blue-50 text-blue-700"
                  }`}
                >
                  {messages.assessmentSourceDocument}: {preview.sourceDocumentLabel}
                </span>
              ) : null}
            </div>

            <div className="grid gap-4">
              <AssessmentGroupedView
                questions={page.questions}
                dark={dark}
                contentLanguage={preview.contentLanguage}
                answerLabel={messages.assessmentAnswerLabel}
                rationaleLabel={messages.assessmentRationaleLabel}
              />
            </div>

            {page.usesOverflowFallback ? (
              <p className={`text-sm leading-7 ${dark ? "text-white/68" : "text-slate-600"}`}>
                Long-content safety fallback applied on this page to preserve clean borders and
                prevent card overlap.
              </p>
            ) : null}

            {usePreviewOnlyFooter ? (
              <AssessmentPreviewPageFooter
                footerLine={preview.fileSurface.footerLine}
                pageNumber={pageIndex + 1}
                sealAssetUrl={sealAssetUrl}
                themeMode={footerThemeMode}
              />
            ) : (
              <AssessmentFileFooter
                footerLine={preview.fileSurface.footerLine}
                pageNumber={pageIndex + 1}
                sealAssetUrl={sealAssetUrl}
                themeMode={footerThemeMode}
              />
            )}
          </section>
        ))}

        <AssessmentFileSupportPage
          supportPage={preview.fileSurface.supportPage}
          footerLine={preview.fileSurface.footerLine}
          qrCodeDataUrl={qrCodeDataUrl}
          pageNumber={questionPages.length + 1}
          sealAssetUrl={sealAssetUrl}
          themeMode={footerThemeMode}
          footerVariant={usePreviewOnlyFooter ? "preview" : "shared"}
        />
      </div>
    </div>
  );
}
