"use client";

import { CalendarDays, FileClock, LibraryBig } from "lucide-react";
import { useState } from "react";

import type {
  AssessmentPreviewThemeMode,
  NormalizedAssessmentPreview,
} from "@/lib/assessment-preview-model";
import type { AppMessages } from "@/lib/messages";

import { AssessmentExportActions } from "@/components/assessment/assessment-export-actions";
import { AssessmentPreviewThemeToggle } from "@/components/assessment/assessment-preview-theme-toggle";
import { AssessmentResultViewer } from "@/components/assessment/assessment-result-viewer";

interface AssessmentPreviewShellProps {
  messages: AppMessages;
  preview: NormalizedAssessmentPreview;
  initialThemeMode: AssessmentPreviewThemeMode;
  view: "preview" | "result";
}

export function AssessmentPreviewShell({
  messages,
  preview,
  initialThemeMode,
  view,
}: AssessmentPreviewShellProps) {
  const [themeMode, setThemeMode] = useState<AssessmentPreviewThemeMode>(initialThemeMode);
  const dark = themeMode === "dark";

  return (
    <div
      className={`rounded-[2.4rem] border px-5 py-5 shadow-sm sm:px-6 sm:py-6 lg:px-8 lg:py-8 ${
        dark
          ? "border-white/10 bg-slate-950/92 text-white"
          : "border-slate-200 bg-white/92 text-slate-950"
      }`}
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-4">
            <span
              className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] ${
                dark
                  ? "bg-blue-500/14 text-blue-100"
                  : "bg-blue-50 text-blue-700"
              }`}
            >
              <LibraryBig className="me-2 h-3.5 w-3.5" />
              {view === "preview"
                ? messages.assessmentPreviewTitle
                : messages.assessmentResultViewerTitle}
            </span>
            <div>
              <h1 className="max-w-4xl text-balance text-3xl font-bold tracking-tight sm:text-4xl">
                {preview.title}
              </h1>
              <p className={`mt-3 max-w-3xl text-sm leading-7 ${dark ? "text-white/72" : "text-slate-600"}`}>
                {preview.summary}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-sm font-semibold">
              <span
                className={`inline-flex rounded-full px-3 py-1 ${
                  dark ? "bg-white/10 text-white/80" : "bg-slate-900/5 text-slate-700"
                }`}
              >
                {preview.modeLabel}
              </span>
              <span
                className={`inline-flex rounded-full px-3 py-1 ${
                  dark ? "bg-white/10 text-white/80" : "bg-slate-900/5 text-slate-700"
                }`}
              >
                {preview.difficultyLabel}
              </span>
              <span
                className={`inline-flex rounded-full px-3 py-1 ${
                  dark ? "bg-white/10 text-white/80" : "bg-slate-900/5 text-slate-700"
                }`}
              >
                {preview.languageLabel}
              </span>
              <span
                className={`inline-flex rounded-full px-3 py-1 ${
                  preview.status === "expired"
                    ? dark
                      ? "bg-amber-500/16 text-amber-100"
                      : "bg-amber-50 text-amber-700"
                    : dark
                      ? "bg-emerald-500/16 text-emerald-100"
                      : "bg-emerald-50 text-emerald-700"
                }`}
              >
                {preview.statusLabel}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-3 xl:items-end">
            <AssessmentPreviewThemeToggle
              value={themeMode}
              messages={messages}
              onChange={setThemeMode}
            />
            <AssessmentExportActions
              messages={messages}
              preview={preview}
              showPreviewLink={view === "result"}
              showResultLink={view === "preview"}
            />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <article
            className={`rounded-[1.6rem] border px-5 py-4 ${
              dark
                ? "border-white/10 bg-white/[0.04]"
                : "border-slate-200 bg-slate-50/85"
            }`}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-inherit/60">
              {messages.assessmentGeneratedLabel}
            </p>
            <div className="mt-3 flex items-center gap-2 text-sm font-semibold">
              <CalendarDays className="h-4 w-4" />
              {preview.generatedAtLabel}
            </div>
          </article>

          <article
            className={`rounded-[1.6rem] border px-5 py-4 ${
              dark
                ? "border-white/10 bg-white/[0.04]"
                : "border-slate-200 bg-slate-50/85"
            }`}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-inherit/60">
              {messages.assessmentExpiresLabel}
            </p>
            <div className="mt-3 flex items-center gap-2 text-sm font-semibold">
              <FileClock className="h-4 w-4" />
              {preview.expiresAtLabel}
            </div>
          </article>
        </div>

        <AssessmentResultViewer
          messages={messages}
          preview={preview}
          themeMode={themeMode}
        />
      </div>
    </div>
  );
}
