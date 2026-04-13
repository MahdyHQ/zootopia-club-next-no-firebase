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

/* This Upload shell is intentionally the single translucent container behind the intake surface.
  Keep these classes scoped to /upload and avoid adding extra backdrop slabs so real depth comes from the protected workspace background.
  Future agents should re-check readability on mobile before increasing transparency. */
const uploadWorkspaceShellClassName =
  "relative mx-auto my-6 flex w-full max-w-3xl flex-col overflow-hidden rounded-[2rem] border border-white/52 bg-[linear-gradient(145deg,rgba(255,255,255,0.54),rgba(255,248,242,0.2))] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.86),0_24px_56px_rgba(148,163,184,0.16)] backdrop-blur-[16px] sm:my-8 dark:border-white/12 dark:bg-[linear-gradient(145deg,rgba(7,20,34,0.5),rgba(3,10,20,0.2))] dark:text-white dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_26px_60px_rgba(2,6,23,0.3)] dark:backdrop-blur-xl";
const uploadWorkspacePanelClassName =
  "relative overflow-hidden rounded-[1.35rem] border border-white/58 bg-[linear-gradient(145deg,rgba(255,255,255,0.52),rgba(250,248,243,0.26))] shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_20px_44px_rgba(148,163,184,0.14)] backdrop-blur-xl dark:border-white/10 dark:bg-[linear-gradient(145deg,rgba(7,18,30,0.46),rgba(3,10,18,0.24))] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_20px_44px_rgba(2,6,23,0.16)] dark:backdrop-blur-lg";

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
    // Capture the submitted form element before awaiting so reset() remains safe after async work.
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
    if (!activeDocument) {
      return;
    }

    if (!window.confirm(messages.uploadRemoveActiveConfirm)) {
      return;
    }

    setRemovingDocumentId(activeDocument.id);
    setError(null);

    try {
      const response = await fetch(
        `/api/uploads?documentId=${encodeURIComponent(activeDocument.id)}`,
        {
          method: "DELETE",
          credentials: "same-origin",
        },
      );
      const payload =
        (await response.json()) as ApiResult<RemoveDocumentResponse>;

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
    <div className={uploadWorkspaceShellClassName}>
      {/* This header controls the Upload page's "Document intake" surface.
          It uses a theme-aware glass tint so light mode feels integrated with the laboratory backdrop while dark mode keeps the premium cool-glass identity.
          Future agents should preserve this Upload-only treatment and verify contrast before increasing transparency further. */}
      <div className="relative border-b border-white/55 bg-[linear-gradient(135deg,rgba(255,255,255,0.78),rgba(243,249,252,0.42))] px-5 py-5 sm:px-7 dark:border-white/10 dark:bg-[linear-gradient(135deg,rgba(7,26,38,0.82),rgba(4,14,26,0.44))]">
        <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-sky-200/90 to-transparent dark:via-cyan-100/70" />
        <h2 className="text-xl font-semibold tracking-tight text-foreground dark:text-white">{title || messages.uploadWorkspaceTitle}</h2>
        {description && (
          <p className="mt-1 text-sm text-foreground-muted dark:text-white/62">{description}</p>
        )}
      </div>

      <div className="relative space-y-6 bg-[linear-gradient(180deg,rgba(255,255,255,0.24),rgba(255,250,245,0.1))] p-5 sm:space-y-7 sm:p-6 md:p-8 dark:bg-[linear-gradient(180deg,rgba(6,17,29,0.34),rgba(3,11,20,0.18))]">
        {/* Dropzone Area */}
        <label
          htmlFor="file-upload"
          className="group relative flex min-h-[250px] w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[1.75rem] border border-dashed border-slate-300/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.66),rgba(247,250,252,0.3))] px-5 py-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.94),0_24px_54px_rgba(148,163,184,0.14)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-sky-300/85 hover:bg-[linear-gradient(145deg,rgba(255,255,255,0.78),rgba(240,249,255,0.38))] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.98),0_28px_64px_rgba(125,211,252,0.16)] sm:min-h-[280px] sm:px-8 sm:py-10 dark:border-white/16 dark:bg-[linear-gradient(145deg,rgba(7,19,33,0.38),rgba(3,10,18,0.18))] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_24px_54px_rgba(2,6,23,0.12)] dark:hover:border-cyan-300/28 dark:hover:bg-[linear-gradient(145deg,rgba(8,24,39,0.46),rgba(4,13,23,0.22))] dark:hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_28px_64px_rgba(2,6,23,0.18)]"
        >
          {/* This dropzone aura keeps the primary intake action visually elevated on /upload while leaving the actual file input semantics and hit-area untouched.
              Keep these overlays decorative and behind the content so accessibility and touch targets remain stable across mobile, tablet, and desktop. */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent dark:via-white/70" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(125,211,252,0.2),transparent_58%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.54),transparent_42%)] opacity-90 transition-opacity duration-300 group-hover:opacity-100 dark:bg-[radial-gradient(circle_at_top,rgba(45,212,191,0.16),transparent_56%)] dark:opacity-80" />
            <div className="absolute inset-y-10 left-0 w-px bg-gradient-to-b from-transparent via-white/85 to-transparent opacity-80 dark:via-white/14" />
            <div className="absolute inset-y-10 right-0 w-px bg-gradient-to-b from-transparent via-sky-200/80 to-transparent opacity-75 dark:via-cyan-200/14" />
          </div>

          <div className="relative z-10 flex flex-col items-center justify-center space-y-4 px-2 text-center sm:px-4">
            <div className="relative mb-2 flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-[1.45rem] border border-white/75 bg-white/70 text-sky-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_18px_38px_rgba(148,163,184,0.16)] dark:border-white/12 dark:bg-white/[0.06] dark:text-cyan-200 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_40px_rgba(2,6,23,0.2)]">
              <div aria-hidden="true" className="absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent dark:via-white/60" />
              <UploadCloud className="h-7 w-7 transition-transform duration-300 group-hover:-translate-y-0.5" />
            </div>

            <h3 className="text-base font-semibold text-foreground sm:text-lg dark:text-white">
              {messages.uploadDropzoneTitle}{" "}
              <span className="text-sky-700 underline decoration-sky-300/60 underline-offset-4 transition-colors group-hover:text-sky-800 group-hover:decoration-sky-400 dark:text-cyan-200 dark:decoration-cyan-200/30 dark:group-hover:decoration-cyan-200">
                {messages.uploadDropzoneBrowse}
              </span>
            </h3>
            <p className="max-w-xl text-sm leading-6 text-foreground-muted dark:text-white/62">
              {messages.uploadDropzoneFormats}
            </p>
            <div className="mt-1 flex flex-wrap justify-center gap-2">
              {SUPPORTED_UPLOAD_FORMAT_BADGES.map((fmt) => (
                <span key={fmt} className="inline-flex items-center rounded-full border border-white/65 bg-white/72 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] dark:border-white/10 dark:bg-white/[0.05] dark:text-cyan-100 dark:shadow-none">
                  {fmt}
                </span>
              ))}
            </div>
          </div>
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

        {/* Error state */}
        {error && (
          <div className="rounded-xl border border-danger/20 bg-danger/10 p-4 flex items-start gap-3">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5 text-danger shrink-0 mt-0.5" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p className="text-sm text-danger">{error}</p>
          </div>
        )}

        {/* Warnings from upload response */}
        {warnings.length > 0 && (
          <div className="rounded-xl border border-gold/30 bg-gold/5 p-4 space-y-2">
            <h4 className="text-sm font-semibold text-foreground">{messages.uploadWarningsTitle}</h4>
            <ul className="list-disc list-inside space-y-1">
              {warnings.map((w, i) => (
                <li key={i} className="text-sm text-foreground-muted">{w}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Uploading state */}
        {pending && (
           <div className="space-y-4">
             <h4 className="text-sm font-semibold text-foreground dark:text-white">{messages.uploadUploading}</h4>
             <div className="flex flex-col gap-3">
               <div className={`${uploadWorkspacePanelClassName} flex flex-col gap-2 p-4`}>
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent-strong">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 animate-pulse"><path d="M14 2H6a2 2 0 0 0-2 2v16h16V8l-6-6z"/><path d="M14 2v6h6"/></svg>
                    </div>
                    <div>
                      <p className="max-w-[200px] truncate text-sm font-medium text-foreground md:max-w-xs dark:text-white">{messages.uploadUploadingDocument}</p>
                    </div>
                  </div>
                  {/* Progress bar (indeterminate) */}
                 <div className="w-full flex items-center gap-3 mt-1.5">
                    <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
                       <div className="h-full rounded-full bg-accent-strong animate-[shimmer_1.5s_infinite]" style={{ width: "60%" }}></div>
                    </div>
                 </div>
               </div>
             </div>
           </div>
        )}

        {/* Latest uploaded document */}
        {!pending && latestDocument && (
           <div className="space-y-4">
             <h4 className="mt-4 text-sm font-semibold text-foreground dark:text-white">{messages.uploadRecentUploads}</h4>
             <div className="flex flex-col gap-3">
               <div className={`${uploadWorkspacePanelClassName} flex items-center gap-3 p-4`}>
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-strong">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M14 2H6a2 2 0 0 0-2 2v16h16V8l-6-6z"/><path d="M14 2v6h6"/></svg>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground dark:text-white">{latestDocument.fileName}</p>
                    <p className="text-xs text-foreground-muted dark:text-white/58">{formatDocumentSize(latestDocument.sizeBytes)}</p>
                  </div>
               </div>
             </div>
           </div>
        )}

        {!pending && activeDocument ? (
          <div className="space-y-4">
            {/* Upload owns the active-document continuity card so users can keep moving into Assessment without relinking the same file elsewhere. */}
            <h4 className="text-sm font-semibold text-foreground dark:text-white">
              {messages.uploadActiveDocumentLabel}
            </h4>
            <div className="relative overflow-hidden rounded-[1.6rem] border border-emerald-400/18 bg-[linear-gradient(145deg,rgba(255,255,255,0.74),rgba(236,253,245,0.3))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_24px_56px_rgba(148,163,184,0.16)] backdrop-blur-xl dark:bg-[linear-gradient(145deg,rgba(6,22,34,0.62),rgba(3,10,19,0.26))] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_24px_56px_rgba(2,6,23,0.22)]">
              {/* This active-document glow preserves the continue-to-next-step hierarchy for /upload.
                  It exists to make the ready document feel like the top actionable layer while keeping the existing routing and server-owned state untouched.
                  Future agents should preserve the relative z-index split here so the decorative glow never blocks buttons or document metadata. */}
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.12),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(125,211,252,0.14),transparent_36%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.18),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(34,211,238,0.12),transparent_36%)]" />
              <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-300">
                      {messages.uploadContinueLabel}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-white/60 bg-white/58 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-foreground-muted dark:border-white/10 dark:bg-white/[0.05] dark:text-white/58">
                      {messages.documentStatusReady}
                    </span>
                  </div>
                  <p className="mt-3 text-base font-semibold text-foreground dark:text-white">
                    {activeDocument.fileName}
                  </p>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-foreground-muted dark:text-white/64">
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
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/70 bg-white/64 px-4 py-3 text-sm font-semibold text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.86)] transition-all hover:-translate-y-0.5 hover:border-amber-300/60 hover:bg-amber-50/85 hover:text-amber-700 dark:border-white/12 dark:bg-white/[0.05] dark:text-white/86 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] dark:hover:border-amber-300/30 dark:hover:bg-amber-400/10 dark:hover:text-amber-100"
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
        ) : null}
      </div>
    </div>
  );
}
