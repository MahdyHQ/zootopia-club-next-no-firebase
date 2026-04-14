"use client";

import { APP_ROUTES } from "@zootopia/shared-config";
import type {
  ApiResult,
  DocumentRecord,
  RemoveDocumentResponse,
  UploadResponse,
} from "@zootopia/shared-types";
import { validateUploadDescriptor } from "@zootopia/shared-utils";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { BrainCircuit, PieChart, Trash2, UploadCloud } from "lucide-react";

import type { AppMessages } from "@/lib/messages";
import { SUPPORTED_UPLOAD_FORMAT_BADGES } from "@/lib/upload";

type UploadWorkspaceProps = {
  messages: AppMessages;
  initialDocuments: DocumentRecord[];
  onDocumentCreated?: (document: DocumentRecord) => void;
  title?: string;
  description?: string;
  canAccessInfographic?: boolean;
};

function formatDocumentSize(sizeBytes: number) {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }
  if (sizeBytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
  }
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

/*
  Single premium upload surface for /upload.
  — One card only, no inner dropzone slab.
  — High transparency so the lab background reads through clearly.
  — Hover: upper-left perspective push via rotateY/rotateX + translate,
    simulating the card being pressed deeper into the room from top-left.
  — motion-reduce: disables transform for users who prefer reduced motion.
  — Future agents: do not re-introduce a nested card/label shell inside this component.
    The <label> is kept as a transparent click-target overlay only.
*/
const uploadShellClassName = [
  // Layout
  "group relative mx-auto my-6 flex w-full max-w-3xl flex-col overflow-visible rounded-[2rem] sm:my-8",
  // Single surface — transparent glass, lab shows through
  "border border-white/35",
  "bg-white/[0.28]",
  "backdrop-blur-[14px]",
  // Depth shadows: top-left highlight edge, ambient depth below
  "shadow-[inset_0_1.5px_0_rgba(255,255,255,0.88),inset_1.5px_0_0_rgba(255,255,255,0.55),inset_-1px_-1px_0_rgba(148,163,184,0.1),0_8px_24px_rgba(148,163,184,0.1),0_24px_56px_rgba(148,163,184,0.12),0_40px_80px_rgba(148,163,184,0.08)]",
  // Text
  "text-foreground",
  // Hover: perspective push from upper-left corner into the room
  "transition-[transform,box-shadow,border-color] duration-[380ms] ease-[cubic-bezier(.22,.68,0,1.15)]",
  "hover:[transform:perspective(1100px)_rotateY(1.4deg)_rotateX(-0.8deg)_translate(2px,2px)]",
  "hover:border-white/50",
  "hover:shadow-[inset_2.5px_2.5px_0_rgba(255,255,255,0.95),inset_20px_20px_36px_rgba(148,163,184,0.05),inset_-1px_-1px_0_rgba(148,163,184,0.16),0_8px_24px_rgba(148,163,184,0.1),0_20px_52px_rgba(148,163,184,0.15),0_40px_80px_rgba(148,163,184,0.12)]",
  // Reduced motion
  "motion-reduce:hover:[transform:none]",
  // Dark mode
  "dark:border-white/10",
  "dark:bg-[rgba(8,20,36,0.42)]",
  "dark:shadow-[inset_0_1.5px_0_rgba(255,255,255,0.07),inset_1.5px_0_0_rgba(255,255,255,0.04),0_8px_24px_rgba(2,6,23,0.2),0_24px_56px_rgba(2,6,23,0.24),0_40px_80px_rgba(2,6,23,0.18)]",
  "dark:hover:border-white/16",
  "dark:hover:shadow-[inset_2.5px_2.5px_0_rgba(255,255,255,0.1),inset_20px_20px_32px_rgba(2,6,23,0.36),0_8px_24px_rgba(2,6,23,0.22),0_28px_60px_rgba(2,6,23,0.28),0_44px_84px_rgba(2,6,23,0.24)]",
].join(" ");

