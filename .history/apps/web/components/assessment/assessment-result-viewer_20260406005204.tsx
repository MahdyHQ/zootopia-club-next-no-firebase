"use client";

import { CheckCircle2 } from "lucide-react";

import type {
  AssessmentPreviewThemeMode,
  NormalizedAssessmentPreview,
} from "@/lib/assessment-preview-model";
import { buildAssessmentFileQuestionPages } from "@/lib/assessment-file-layout";
import {
  countFillBlanks,
  extractMatchingPairs,
  resolveTrueFalseAnswerValue,
  splitMultipleResponseAnswers,
} from "@/lib/assessment-question-display";
import type { AppMessages } from "@/lib/messages";

import { AssessmentFileFooter } from "@/components/assessment/assessment-file-footer";
import { AssessmentFileSupportPage } from "@/components/assessment/assessment-file-support-page";

interface AssessmentResultViewerProps {
  messages: AppMessages;
  preview: NormalizedAssessmentPreview;
  qrCodeDataUrl: string;
  themeMode: AssessmentPreviewThemeMode;
}

/* Preview and saved-result pages intentionally share one translucent file-surface language.
   Keep these helpers aligned with the PDF card treatment so the detached assessment surfaces
   feel like one system instead of drifting into separate card materials per route. */
function getQuestionSectionTone(dark: boolean) {
  return dark
    ? "border-white/12 bg-[linear-gradient(145deg,rgba(5,15,28,0.42),rgba(2,10,21,0.18))] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_18px_44px_rgba(2,6,23,0.18)] backdrop-blur-xl"
    : "border-white/65 bg-[linear-gradient(145deg,rgba(255,255,255,0.56),rgba(244,251,249,0.34))] shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_16px_36px_rgba(15,23,42,0.08)] backdrop-blur-xl";
}

function getQuestionCardTone(dark: boolean) {
  return dark
    ? "border-white/12 bg-[linear-gradient(145deg,rgba(7,18,34,0.48),rgba(4,13,26,0.22))] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_40px_rgba(2,6,23,0.22)] backdrop-blur-xl"
    : "border-white/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.64),rgba(241,249,247,0.42))] shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_16px_34px_rgba(15,23,42,0.08)] backdrop-blur-xl";
}

/* Correct-choice highlighting applies to preview pages and saved result pages.
   Preserve this restrained accent system so the right option stays obvious and premium
   without turning into a neon quiz UI that fights the themed file background. */
function getChoiceTone(input: { dark: boolean; isCorrect: boolean }) {
  if (input.isCorrect) {
    return input.dark
      ? "border-emerald-300/30 bg-[linear-gradient(145deg,rgba(16,185,129,0.18),rgba(10,32,42,0.5))] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_0_0_1px_rgba(110,231,183,0.14),0_18px_32px_rgba(3,10,18,0.24),0_0_28px_rgba(45,212,191,0.14)] backdrop-blur-xl"
      : "border-emerald-300/65 bg-[linear-gradient(145deg,rgba(255,255,255,0.72),rgba(220,252,231,0.82))] text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.98),0_0_0_1px_rgba(16,185,129,0.08),0_16px_30px_rgba(16,185,129,0.12)] backdrop-blur-xl";
  }

  return input.dark
    ? "border-white/10 bg-white/[0.055] text-white/[0.84] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-md"
    : "border-white/70 bg-white/[0.55] text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-md";
}

function getAnswerCardTone(dark: boolean) {
  return dark
    ? "border-white/12 bg-[linear-gradient(145deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-lg"
    : "border-white/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.72),rgba(241,249,247,0.56))] shadow-[inset_0_1px_0_rgba(255,255,255,0.92)] backdrop-blur-lg";
}

function getRationaleCardTone(dark: boolean) {
  return dark
    ? "border-white/12 bg-[linear-gradient(145deg,rgba(2,10,21,0.34),rgba(255,255,255,0.02))] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-lg"
    : "border-white/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.62),rgba(236,245,244,0.46))] shadow-[inset_0_1px_0_rgba(255,255,255,0.92)] backdrop-blur-lg";
}

function localizeCopy(locale: NormalizedAssessmentPreview["contentLanguage"], en: string, ar: string) {
  return locale === "ar" ? ar : en;
}

