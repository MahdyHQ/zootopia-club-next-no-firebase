"use client";

import { Download, ExternalLink, FileJson, FileText, Printer } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import {
  appendAssessmentThemeToHref,
  type AssessmentFileThemeMode,
} from "@/lib/assessment-file-branding";
import type { NormalizedAssessmentPreview } from "@/lib/assessment-preview-model";
import type { AppMessages } from "@/lib/messages";

import { type AuthStatusDescriptor } from "@/components/auth/auth-feedback";
import { AuthStatus } from "@/components/auth/auth-status";

interface AssessmentExportActionsProps {
  messages: AppMessages;
  preview: NormalizedAssessmentPreview;
  themeMode: AssessmentFileThemeMode;
  showPreviewLink?: boolean;
  showResultLink?: boolean;
  pdfCtaPriority?: "default" | "hero";
}

const defaultActionClassName =
  "assessment-export-actions__action assessment-export-actions__action--secondary assessment-export-actions__default-action";
const heroActionClassName =
  "assessment-export-actions__action assessment-export-actions__action--secondary";
// Unified action container
const unifiedContainerClassName = "assessment-export-actions";

function createPdfExportStatus(
  messages: AppMessages,
  tone: AuthStatusDescriptor["tone"],
): AuthStatusDescriptor {
  if (tone === "success") {
    return {
      tone,
      icon: "success",
      title: messages.assessmentExportSuccessTitle,
      body: messages.assessmentExportSuccessBody,
    };
  }

  if (tone === "info") {
    return {
      tone,
      icon: "working",
      title: messages.assessmentExportStartingTitle,
      body: messages.assessmentExportStartingBody,
      live: "polite",
    };
  }

  return {
    tone: "danger",
    icon: "danger",
    title: messages.assessmentExportFailedTitle,
    body: messages.assessmentExportFailedBody,
    live: "assertive",
  };
}

