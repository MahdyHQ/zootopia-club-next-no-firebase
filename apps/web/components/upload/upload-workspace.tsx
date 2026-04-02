"use client";

import type { ApiResult, DocumentRecord, UploadResponse } from "@zootopia/shared-types";
import { validateUploadDescriptor } from "@zootopia/shared-utils";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";

import type { AppMessages } from "@/lib/messages";
import { SUPPORTED_UPLOAD_FORMAT_BADGES } from "@/lib/upload";

type UploadWorkspaceProps = {
  messages: AppMessages;
  initialDocuments: DocumentRecord[];
  onDocumentCreated?: (document: DocumentRecord) => void;
  title?: string;
  description?: string;
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
}: UploadWorkspaceProps) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const latestDocument = documents[0] ?? null;

  useEffect(() => {
    setDocuments(initialDocuments);
  }, [initialDocuments]);

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("file");

    if (!(file instanceof File)) {
      setError("Select a file before uploading.");
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
          : "This file is not supported.",
      );
      return;
    }

    setPending(true);
    setError(null);

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
        uploadError instanceof Error ? uploadError.message : "Upload failed.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="w-full max-w-3xl mx-auto rounded-3xl border border-border bg-card text-card-foreground shadow-2xl overflow-hidden flex flex-col my-8">
      {/* Header */}
      <div className="px-6 py-5 border-b border-border/50">
        <h2 className="text-xl font-semibold text-foreground">Upload files</h2>
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
              Drag and drop files here, or <span className="text-accent underline underline-offset-4 decoration-accent/30 group-hover:decoration-accent transition-colors">browse</span>
            </h3>
            <p className="text-sm text-foreground-muted">
              Supports .pdf, .docx, .xlsx, .png, .jpg up to 10MB
            </p>
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

        {/* Uploading / Uploaded Files pseudo-preview */}
        {pending && (
           <div className="space-y-4">
             <h4 className="text-sm font-semibold text-foreground">Uploading files...</h4>
             <div className="flex flex-col gap-3">
               <div className="flex flex-col gap-2 rounded-xl bg-background-elevated border border-border p-4 relative overflow-hidden">
                 <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 animate-pulse"><path d="M14 2H6a2 2 0 0 0-2 2v16h16V8l-6-6z"/><path d="M14 2v6h6"/></svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground truncate max-w-[200px] md:max-w-xs">Uploading document...</p>
                        <p className="text-xs text-foreground-muted">--</p>
                      </div>
                    </div>
                    {/* Fake Cancel cross */}
                    <button type="button" className="text-foreground-muted hover:text-foreground p-1 transition-colors">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                 </div>
                 {/* Progress bar */}
                 <div className="w-full flex items-center gap-3 mt-1.5">
                    <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
                       <div className="h-full bg-accent w-1/2 rounded-full animate-[shimmer_1.5s_infinite]"></div>
                    </div>
                    <span className="text-xs font-medium text-foreground-muted w-8 text-right">50%</span>
                 </div>
               </div>
             </div>
           </div>
        )}

        {!pending && latestDocument && (
           <div className="space-y-4">
             <h4 className="text-sm font-semibold text-foreground mt-4">Recent Uploads</h4>
             <div className="flex flex-col gap-3">
               <div className="flex items-center justify-between rounded-xl bg-background-elevated border border-border p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M14 2H6a2 2 0 0 0-2 2v16h16V8l-6-6z"/><path d="M14 2v6h6"/></svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground truncate max-w-[200px] md:max-w-xs">{latestDocument.fileName}</p>
                      <p className="text-xs text-foreground-muted">{formatDocumentSize(latestDocument.sizeBytes)}</p>
                    </div>
                  </div>
                  <button type="button" className="text-foreground-muted hover:text-danger p-1 transition-colors">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M18 6L6 18M6 6l12 12"/></svg>
                  </button>
               </div>
             </div>
           </div>
        )}

        {/* OR Divider */}
        <div className="relative py-4">
          <div className="absolute inset-0 flex items-center" aria-hidden="true">
            <div className="w-full border-t border-border"></div>
          </div>
          <div className="relative flex justify-center">
            <span className="bg-background/50 backdrop-blur-md px-4 text-xs font-semibold text-foreground-muted uppercase tracking-wider">OR</span>
          </div>
        </div>

        {/* Import from link */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-foreground">Import from link</h4>
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <input 
                type="url" 
                placeholder="Add link to upload" 
                className="w-full h-11 px-4 bg-background-elevated border border-border text-foreground text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-all placeholder:text-foreground-muted/60"
              />
            </div>
            <button type="button" className="h-11 px-5 rounded-xl bg-background-strong border border-border text-foreground text-sm font-semibold hover:bg-background-elevated hover:border-border-strong transition-all focus:outline-none focus:ring-2 focus:ring-foreground/20 shrink-0">
              Upload
            </button>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="px-6 py-5 bg-background-elevated/30 border-t border-border flex items-center justify-end gap-3 rounded-b-3xl">
        <button type="button" className="h-10 px-5 rounded-xl bg-transparent text-foreground-muted text-sm font-semibold hover:text-foreground hover:bg-foreground/5 transition-all">
          Cancel
        </button>
        <button type="button" className="h-10 px-6 rounded-xl bg-foreground text-background text-sm font-semibold shadow-sm hover:bg-foreground/90 transition-all focus:outline-none focus:ring-2 focus:ring-foreground/30">
          Confirm
        </button>
      </div>

    </div>
  );
}

