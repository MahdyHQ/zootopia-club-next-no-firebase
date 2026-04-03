"use client";

import { Download, ExternalLink, FileJson, FileText, Printer } from "lucide-react";
import Link from "next/link";

import type { NormalizedAssessmentPreview } from "@/lib/assessment-preview-model";
import type { AppMessages } from "@/lib/messages";

interface AssessmentExportActionsProps {
  messages: AppMessages;
  preview: NormalizedAssessmentPreview;
  showPreviewLink?: boolean;
  showResultLink?: boolean;
}

const actionClassName =
  "inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-inherit transition hover:bg-white/15";

export function AssessmentExportActions({
  messages,
  preview,
  showPreviewLink = false,
  showResultLink = false,
}: AssessmentExportActionsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {showPreviewLink ? (
        <Link href={preview.previewRoute} className={actionClassName}>
          <ExternalLink className="h-4 w-4" />
          {messages.assessmentOpenPreview}
        </Link>
      ) : null}
      {showResultLink ? (
        <Link href={preview.resultRoute} className={actionClassName}>
          <ExternalLink className="h-4 w-4" />
          {messages.assessmentOpenResult}
        </Link>
      ) : null}
      <a href={preview.exportRoutes.json} className={actionClassName}>
        <FileJson className="h-4 w-4" />
        {messages.assessmentExportJson}
      </a>
      <a href={preview.exportRoutes.markdown} className={actionClassName}>
        <FileText className="h-4 w-4" />
        {messages.assessmentExportMarkdown}
      </a>
      <a href={preview.exportRoutes.docx} className={actionClassName}>
        <Download className="h-4 w-4" />
        {messages.assessmentExportDocx}
      </a>
      <a
        href={preview.exportRoutes.pdf}
        target="_blank"
        rel="noreferrer"
        className={actionClassName}
      >
        <Printer className="h-4 w-4" />
        {messages.assessmentExportPdf}
      </a>
    </div>
  );
}