function getTypeAwareAnswerLabel(input: {
  question: NormalizedAssessmentPreview["questions"][number];
  messages: AppMessages;
  contentLanguage: NormalizedAssessmentPreview["contentLanguage"];
}) {
  switch (input.question.questionType) {
    case "essay":
      return localizeCopy(input.contentLanguage, "Model answer / guidance", "إرشاد الإجابة المقالية");
    case "short_answer":
      return localizeCopy(input.contentLanguage, "Expected short answer", "الإجابة القصيرة المتوقعة");
    case "matching":
      return localizeCopy(input.contentLanguage, "Correct matching", "التوصيل الصحيح");
    case "multiple_response":
      return localizeCopy(input.contentLanguage, "Correct options", "الخيارات الصحيحة");
    case "terminology":
      return localizeCopy(input.contentLanguage, "Expected term", "المصطلح المتوقع");
    case "definition":
      return localizeCopy(input.contentLanguage, "Expected definition", "التعريف المتوقع");
    case "comparison":
      return localizeCopy(input.contentLanguage, "Comparison guidance", "إرشاد المقارنة");
    case "labeling":
      return localizeCopy(input.contentLanguage, "Labeling key", "مفتاح التسمية");
    case "classification":
      return localizeCopy(input.contentLanguage, "Classification key", "مفتاح التصنيف");
    case "sequencing":
      return localizeCopy(input.contentLanguage, "Expected sequence", "التسلسل المتوقع");
    case "process_mechanism":
      return localizeCopy(input.contentLanguage, "Mechanism guidance", "إرشاد الآلية");
    case "cause_effect":
      return localizeCopy(input.contentLanguage, "Cause-effect mapping", "خريطة السبب والنتيجة");
    case "distinguish_between":
      return localizeCopy(input.contentLanguage, "Distinguishing points", "نقاط التمييز");
    case "identify_structure":
      return localizeCopy(input.contentLanguage, "Structure identification", "تحديد البنية");
    case "identify_compound":
      return localizeCopy(input.contentLanguage, "Compound identification", "تحديد المركب");
    default:
      return input.messages.assessmentAnswerLabel;
  }
}

