"use client";

import { APP_ROUTES } from "@zootopia/shared-config";
import type { DocumentRecord } from "@zootopia/shared-types";
import { ArrowUpRight, FileStack, UploadCloud } from "lucide-react";
import Link from "next/link";

import type { AppMessages } from "@/lib/messages";

type DocumentContextCardProps = {
  messages: AppMessages;
  tone: "assessment" | "infographic";
  selectedDocument?: DocumentRecord | null;
  latestDocument?: DocumentRecord | null;
};

const TONE_CLASSES = {
  assessment: {
    shell:
      "border-violet-500/20 bg-violet-500/[0.04] dark:border-violet-500/15 dark:bg-violet-500/[0.08]",
    glow: "bg-violet-500/20",
    badge:
      "border border-violet-500/20 bg-violet-500/10 text-violet-700 dark:border-violet-500/15 dark:text-violet-200",
    action:
      "border border-violet-500/25 bg-violet-500/10 text-violet-700 hover:bg-violet-500/15 dark:text-violet-200",
    icon: "bg-violet-500/10 text-violet-600 dark:text-violet-200",
  },
  infographic: {
    shell:
      "border-amber-500/20 bg-amber-500/[0.04] dark:border-amber-500/15 dark:bg-amber-500/[0.08]",
    glow: "bg-amber-500/20",
    badge:
      "border border-amber-500/20 bg-amber-500/10 text-amber-700 dark:border-amber-500/15 dark:text-amber-200",
    action:
      "border border-amber-500/25 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 dark:text-amber-200",
    icon: "bg-amber-500/10 text-amber-600 dark:text-amber-200",
  },
} as const;

function getDocumentStatusLabel(value: DocumentRecord["status"], messages: AppMessages) {
  switch (value) {
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

export function DocumentContextCard({
  messages,
  tone,
  selectedDocument,
  latestDocument,
}: DocumentContextCardProps) {
  const classes = TONE_CLASSES[tone];
  const highlightedDocument = selectedDocument ?? latestDocument ?? null;
  const heading = selectedDocument
    ? messages.documentContextSelectedLabel
    : highlightedDocument
      ? messages.documentContextLatestLabel
      : messages.documentContextEmptyTitle;

  return (
    <section
      className={`relative overflow-hidden rounded-[1.75rem] border p-5 shadow-sm sm:p-6 ${classes.shell}`}
    >
      <div
        className={`pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full opacity-60 blur-3xl ${classes.glow}`}
      />

      <div className="relative z-10 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 space-y-3">
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] ${classes.badge}`}
          >
            <FileStack className="h-3.5 w-3.5" />
            {messages.documentContextLabel}
          </span>

          <div className="space-y-1">
            <h3 className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight text-foreground">
              {heading}
            </h3>
            <p className="max-w-2xl text-sm leading-6 text-foreground-muted">
              {messages.documentContextManageHelp}
            </p>
          </div>
        </div>

        <Link
          href={APP_ROUTES.upload}
          className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${classes.action}`}
        >
          <UploadCloud className="h-4 w-4" />
          {messages.documentContextOpenUpload}
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>

      {highlightedDocument ? (
        <div className="relative z-10 mt-4 flex flex-col gap-3 rounded-2xl border border-border bg-background/65 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="break-words text-sm font-semibold text-foreground">
              {highlightedDocument.fileName}
            </p>
            <p className="mt-1 text-xs text-foreground-muted">
              {getDocumentStatusLabel(highlightedDocument.status, messages)}
            </p>
          </div>

          <span className="inline-flex shrink-0 items-center rounded-full border border-border bg-background-elevated px-3 py-1 text-xs font-semibold text-foreground-muted">
            {getDocumentStatusLabel(highlightedDocument.status, messages)}
          </span>
        </div>
      ) : null}
    </section>
  );
}
