"use client";

import type {
  AssessmentPreviewThemeMode,
  NormalizedAssessmentPreview,
} from "@/lib/assessment-preview-model";
import type { AppMessages } from "@/lib/messages";

interface AssessmentResultViewerProps {
  messages: AppMessages;
  preview: NormalizedAssessmentPreview;
  themeMode: AssessmentPreviewThemeMode;
}

export function AssessmentResultViewer({
  messages,
  preview,
  themeMode,
}: AssessmentResultViewerProps) {
  const dark = themeMode === "dark";

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

      <section
        className={`rounded-[1.8rem] border px-5 py-5 sm:px-6 ${
          dark
            ? "border-white/10 bg-white/[0.04]"
            : "border-slate-200 bg-white/80"
        }`}
      >
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
              dark ? "bg-white/10 text-white/80" : "bg-slate-900/5 text-slate-700"
            }`}
          >
            {preview.questionCountLabel}
          </span>
          {preview.sourceDocumentLabel ? (
            <span
              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                dark ? "bg-blue-500/15 text-blue-100" : "bg-blue-50 text-blue-700"
              }`}
            >
              {messages.assessmentSourceDocument}: {preview.sourceDocumentLabel}
            </span>
          ) : null}
        </div>

        <div className="mt-6 space-y-4">
          {preview.questions.map((question) => (
            <article
              key={question.id}
              className={`rounded-[1.5rem] border px-5 py-5 ${
                dark
                  ? "border-white/10 bg-slate-950/45"
                  : "border-slate-200 bg-slate-50/85"
              }`}
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
              </div>

              <h3 className="mt-4 whitespace-pre-wrap text-lg font-semibold leading-8 text-inherit">
                {question.question}
              </h3>

              <div
                className={`mt-4 rounded-[1.25rem] border px-4 py-4 ${
                  dark
                    ? "border-white/10 bg-white/[0.04]"
                    : "border-slate-200 bg-white"
                }`}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-inherit/60">
                  {messages.assessmentAnswerLabel}
                </p>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-inherit/80">
                  {question.answer}
                </p>
              </div>

              {question.rationale ? (
                <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-inherit/75">
                  <span className="font-semibold text-inherit">
                    {messages.assessmentRationaleLabel}:{" "}
                  </span>
                  {question.rationale}
                </p>
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
          ))}
        </div>
      </section>
    </div>
  );
}