function renderScienceBlock(input: {
  questionId: string;
  dark: boolean;
  block: NormalizedAssessmentPreview["questions"][number]["scienceBlocks"][number];
}) {
  const { questionId, dark, block } = input;
  const shellClassName = `rounded-[1.1rem] border px-4 py-3 ${
    dark
      ? "border-white/12 bg-[linear-gradient(145deg,rgba(7,18,34,0.44),rgba(4,13,26,0.24))]"
      : "border-slate-200 bg-white/72"
  }`;

  if (block.kind === "value" && block.value) {
    return (
      <div key={`${questionId}-${block.key}`} className={shellClassName}>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-inherit/60">
          {block.label}
        </p>
        <p className="mt-2 text-sm leading-7 text-inherit/80">{block.value}</p>
      </div>
    );
  }

  if (block.kind === "pair") {
    return (
      <div key={`${questionId}-${block.key}`} className={shellClassName}>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-inherit/60">
          {block.label}
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {block.leftValue ? (
            <p className="text-sm leading-7 text-inherit/80">
              <span className="font-semibold">{block.leftLabel}:</span> {block.leftValue}
            </p>
          ) : null}
          {block.rightValue ? (
            <p className="text-sm leading-7 text-inherit/80">
              <span className="font-semibold">{block.rightLabel}:</span> {block.rightValue}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  if (block.kind === "list" && block.items && block.items.length > 0) {
    return (
      <div key={`${questionId}-${block.key}`} className={shellClassName}>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-inherit/60">
          {block.label}
        </p>
        <div className="mt-2 space-y-1.5 text-sm leading-7 text-inherit/80">
          {block.items.map((item, index) => (
            <p key={`${questionId}-${block.key}-${index}`}>
              <span className="font-semibold">{block.ordered ? `${index + 1}.` : "-"}</span>{" "}
              {item}
            </p>
          ))}
        </div>
      </div>
    );
  }

  if (block.kind === "pair-list" && block.pairs && block.pairs.length > 0) {
    return (
      <div key={`${questionId}-${block.key}`} className={shellClassName}>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-inherit/60">
          {block.label}
        </p>
        <div className="mt-2 space-y-1.5 text-sm leading-7 text-inherit/80">
          {block.pairs.map((pair, index) => (
            <p key={`${questionId}-${block.key}-${index}`}>
              {pair.left} -&gt; {pair.right}
            </p>
          ))}
        </div>
      </div>
    );
  }

  return null;
}

export function AssessmentResultViewer({
  messages,
  preview,
  qrCodeDataUrl,
  themeMode,
}: AssessmentResultViewerProps) {
  const dark = themeMode === "dark";
  const questionPages = buildAssessmentFileQuestionPages(preview.questions);
  const sealAssetUrl = dark
    ? preview.fileSurface.sealDarkAssetUrl
    : preview.fileSurface.sealLightAssetUrl;

  return (
    <div className="space-y-6">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {preview.metadata.map((item) => (
          <article
            key={`${item.label}-${item.value}`}
            className={`rounded-[1.5rem] border px-5 py-4 ${
              dark
                ? "border-white/10 bg-white/[0.04]"
                : "border-slate-200 bg-white/80"
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
            className={`flex flex-col gap-5 rounded-[1.8rem] border px-5 py-5 sm:px-6 ${getQuestionSectionTone(dark)}`}
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
              {page.questions.map((question) => {
                const resolvedTrueFalseValue =
                  question.questionType === "true_false"
                    ? resolveTrueFalseAnswerValue(question.answerDisplay || question.answer)
                    : null;
                const fillBlankCount =
                  question.questionType === "fill_blanks" ? countFillBlanks(question.stem) : 0;
                const matchingPairs =
                  question.questionType === "matching"
                    ? extractMatchingPairs(question.answerDisplay || question.answer)
                    : [];
                const resolvedMultipleResponseAnswers =
                  question.questionType === "multiple_response"
                    ? (() => {
                        const choiceAnswers = question.choices
                          .filter((choice) => choice.isCorrect)
                          .map((choice) => choice.displayText);

                        if (choiceAnswers.length > 0) {
                          return choiceAnswers;
                        }

                        return splitMultipleResponseAnswers(
                          question.answerDisplay || question.answer,
                        );
                      })()
                    : [];
                const answerLabel = getTypeAwareAnswerLabel({
                  question,
                  messages,
                  contentLanguage: preview.contentLanguage,
                });

                return (
                  // These per-question shells are the shared detached file cards for both preview and
                  // saved-result pages. Keep them softly translucent so the themed background can read
                  // through, but preserve the current contrast floor for long-form educational content.
                  // Padding is intentionally tuned slightly larger than before to fill page whitespace
                  // more gracefully without crowding dense stems/options on smaller breakpoints.
                  <article
                    key={question.id}
                    className={`rounded-[1.5rem] border px-[1.26rem] py-[1.2rem] sm:px-[1.46rem] sm:py-[1.36rem] ${getQuestionCardTone(dark)}`}
                  >
                    <div className="flex flex-wrap items-start gap-3">
                      <span
                        className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${
                          dark
                            ? "bg-blue-500/18 text-blue-100"
                            : "bg-blue-50 text-blue-700"
                        }`}
                      >
                        {question.index + 1}
                      </span>
                      {question.typeLabel ? (
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                            dark
                              ? "bg-white/10 text-white/75"
                              : "bg-slate-900/5 text-slate-700"
                          }`}
                        >
                          {question.typeLabel}
                        </span>
                      ) : null}
                      {question.difficultyLabel ? (
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                            dark
                              ? "border border-amber-300/28 bg-amber-300/14 text-amber-50"
                              : "border border-amber-200 bg-amber-50 text-amber-700"
                          }`}
                        >
                          {localizeCopy(
                            preview.contentLanguage,
                            "Question difficulty",
                            "صعوبة السؤال",
                          )}
                          {`: ${question.difficultyLabel}`}
                        </span>
                      ) : null}
                    </div>

                    <h3 className="mt-4 whitespace-pre-wrap text-[1.02rem] font-semibold leading-7 text-inherit sm:text-lg sm:leading-8">
                      {question.stem}
                    </h3>

                    {resolvedTrueFalseValue ? (
                      <div className="mt-4 grid grid-cols-2 gap-2.5">
                        {[
                          {
                            value: "true" as const,
                            label: localizeCopy(preview.contentLanguage, "True", "صح"),
                          },
                          {
                            value: "false" as const,
                            label: localizeCopy(preview.contentLanguage, "False", "خطأ"),
                          },
                        ].map((option) => (
                          <span
                            key={`${question.id}-${option.value}`}
                            className={`inline-flex items-center justify-center rounded-[1rem] border px-3 py-2 text-sm font-bold ${getChoiceTone(
                              {
                                dark,
                                isCorrect: resolvedTrueFalseValue === option.value,
                              },
                            )}`}
                          >
                            {option.label}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    {question.choices.length > 0 ? (
                      <div
                        className={`mt-4 grid gap-2.5 ${
                          question.choiceLayout === "grid-2x2" ? "sm:grid-cols-2" : ""
                        }`}
                      >
                        {question.choices.map((choice, choiceIndex) => (
                          <div
                            key={`${question.id}-${choiceIndex}`}
                            className={`flex items-start gap-3 rounded-[1.1rem] border px-4 py-3 text-sm leading-6 ${getChoiceTone({
                              dark,
                              isCorrect: choice.isCorrect,
                            })}`}
                          >
                            <span
                              className={`min-w-[2.2rem] text-sm font-bold ${
                                choice.isCorrect
                                  ? dark
                                    ? "text-emerald-50 drop-shadow-[0_0_8px_rgba(110,231,183,0.35)]"
                                    : "text-emerald-700"
                                  : dark
                                    ? "text-emerald-100/[0.88]"
                                    : "text-emerald-700"
                              }`}
                            >
                              {choice.marker ? `${choice.marker})` : "•"}
                            </span>
                            <span className="min-w-0 flex-1 font-medium">{choice.text}</span>
                            {choice.isCorrect ? (
                              <span
                                aria-hidden="true"
                                className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                                  dark
                                    ? "border-emerald-200/25 bg-emerald-300/12 text-emerald-50 shadow-[0_0_18px_rgba(45,212,191,0.18)]"
                                    : "border-emerald-300/70 bg-white/85 text-emerald-700 shadow-[0_10px_20px_rgba(16,185,129,0.12)]"
                                }`}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.4} />
                              </span>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {fillBlankCount > 0 ? (
                      <p className={`mt-4 text-sm font-semibold ${dark ? "text-amber-100" : "text-amber-700"}`}>
                        {localizeCopy(preview.contentLanguage, "Blank count", "عدد الفراغات")}: {fillBlankCount}
                      </p>
                    ) : null}

                    {matchingPairs.length > 0 ? (
                      <div className={`mt-4 rounded-[1.1rem] border px-4 py-3 ${getAnswerCardTone(dark)}`}>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-inherit/60">
                          {localizeCopy(preview.contentLanguage, "Matching pairs", "أزواج التوصيل")}
                        </p>
                        <div className="mt-2 space-y-1.5 text-sm leading-6 text-inherit/80">
                          {matchingPairs.map((pair, pairIndex) => (
                            <p key={`${question.id}-pair-${pairIndex}`}>
                              {pair.left} -&gt; {pair.right}
                            </p>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {question.questionType === "multiple_response" &&
                    question.choices.length === 0 &&
                    resolvedMultipleResponseAnswers.length > 0 ? (
                      <div className={`mt-4 rounded-[1.1rem] border px-4 py-3 ${getAnswerCardTone(dark)}`}>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-inherit/60">
                          {localizeCopy(
                            preview.contentLanguage,
                            "Resolved correct options",
                            "الخيارات الصحيحة",
                          )}
                        </p>
                        <p className="mt-2 text-sm leading-7 text-inherit/80">
                          {resolvedMultipleResponseAnswers.join(", ")}
                        </p>
                      </div>
                    ) : null}

                    {question.scienceBlocks.length > 0 ? (
                      /* Science-oriented types render explicit structured blocks here so multi-type
                         result files remain truthful and readable instead of flattening into one
                         generic answer paragraph when providers supply richer metadata. */
                      <div className="mt-4 grid gap-2.5">
                        {question.scienceBlocks.map((block) =>
                          renderScienceBlock({
                            questionId: question.id,
                            dark,
                            block,
                          }),
                        )}
                      </div>
                    ) : null}

                    {question.supplementalLines.length > 0 ? (
                      <div className="mt-4 space-y-2">
                        {question.supplementalLines.map((line, lineIndex) => (
                          <p
                            key={`${question.id}-${lineIndex}`}
                            className={`text-sm leading-7 ${
                              dark ? "text-white/72" : "text-slate-600"
                            }`}
                          >
                            {line}
                          </p>
                        ))}
                      </div>
                    ) : null}

                    <div
                      className={`mt-5 rounded-[1.25rem] border px-4 py-4 ${getAnswerCardTone(dark)}`}
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-inherit/60">
                        {answerLabel}
                      </p>
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-inherit/80">
                        {question.answerDisplay}
                      </p>
                    </div>

                    {question.rationale ? (
                      <div
                        className={`mt-4 rounded-[1.25rem] border px-4 py-4 ${getRationaleCardTone(dark)}`}
                      >
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-inherit/60">
                          {messages.assessmentRationaleLabel}
                        </p>
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-inherit/75">
                          {question.rationale}
                        </p>
                      </div>
                    ) : null}

                    {question.tags.length > 0 ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {question.tags.map((tag) => (
                          <span
                            key={`${question.id}-${tag}`}
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                              dark
                                ? "bg-emerald-500/14 text-emerald-100"
                                : "bg-emerald-50 text-emerald-700"
                            }`}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>

            {page.usesOverflowFallback ? (
              <p className={`text-sm leading-7 ${dark ? "text-white/68" : "text-slate-600"}`}>
                Long-content safety fallback applied on this page to preserve clean borders and
                prevent card overlap.
              </p>
            ) : null}

            <AssessmentFileFooter
              footerLine={preview.fileSurface.footerLine}
              pageNumber={pageIndex + 1}
              sealAssetUrl={sealAssetUrl}
              themeMode={dark ? "dark" : "light"}
            />
          </section>
        ))}

        <AssessmentFileSupportPage
          supportPage={preview.fileSurface.supportPage}
          footerLine={preview.fileSurface.footerLine}
          qrCodeDataUrl={qrCodeDataUrl}
          pageNumber={questionPages.length + 1}
          sealAssetUrl={sealAssetUrl}
          themeMode={dark ? "dark" : "light"}
        />
      </div>
    </div>
  );
}
