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
import { BrainCircuit, PieChart, Trash2 } from "lucide-react";

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
    const form = new FormData(event.currentTarget);
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
      event.currentTarget.reset();
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
    <div className="w-full max-w-3xl mx-auto rounded-3xl border border-border bg-card text-card-foreground shadow-2xl overflow-hidden flex flex-col my-8">
      {/* Header */}
      <div className="px-6 py-5 border-b border-border/50">
        <h2 className="text-xl font-semibold text-foreground">{title || messages.uploadWorkspaceTitle}</h2>
        {description && (
          <p className="text-sm text-foreground-muted mt-1">{description}</p>
        )}
      </div>

      <div className="p-6 md:p-8 space-y-8 bg-background/50">
        {/* Dropzone Area */}
        <label
          htmlFor="file-upload"
          className="group relative flex flex-col items-center justify-center w-full h-[240px] rounded-2xl border-2 border-dashed border-border-strong bg-background-elevated/50 hover:bg-accent/5 hover:border-accent/50 transition-all cursor-pointer overflow-hidden"
        >
          <div className="flex flex-col items-center justify-center text-center space-y-4 relative z-10 px-4">
            {/* Icons Graphic */}
            <div className="relative flex flex-col items-center justify-center h-20 w-32 mb-2">
              <div className="absolute top-0 right-4 flex items-center gap-2 bg-background-strong border border-border rounded-lg p-2 shadow-sm transform translate-x-4 -rotate-2 group-hover:rotate-0 transition-transform duration-300">
                <div className="w-6 h-6 rounded bg-blue-500/20 text-blue-500 flex items-center justify-center shrink-0">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path d="M14 2H6a2 2 0 0 0-2 2v16h16V8l-6-6z"/><path d="M14 2v6h6"/></svg>
                </div>
                <div className="space-y-1.5 w-12">
                  <div className="h-1.5 w-full bg-border rounded-full" />
                  <div className="h-1.5 w-2/3 bg-border rounded-full" />
                </div>
              </div>
              <div className="absolute bottom-2 left-0 flex items-center gap-2 bg-background-strong border border-border rounded-lg p-2 shadow-md transform -translate-x-2 rotate-3 group-hover:rotate-0 transition-transform duration-300 z-10">
                <div className="w-6 h-6 rounded bg-pink-500/10 text-pink-500 shrink-0 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                </div>
                <div className="space-y-1.5 w-16">
                  <div className="h-1.5 w-full bg-border rounded-full" />
                  <div className="h-1.5 w-3/4 bg-border rounded-full" />
                </div>
              </div>
            </div>

            <h3 className="text-base font-medium text-foreground">
              {messages.uploadDropzoneTitle}{" "}
              <span className="text-accent underline underline-offset-4 decoration-accent/30 group-hover:decoration-accent transition-colors">{messages.uploadDropzoneBrowse}</span>
            </h3>
            <p className="text-sm text-foreground-muted">
              {messages.uploadDropzoneFormats}
            </p>
            <div className="flex flex-wrap justify-center gap-1.5 mt-1">
              {SUPPORTED_UPLOAD_FORMAT_BADGES.map((fmt) => (
                <span key={fmt} className="inline-flex items-center rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent">
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
             <h4 className="text-sm font-semibold text-foreground">{messages.uploadUploading}</h4>
             <div className="flex flex-col gap-3">
               <div className="flex flex-col gap-2 rounded-xl bg-background-elevated border border-border p-4 relative overflow-hidden">
                 <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 animate-pulse"><path d="M14 2H6a2 2 0 0 0-2 2v16h16V8l-6-6z"/><path d="M14 2v6h6"/></svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground truncate max-w-[200px] md:max-w-xs">{messages.uploadUploadingDocument}</p>
                    </div>
                 </div>
                 {/* Progress bar (indeterminate) */}
                 <div className="w-full flex items-center gap-3 mt-1.5">
                    <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
                       <div className="h-full bg-accent rounded-full animate-[shimmer_1.5s_infinite]" style={{ width: "60%" }}></div>
                    </div>
                 </div>
               </div>
             </div>
           </div>
        )}

        {/* Latest uploaded document */}
        {!pending && latestDocument && (
           <div className="space-y-4">
             <h4 className="text-sm font-semibold text-foreground mt-4">{messages.uploadRecentUploads}</h4>
             <div className="flex flex-col gap-3">
               <div className="flex items-center gap-3 rounded-xl bg-background-elevated border border-border p-4">
                  <div className="h-8 w-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center shrink-0">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M14 2H6a2 2 0 0 0-2 2v16h16V8l-6-6z"/><path d="M14 2v6h6"/></svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{latestDocument.fileName}</p>
                    <p className="text-xs text-foreground-muted">{formatDocumentSize(latestDocument.sizeBytes)}</p>
                  </div>
               </div>
             </div>
           </div>
        )}

        {!pending && activeDocument ? (
          <div className="space-y-4">
            {/* Upload owns the active-document continuity card so users can keep moving into Assessment without relinking the same file elsewhere. */}
            <h4 className="text-sm font-semibold text-foreground">
              {messages.uploadActiveDocumentLabel}
            </h4>
            <div className="rounded-2xl border border-emerald-500/15 bg-[linear-gradient(145deg,rgba(16,185,129,0.08),rgba(15,23,42,0.03))] p-5 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-300">
                      {messages.uploadContinueLabel}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-border bg-background-strong px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-foreground-muted">
                      {messages.documentStatusReady}
                    </span>
                  </div>
                  <p className="mt-3 text-base font-semibold text-foreground">
                    {activeDocument.fileName}
                  </p>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-foreground-muted">
                    {messages.uploadContinueBody}
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Link
                    href={APP_ROUTES.assessment}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_32px_rgba(16,185,129,0.22)] transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_38px_rgba(16,185,129,0.28)]"
                  >
                    <BrainCircuit className="h-4 w-4" />
                    {messages.uploadOpenAssessmentAction}
                  </Link>

                  {canAccessInfographic ? (
                    <Link
                      href={APP_ROUTES.infographic}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-700 transition-all hover:-translate-y-0.5 hover:border-amber-500/35 hover:bg-amber-500/14 dark:text-amber-200"
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