/*
  Secondary panel used for the uploading-state row and the recent-document row.
  These live *inside* the single shell and are intentionally more solid than the shell
  itself so they stand out as content rather than a nested structural card.
*/
const uploadWorkspacePanelClassName =
  "relative overflow-hidden rounded-[1.35rem] border border-white/50 bg-white/[0.55] shadow-[inset_0_1px_0_rgba(255,255,255,0.88)] dark:border-white/10 dark:bg-white/[0.06] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]";

export function UploadWorkspace({
  messages,
  initialDocuments,
  onDocumentCreated,
  title,
  description,
  canAccessInfographic = false,
}: UploadWorkspaceProps) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [pending, setPending] = useState(false);
  const [removingDocumentId, setRemovingDocumentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const latestDocument = documents[0] ?? null;
  const activeDocument =
    documents.find((document) => document.isActive) ?? latestDocument;

  useEffect(() => {
    setDocuments(initialDocuments);
  }, [initialDocuments]);

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const file = form.get("file");

    if (!(file instanceof File)) {
      setError(messages.uploadSelectFile);
      return;
    }

    try {
      validateUploadDescriptor({
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });
    } catch (validationError) {
      setError(
        validationError instanceof Error
          ? validationError.message
          : messages.uploadFileNotSupported,
      );
      return;
    }

    setPending(true);
    setError(null);
    setWarnings([]);

    try {
      const requestBody = new FormData();
      requestBody.append("file", file);

      const response = await fetch("/api/uploads", {
        method: "POST",
        body: requestBody,
      });

      const payload = (await response.json()) as ApiResult<UploadResponse>;
      if (!response.ok || !payload.ok) {
        throw new Error(payload.ok ? "UPLOAD_FAILED" : payload.error.message);
      }

      setDocuments((current) => [payload.data.document, ...current]);
      setWarnings(payload.data.warnings);
      onDocumentCreated?.(payload.data.document);
      formElement.reset();
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : messages.uploadFailed,
      );
    } finally {
      setPending(false);
    }
  }

  async function handleRemoveActiveDocument() {
    if (!activeDocument) return;

    if (!window.confirm(messages.uploadRemoveActiveConfirm)) return;

    setRemovingDocumentId(activeDocument.id);
    setError(null);

    try {
      const response = await fetch(
        `/api/uploads?documentId=${encodeURIComponent(activeDocument.id)}`,
        { method: "DELETE", credentials: "same-origin" },
      );
      const payload = (await response.json()) as ApiResult<RemoveDocumentResponse>;

      if (!response.ok || !payload.ok) {
        throw new Error(
          payload.ok ? "DOCUMENT_DELETE_FAILED" : payload.error.message,
        );
      }

      setDocuments(payload.data.documents);
    } catch (removalError) {
      setError(
        removalError instanceof Error
          ? removalError.message
          : messages.uploadRemoveActiveFailed,
      );
    } finally {
      setRemovingDocumentId(null);
    }
  }

  return (
    <div className={uploadShellClassName}>
      {/*
        Decorative depth overlays — pointer-events-none, purely visual.
        Top-left radial: simulates ambient light catching the upper corner.
        Bottom-right radial: recessed shadow edge for depth illusion.
        These are part of the SAME single surface object, not separate slabs.
      */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 rounded-[inherit] overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_8%_10%,rgba(200,225,245,0.22),transparent_42%),radial-gradient(circle_at_94%_92%,rgba(148,163,184,0.1),transparent_40%)] transition-opacity duration-300 group-hover:opacity-[1.15] dark:bg-[radial-gradient(circle_at_8%_10%,rgba(30,60,100,0.32),transparent_44%),radial-gradient(circle_at_94%_92%,rgba(2,6,23,0.18),transparent_40%)]" />
        {/* Top shimmer edge */}
        <div className="absolute top-0 left-[12%] right-[12%] h-px bg-gradient-to-r from-transparent via-white/90 to-transparent dark:via-white/20" />
        {/* Left shimmer edge */}
        <div className="absolute top-[8%] bottom-[8%] left-0 w-px bg-gradient-to-b from-transparent via-white/80 to-transparent dark:via-white/12" />
        {/* Right recessed edge — darker to simulate depth */}
        <div className="absolute top-[15%] bottom-[15%] right-0 w-px bg-gradient-to-b from-transparent via-slate-300/30 to-transparent dark:via-slate-700/40" />
      </div>

      {/* ── Single content area — no inner card wrapper ── */}
      <div className="relative z-10 flex flex-col items-center gap-6 px-6 py-10 sm:px-10 sm:py-12 md:px-12">

        {/* Upload icon */}
        <div className="relative flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center rounded-[1.45rem] border border-white/72 bg-white/60 text-sky-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_12px_28px_rgba(148,163,184,0.14)] dark:border-white/12 dark:bg-white/[0.07] dark:text-cyan-200 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_12px_28px_rgba(2,6,23,0.18)]">
          <div aria-hidden="true" className="absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent dark:via-white/55" />
          <UploadCloud className="h-7 w-7 transition-transform duration-300 group-hover:-translate-y-0.5" />
        </div>

        {/* Title & subtitle */}
        <div className="text-center">
          <h3 className="text-base font-semibold text-foreground sm:text-lg dark:text-white">
            {messages.uploadDropzoneTitle}{" "}
            <span className="text-sky-700 underline decoration-sky-300/60 underline-offset-4 transition-colors group-hover:text-sky-800 group-hover:decoration-sky-400 dark:text-cyan-200 dark:decoration-cyan-200/30 dark:group-hover:decoration-cyan-200">
              {messages.uploadDropzoneBrowse}
            </span>
          </h3>
          <p className="mt-2 text-sm leading-6 text-foreground-muted dark:text-white/58">
            {messages.uploadDropzoneFormats}
          </p>
        </div>

        {/* Format badges */}
        <div className="flex flex-wrap justify-center gap-2">
          {SUPPORTED_UPLOAD_FORMAT_BADGES.map((fmt) => (
            <span
              key={fmt}
              className="inline-flex items-center rounded-full border border-white/60 bg-white/55 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.88)] dark:border-white/10 dark:bg-white/[0.06] dark:text-cyan-100 dark:shadow-none"
            >
              {fmt}
            </span>
          ))}
        </div>

        {/*
          The <label> is a transparent, full-coverage click-target only.
          It has NO background, NO border, NO shadow of its own —
          the outer shell IS the visual surface. This eliminates the nested-card feeling.
        */}
        <label
          htmlFor="file-upload"
          className="absolute inset-0 z-20 cursor-pointer rounded-[inherit]"
          aria-label={messages.uploadDropzoneTitle}
        >
          <form id="upload-form" onSubmit={handleUpload} className="hidden">
            <input
              id="file-upload"
              type="file"
              name="file"
              accept=".pdf,.docx,.xlsx,.xls,.txt,.csv,.png,.jpg,.jpeg,.webp"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  e.target.form?.requestSubmit();
                }
              }}
            />
          </form>
        </label>

        {/* Dashed border indicator — decorative outline only, not a box */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-4 rounded-[1.6rem] border border-dashed border-slate-300/40 dark:border-white/10" />

        {/* ── Status states — rendered below the dropzone content ── */}
        <div className="relative z-30 w-full space-y-5" onClick={(e) => e.stopPropagation()}>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-3 rounded-xl border border-danger/20 bg-danger/10 p-4">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="mt-0.5 h-5 w-5 shrink-0 text-danger" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <p className="text-sm text-danger">{error}</p>
            </div>
          )}

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="space-y-2 rounded-xl border border-amber-400/25 bg-amber-400/8 p-4">
              <h4 className="text-sm font-semibold text-foreground">{messages.uploadWarningsTitle}</h4>
              <ul className="list-inside list-disc space-y-1">
                {warnings.map((w, i) => (
                  <li key={i} className="text-sm text-foreground-muted">{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Uploading */}
          {pending && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-foreground dark:text-white">{messages.uploadUploading}</h4>
              <div className={`${uploadWorkspacePanelClassName} flex flex-col gap-2 p-4`}>
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent-strong">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 animate-pulse">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16h16V8l-6-6z" />
                      <path d="M14 2v6h6" />
                    </svg>
                  </div>
                  <p className="max-w-[200px] truncate text-sm font-medium text-foreground md:max-w-xs dark:text-white">
                    {messages.uploadUploadingDocument}
                  </p>
                </div>
                <div className="mt-1.5 flex w-full items-center gap-3">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
                    <div className="h-full animate-[shimmer_1.5s_infinite] rounded-full bg-accent-strong" style={{ width: "60%" }} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Latest document */}
          {!pending && latestDocument && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-foreground dark:text-white">{messages.uploadRecentUploads}</h4>
              <div className={`${uploadWorkspacePanelClassName} flex items-center gap-3 p-4`}>
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-strong">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16h16V8l-6-6z" />
                    <path d="M14 2v6h6" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground dark:text-white">{latestDocument.fileName}</p>
                  <p className="text-xs text-foreground-muted dark:text-white/55">{formatDocumentSize(latestDocument.sizeBytes)}</p>
                </div>
              </div>
            </div>
          )}

          {/* Active document — continue to assessment */}
          {!pending && activeDocument && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-foreground dark:text-white">
                {messages.uploadActiveDocumentLabel}
              </h4>
              <div className="relative overflow-hidden rounded-[1.6rem] border border-emerald-400/16 bg-white/[0.52] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.88)] dark:bg-[rgba(6,22,34,0.48)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.08),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(125,211,252,0.08),transparent_36%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.12),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(34,211,238,0.09),transparent_36%)]" />
                <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-300">
                        {messages.uploadContinueLabel}
                      </span>
                      <span className="inline-flex items-center rounded-full border border-white/55 bg-white/52 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-foreground-muted dark:border-white/10 dark:bg-white/[0.05] dark:text-white/55">
                        {messages.documentStatusReady}
                      </span>
                    </div>
                    <p className="mt-3 text-base font-semibold text-foreground dark:text-white">
                      {activeDocument.fileName}
                    </p>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-foreground-muted dark:text-white/62">
                      {messages.uploadContinueBody}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Link
                      href={APP_ROUTES.assessment}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent-strong px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_32px_rgba(217,119,6,0.22)] transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_38px_rgba(217,119,6,0.28)] dark:shadow-[0_14px_32px_rgba(16,185,129,0.22)] dark:hover:shadow-[0_18px_38px_rgba(16,185,129,0.28)]"
                    >
                      <BrainCircuit className="h-4 w-4" />
                      {messages.uploadOpenAssessmentAction}
                    </Link>

                    {canAccessInfographic ? (
                      <Link
                        href={APP_ROUTES.infographic}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/65 bg-white/58 px-4 py-3 text-sm font-semibold text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.86)] transition-all hover:-translate-y-0.5 hover:border-amber-300/60 hover:bg-amber-50/85 hover:text-amber-700 dark:border-white/12 dark:bg-white/[0.05] dark:text-white/86 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] dark:hover:border-amber-300/30 dark:hover:bg-amber-400/10 dark:hover:text-amber-100"
                      >
                        <PieChart className="h-4 w-4" />
                        {messages.uploadOpenInfographicAction}
                      </Link>
                    ) : null}

                    <button
                      type="button"
                      onClick={handleRemoveActiveDocument}
                      disabled={removingDocumentId === activeDocument.id}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm font-semibold text-danger transition-all hover:-translate-y-0.5 hover:bg-danger/20"
                    >
                      <Trash2 className="h-4 w-4" />
                      {removingDocumentId === activeDocument.id
                        ? messages.uploadRemovingActiveAction
                        : messages.uploadRemoveActiveAction}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}