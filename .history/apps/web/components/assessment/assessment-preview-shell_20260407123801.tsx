"use client";

import { CalendarDays, FileClock, LibraryBig } from "lucide-react";
import Image from "next/image";
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
  qrCodeDataUrl: string;
  view: "preview" | "result";
}

export function AssessmentPreviewShell({
  messages,
  preview,
  initialThemeMode,
  qrCodeDataUrl,
  view,
}: AssessmentPreviewShellProps) {
  const [themeMode, setThemeMode] = useState<AssessmentPreviewThemeMode>(initialThemeMode);
  const dark = themeMode === "dark";
  const summaryBadgeLabel = "SUMMARY";
  const backgroundUrl =
    themeMode === "light"
      ? preview.fileSurface.backgroundLightUrl
      : preview.fileSurface.backgroundDarkUrl;
  const facultyBadgeAssetUrl =
    themeMode === "light"
      ? preview.fileSurface.facultyBadgeLightAssetUrl
      : preview.fileSurface.facultyBadgeDarkAssetUrl;

  return (
    <div
      dir={preview.direction}
      lang={preview.contentLanguage}
      className={`relative overflow-hidden rounded-[2.4rem] border px-5 py-5 shadow-sm sm:px-6 sm:py-6 lg:px-8 lg:py-8 ${
        dark
          ? "border-white/10 bg-slate-950/92 text-white"
          : "border-slate-200 bg-white/92 text-slate-950"
      }`}
      style={{
        backgroundImage: `url(${backgroundUrl})`,
        backgroundPosition: "center",
        backgroundSize: "cover",
      }}
    >
      <div className={`absolute inset-0 ${dark ? "bg-slate-950/80" : "bg-white/78"}`} />
      {/* These corner accents define the shared premium file-page frame for detached preview/result surfaces.
          Keep them subtle and scoped here so the file treatment can evolve without leaking into unrelated protected pages. */}
      <div className="pointer-events-none absolute inset-0">
        {[
          "left-4 top-4 border-l border-t sm:left-6 sm:top-6",
          "right-4 top-4 border-r border-t sm:right-6 sm:top-6",
          "left-4 bottom-4 border-b border-l sm:left-6 sm:bottom-6",
          "right-4 bottom-4 border-b border-r sm:right-6 sm:bottom-6",
        ].map((positionClassName) => (
          <span
            key={positionClassName}
            className={`absolute h-10 w-10 rounded-[0.9rem] ${positionClassName} ${
              dark ? "border-emerald-200/35" : "border-emerald-700/28"
            }`}
          />
        ))}
      </div>

      <div className="relative flex flex-col gap-6">
        {/* This top rail is the shared first-page-only brand composition for detached preview/result surfaces.
            Keep the logo on the upper-left and the compact QR on the upper-right so the PDF/print lane can mirror it
            without inventing a second branding system. */}
        <header className="flex flex-col gap-4 rounded-[1.7rem] border px-4 py-4 sm:px-5 sm:py-5 lg:flex-row lg:items-start lg:justify-between">
          <div
            className={`flex items-center gap-3 ${
              dark ? "border-white/10 text-white" : "border-slate-200 text-slate-950"
            }`}
          >
            <Image
              src={preview.fileSurface.logoAssetUrl}
              alt={preview.fileSurface.platformName}
              width={56}
              height={56}
              className="h-12 w-12 rounded-[1rem] shadow-sm sm:h-14 sm:w-14"
            />
            <div className="min-w-0">
              <p className={`text-[0.68rem] font-semibold uppercase tracking-[0.24em] ${dark ? "text-white/55" : "text-slate-500"}`}>
                {preview.fileSurface.platformTagline}
              </p>
              <h2 className="mt-1 text-lg font-bold tracking-tight sm:text-xl">
                {preview.fileSurface.platformName}
              </h2>
            </div>
          </div>

          <div className="flex w-full justify-start lg:w-auto lg:justify-end">
            {/* This shared top-right cluster intentionally keeps badge + QR in one compact pocket
                for both preview and saved-result pages. Keep the QR target unchanged while hiding
                raw URL text so branding remains premium without losing scan/click behavior. */}
            <div
              className={`inline-flex items-center gap-2.5 rounded-[1.3rem] border px-2.5 py-2 shadow-sm ${
                dark
                  ? "border-white/12 bg-white/[0.05]"
                  : "border-slate-200/90 bg-white/86"
              }`}
            >
              <span
                aria-hidden="true"
                className={`inline-flex rounded-[1rem] border px-2 py-1 ${
                  dark ? "border-white/12 bg-white/[0.04]" : "border-slate-200/90 bg-white/90"
                }`}
              >
                <Image
                  src={facultyBadgeAssetUrl}
                  alt=""
                  width={120}
                  height={68}
                  className="h-9 w-auto max-w-[6.65rem] object-contain opacity-90 sm:h-10"
                />
              </span>

              <a
                href={preview.fileSurface.qrTargetUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={`${preview.fileSurface.platformName} QR - ${preview.fileSurface.qrTargetUrl}`}
                title={preview.fileSurface.qrTargetUrl}
                className={`inline-flex h-[4.35rem] w-[4.35rem] items-center justify-center rounded-[1rem] border shadow-sm ${
                  dark
                    ? "border-white/10 bg-white/[0.07] text-white"
                    : "border-slate-200 bg-white/92 text-slate-950"
                }`}
              >
                <Image
                  src={qrCodeDataUrl}
                  alt={
                    preview.locale === "ar"
                      ? "رمز QR لمنصة زوتوبيا"
                      : "QR code for Zootopia Club"
                  }
                  width={70}
                  height={70}
                  unoptimized
                  className="h-[3.55rem] w-[3.55rem] rounded-[0.85rem] bg-white p-1.5"
                />
                <span className="sr-only">{preview.fileSurface.qrTargetUrl}</span>
              </a>
            </div>
          </div>
        </header>

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
              {/* This is the shared file-surface summary block for both detached preview and result
                  pages. Keep the SUMMARY badge, restrained gradients, and theme-aware copy here so
                  the on-screen file header stays aligned with the Pro export cover without becoming
                  a one-off tweak inside one page or inside the question/result renderer below. */}
              <div className={`assessment-file-summary mt-4 ${dark ? "assessment-file-summary--dark" : ""}`}>
                <span className="assessment-file-summary__badge">{summaryBadgeLabel}</span>
                <p className="assessment-file-summary__body">{preview.summary}</p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {preview.compositionBadges.map((badge) => (
                  <span
                    key={badge.key}
                    className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
                      badge.tone === "type"
                        ? dark
                          ? "border-cyan-200/22 bg-cyan-300/12 text-cyan-50"
                          : "border-cyan-200 bg-cyan-50 text-cyan-700"
                        : dark
                          ? "border-emerald-200/20 bg-emerald-300/12 text-emerald-50"
                          : "border-emerald-200 bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {badge.label}
                    {badge.value ? ` · ${badge.value}` : ""}
                  </span>
                ))}
              </div>
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

          <div className="assessment-preview-shell__actions-rail flex flex-col gap-3 xl:items-end">
            <AssessmentPreviewThemeToggle
              value={themeMode}
              messages={messages}
              onChange={setThemeMode}
            />
            <AssessmentExportActions
              messages={messages}
              preview={preview}
              themeMode={themeMode}
              showPreviewLink={view === "result"}
              showResultLink={view === "preview"}
              pdfCtaPriority={view === "preview" ? "hero" : "default"}
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
          qrCodeDataUrl={qrCodeDataUrl}
          themeMode={themeMode}
        />
      </div>
    </div>
  );
}