function extractDownloadFileName(contentDisposition: string | null, fallback: string) {
  if (!contentDisposition) {
    return fallback;
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const filenameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  return filenameMatch?.[1] ?? fallback;
}

function ExportLaneBadge(props: {
  label: string;
  tone: "pro" | "fast";
}) {
  return (
    <span
      className={`assessment-export-actions__badge assessment-export-actions__badge--${props.tone}`}
    >
      {props.label}
    </span>
  );
}

export function AssessmentExportActions({
  messages,
  preview,
  themeMode,
  showPreviewLink = false,
  showResultLink = false,
  pdfCtaPriority = "default",
}: AssessmentExportActionsProps) {
  const prioritizePdfHero = pdfCtaPriority === "hero";
  const proPdfHref = appendAssessmentThemeToHref(preview.exportRoutes.proPdf, themeMode);
  const fastPdfHref = appendAssessmentThemeToHref(preview.exportRoutes.fastPdf, themeMode);
  const [pdfPending, setPdfPending] = useState(false);
  const [pdfStatus, setPdfStatus] = useState<AuthStatusDescriptor | null>(null);

  async function handlePdfExport() {
    if (pdfPending) {
      return;
    }

    setPdfPending(true);
    setPdfStatus(createPdfExportStatus(messages, "info"));

    try {
      /* The Pro lane is the real downloadable PDF path. Keep this fetch-based so the preview
         page can show inline status while the owner-scoped backend still controls the file bytes. */
      const response = await fetch(proPdfHref, {
        method: "GET",
        credentials: "same-origin",
      });

      if (!response.ok || !response.headers.get("content-type")?.includes("application/pdf")) {
        throw new Error("PDF_EXPORT_ROUTE_FAILED");
      }

      const pdfBlob = await response.blob();
      if (pdfBlob.size === 0) {
        throw new Error("PDF_EXPORT_EMPTY");
      }

      const downloadFileName = extractDownloadFileName(
        response.headers.get("content-disposition"),
        `assessment-${preview.id.slice(0, 8)}.pdf`,
      );
      const downloadUrl = window.URL.createObjectURL(pdfBlob);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = downloadFileName;
      anchor.rel = "noopener";
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(downloadUrl), 1_000);

      setPdfStatus(createPdfExportStatus(messages, "success"));
    } catch {
      setPdfStatus(createPdfExportStatus(messages, "danger"));
    } finally {
      setPdfPending(false);
    }
  }

  if (prioritizePdfHero) {
    return (
      <div className="space-y-3">
        <div className="assessment-export-actions assessment-export-actions--pdf-hero">
          {/* Keep premium and utility actions in two stable groups so preview/result pages
              preserve the same capabilities while the toolbar remains readable on narrower widths. */}
          <div className="assessment-export-actions__group assessment-export-actions__group--primary">
            {/* The preview page intentionally surfaces both PDF lanes side by side.
                Keep Pro first and visually dominant, while Fast stays immediately beside it as the
                speed-first browser-print lane instead of hiding behind a fallback branch. */}
            <button
              type="button"
              onClick={() => void handlePdfExport()}
              disabled={pdfPending}
              className={heroPdfActionClassName}
            >
              <Download className="h-4 w-4" />
              {messages.assessmentExportPdf}
              <ExportLaneBadge label={messages.assessmentExportLaneProBadge} tone="pro" />
            </button>
            <a
              href={fastPdfHref}
              target="_blank"
              rel="noreferrer"
              className={heroFastActionClassName}
            >
              <Printer className="h-4 w-4" />
              {messages.assessmentExportFastPdf}
              <ExportLaneBadge label={messages.assessmentExportLaneFastBadge} tone="fast" />
            </a>
            {showPreviewLink ? (
              <Link
                href={appendAssessmentThemeToHref(preview.previewRoute, themeMode)}
                className={heroActionClassName}
              >
                <ExternalLink className="h-4 w-4" />
                {messages.assessmentOpenPreview}
              </Link>
            ) : null}
            {showResultLink ? (
              <Link
                href={appendAssessmentThemeToHref(preview.resultRoute, themeMode)}
                className={heroActionClassName}
              >
                <ExternalLink className="h-4 w-4" />
                {messages.assessmentOpenResult}
              </Link>
            ) : null}
          </div>
          <div className="assessment-export-actions__group assessment-export-actions__group--formats">
            <a
              href={appendAssessmentThemeToHref(preview.exportRoutes.json, themeMode)}
              className={defaultActionClassName}
            >
              <FileJson className="h-4 w-4" />
              {messages.assessmentExportJson}
            </a>
            <a
              href={appendAssessmentThemeToHref(preview.exportRoutes.markdown, themeMode)}
              className={defaultActionClassName}
            >
              <FileText className="h-4 w-4" />
              {messages.assessmentExportMarkdown}
            </a>
            <a
              href={appendAssessmentThemeToHref(preview.exportRoutes.docx, themeMode)}
              className={defaultActionClassName}
            >
              <Download className="h-4 w-4" />
              {messages.assessmentExportDocx}
            </a>
          </div>
        </div>
        {/* Export feedback stays directly below the action row so the user always sees whether
            the backend started a real Pro download or returned an error, even without a new tab. */}
        <AuthStatus status={pdfStatus} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="assessment-export-actions assessment-export-actions--default">
        <div className="assessment-export-actions__group assessment-export-actions__group--primary">
          {showPreviewLink ? (
            <Link
              href={appendAssessmentThemeToHref(preview.previewRoute, themeMode)}
              className={defaultActionClassName}
            >
              <ExternalLink className="h-4 w-4" />
              {messages.assessmentOpenPreview}
            </Link>
          ) : null}
          {showResultLink ? (
            <Link
              href={appendAssessmentThemeToHref(preview.resultRoute, themeMode)}
              className={defaultActionClassName}
            >
              <ExternalLink className="h-4 w-4" />
              {messages.assessmentOpenResult}
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => void handlePdfExport()}
            disabled={pdfPending}
            className={defaultActionClassName}
          >
            <Download className="h-4 w-4" />
            {messages.assessmentExportPdf}
            <ExportLaneBadge label={messages.assessmentExportLaneProBadge} tone="pro" />
          </button>
          <a href={fastPdfHref} target="_blank" rel="noreferrer" className={defaultActionClassName}>
            <Printer className="h-4 w-4" />
            {messages.assessmentExportFastPdf}
            <ExportLaneBadge label={messages.assessmentExportLaneFastBadge} tone="fast" />
          </a>
        </div>
        <div className="assessment-export-actions__group assessment-export-actions__group--formats">
          <a
            href={appendAssessmentThemeToHref(preview.exportRoutes.json, themeMode)}
            className={defaultActionClassName}
          >
            <FileJson className="h-4 w-4" />
            {messages.assessmentExportJson}
          </a>
          <a
            href={appendAssessmentThemeToHref(preview.exportRoutes.markdown, themeMode)}
            className={defaultActionClassName}
          >
            <FileText className="h-4 w-4" />
            {messages.assessmentExportMarkdown}
          </a>
          <a
            href={appendAssessmentThemeToHref(preview.exportRoutes.docx, themeMode)}
            className={defaultActionClassName}
          >
            <Download className="h-4 w-4" />
            {messages.assessmentExportDocx}
          </a>
        </div>
      </div>
      <AuthStatus status={pdfStatus} />
    </div>
  );
}
