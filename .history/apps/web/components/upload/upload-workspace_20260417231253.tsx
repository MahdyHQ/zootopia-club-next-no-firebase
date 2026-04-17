"use client";

import { APP_ROUTES } from "@zootopia/shared-config";
import type {
  ApiResult,
  DocumentRecord,
  RemoveDocumentResponse,
  UploadResponse,
} from "@zootopia/shared-types";
import { validateUploadDescriptor } from "@zootopia/shared-utils";
import type { ChangeEvent, DragEvent, KeyboardEvent } from "react";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { BrainCircuit, PieChart, Trash2, UploadCloud } from "lucide-react";

import { AuthSupportDetails } from "@/components/auth/auth-status";
import type { AppMessages } from "@/lib/messages";
import {
  createOperationalUiError,
  getOperationalSupportNotes,
  type OperationalUiError,
} from "@/lib/operational-support";
import { getSupabaseClient, isSupabaseWebConfigured } from "@/lib/supabase/client";
import { SUPPORTED_UPLOAD_FORMAT_BADGES } from "@/lib/upload";
import { cn } from "@/lib/utils";

type UploadWorkspaceProps = {
  messages: AppMessages;
  initialDocuments: DocumentRecord[];
  onDocumentCreated?: (document: DocumentRecord) => void;
  title?: string;
  description?: string;
  canAccessInfographic?: boolean;
};

type UploadPrepareResponse = {
  documentId: string;
  bucket: string;
  objectPath: string;
  uploadToken: string;
};

type ApiRequestError = Error & {
  code?: string;
  status?: number;
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

const uploadAcceptValue = ".pdf,.docx,.xlsx,.xls,.txt,.csv,.png,.jpg,.jpeg,.webp";

function prependWorkspaceDocument(
  currentDocuments: DocumentRecord[],
  nextDocument: DocumentRecord,
) {
  return [
    nextDocument,
    ...currentDocuments.filter((document) => document.id !== nextDocument.id),
  ];
}

function createApiRequestError(
  message: string,
  options: {
    code?: string;
    status?: number;
  } = {},
) {
  return Object.assign(new Error(message), options) as ApiRequestError;
}

function resolveResponseFallbackMessage(
  response: Response,
  rawBody: string,
  fallbackMessage: string,
) {
  const trimmedBody = rawBody.trim();

  if (
    response.status === 413
    || /request entity too large|payload too large|body exceeded|function_payload_too_large/i.test(
      trimmedBody,
    )
  ) {
    return "The upload request was too large for the server proxy path.";
  }

  if (trimmedBody && !/^<!doctype html|^<html/i.test(trimmedBody)) {
    return trimmedBody;
  }

  if (response.statusText.trim()) {
    return response.statusText;
  }

  return fallbackMessage;
}

async function readApiResultSafely<T>(
  response: Response,
  fallbackMessage: string,
): Promise<ApiResult<T>> {
  const rawBody = await response.text();

  if (!rawBody.trim()) {
    return {
      ok: false,
      error: {
        code: "EMPTY_RESPONSE",
        message: response.ok ? fallbackMessage : response.statusText || fallbackMessage,
      },
    };
  }

  try {
    return JSON.parse(rawBody) as ApiResult<T>;
  } catch {
    return {
      ok: false,
      error: {
        code: "INVALID_RESPONSE",
        message: resolveResponseFallbackMessage(response, rawBody, fallbackMessage),
      },
    };
  }
}

async function readApiData<T>(
  response: Response,
  fallbackMessage: string,
) {
  const payload = await readApiResultSafely<T>(response, fallbackMessage);
  if (!response.ok || !payload.ok) {
    throw createApiRequestError(
      payload.ok ? fallbackMessage : payload.error.message,
      {
        code: payload.ok ? "REQUEST_FAILED" : payload.error.code,
        status: response.status,
      },
    );
  }

  return payload.data;
}

function shouldUseLegacyUploadFallback(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const code =
    typeof error === "object" && error && "code" in error
      ? (error as { code?: unknown }).code
      : undefined;

  return (
    code === "UPLOAD_DIRECT_UNAVAILABLE"
    || code === "SUPABASE_WEB_CONFIG_MISSING"
    || /no api key found in request/i.test(message)
  );
}

function shouldShowUploadOperationalSupport(error: unknown) {
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code || "")
      : "";
  if (
    code === "INVALID_UPLOAD_DESCRIPTOR"
    || code === "DOCUMENT_NOT_FOUND"
    || code === "DOCUMENT_ID_REQUIRED"
    || code === "PROFILE_INCOMPLETE"
    || code === "UNAUTHENTICATED"
  ) {
    return false;
  }

  const message = error instanceof Error ? error.message : String(error);
  return ![
    "No file selected.",
    "File is empty.",
    "File too large. Max size is 50MB.",
    "Unsupported file format.",
  ].includes(message);
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
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepthRef = useRef(0);
  const [documents, setDocuments] = useState(initialDocuments);
  const [pending, setPending] = useState(false);
  const [removingDocumentId, setRemovingDocumentId] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [error, setError] = useState<OperationalUiError | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const customTitle = title?.trim() || null;
  const resolvedTitle = customTitle || messages.uploadDropzoneTitle;
  const resolvedDescription = description?.trim() || messages.uploadDropzoneFormats;
  const latestDocument = documents[0] ?? null;
  const activeDocument =
    documents.find((document) => document.isActive) ?? latestDocument;
  const isBusy = pending || removingDocumentId !== null;

  useEffect(() => {
    setDocuments(initialDocuments);
  }, [initialDocuments]);

  useEffect(() => {
    if (!pending) {
      return;
    }

    dragDepthRef.current = 0;
    setIsDragActive(false);
  }, [pending]);

  function resetFilePicker() {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function isFileDrag(event: DragEvent<HTMLElement>) {
    return Array.from(event.dataTransfer?.types ?? []).includes("Files");
  }

  async function uploadViaMultipartProxy(file: File) {
    const requestBody = new FormData();
    requestBody.append("file", file);

    const response = await fetch("/api/uploads", {
      method: "POST",
      body: requestBody,
    });

    return readApiData<UploadResponse>(response, messages.uploadFailed);
  }

  async function uploadViaDirectStorage(file: File) {
    if (!isSupabaseWebConfigured()) {
      throw createApiRequestError("Secure direct uploads are unavailable.", {
        code: "SUPABASE_WEB_CONFIG_MISSING",
      });
    }

    const prepareResponse = await fetch("/api/uploads", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode: "prepare",
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      }),
    });
    const preparePayload = await readApiData<UploadPrepareResponse>(
      prepareResponse,
      messages.uploadFailed,
    );

    /* Direct upload still belongs to the authenticated /upload owner. The server prepares the
       document id + owner-scoped path first, and the browser only receives a signed token for
       that exact object so drag/drop and browse stay on the same isolated contract. */
    const { error } = await getSupabaseClient().storage
      .from(preparePayload.bucket)
      .uploadToSignedUrl(
        preparePayload.objectPath,
        preparePayload.uploadToken,
        file,
        {
          contentType: file.type || "application/octet-stream",
          upsert: true,
        },
      );

    if (error) {
      throw createApiRequestError(error.message || messages.uploadFailed, {
        code: "UPLOAD_TO_SIGNED_URL_FAILED",
      });
    }

    const completeResponse = await fetch("/api/uploads", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode: "complete",
        documentId: preparePayload.documentId,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      }),
    });

    return readApiData<UploadResponse>(completeResponse, messages.uploadFailed);
  }

  /* UploadWorkspace promises both browse-click and drag/drop intake on the protected /upload
     route. Keep all file-entry paths funneled through this one request helper so validation,
     warning handling, retries, and future upload instrumentation never drift between input modes. */
  async function uploadSelectedFile(file: File) {
    if (isBusy) {
      return;
    }

    try {
      validateUploadDescriptor({
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });
    } catch (validationError) {
      resetFilePicker();
      setError(
        createOperationalUiError(
          validationError instanceof Error
            ? validationError.message
            : messages.uploadFileNotSupported,
          false,
        ),
      );
      return;
    }

    setPending(true);
    setError(null);
    setWarnings([]);

    try {
      let payload: UploadResponse;

      try {
        payload = await uploadViaDirectStorage(file);
      } catch (directUploadError) {
        if (!shouldUseLegacyUploadFallback(directUploadError)) {
          throw directUploadError;
        }

        payload = await uploadViaMultipartProxy(file);
      }

      setWarnings(payload.warnings);
      setDocuments((current) =>
        prependWorkspaceDocument(current, payload.document),
      );
      onDocumentCreated?.(payload.document);
    } catch (uploadError) {
      setError(
        createOperationalUiError(
          uploadError instanceof Error ? uploadError.message : messages.uploadFailed,
          shouldShowUploadOperationalSupport(uploadError),
        ),
      );
    } finally {
      resetFilePicker();
      setPending(false);
    }
  }

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    void uploadSelectedFile(file);
  }

  function handleDragEnter(event: DragEvent<HTMLDivElement>) {
    if (isBusy || !isFileDrag(event)) {
      return;
    }

    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDragActive(true);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (isBusy || !isFileDrag(event)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";

    if (!isDragActive) {
      setIsDragActive(true);
    }
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    if (isBusy || !isFileDrag(event)) {
      return;
    }

    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);

    if (dragDepthRef.current === 0) {
      setIsDragActive(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    if (isBusy || !isFileDrag(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setIsDragActive(false);

    const file = event.dataTransfer.files?.[0];
    if (!file) {
      setError(createOperationalUiError(messages.uploadSelectFile, false));
      return;
    }

    void uploadSelectedFile(file);
  }

  function handleOverlayKeyDown(event: KeyboardEvent<HTMLLabelElement>) {
    if (isBusy) {
      return;
    }

    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    fileInputRef.current?.click();
  }

  async function handleRemoveActiveDocument() {
    if (!activeDocument) return;

    if (!window.confirm(messages.uploadRemoveActiveConfirm)) return;

    setRemovingDocumentId(activeDocument.id);
    setError(null);
    setWarnings([]);

    try {
      const response = await fetch(
        `/api/uploads?documentId=${encodeURIComponent(activeDocument.id)}`,
        { method: "DELETE", credentials: "same-origin" },
      );
      const payload = await readApiData<RemoveDocumentResponse>(
        response,
        messages.uploadRemoveActiveFailed,
      );

      setDocuments(payload.documents);
    } catch (removalError) {
      setError(
        createOperationalUiError(
          removalError instanceof Error
            ? removalError.message
            : messages.uploadRemoveActiveFailed,
          shouldShowUploadOperationalSupport(removalError),
        ),
      );
    } finally {
      setRemovingDocumentId(null);
    }
  }

  return (
    <div
      className={cn(
        uploadShellClassName,
        isDragActive && [
          "border-sky-400/70 bg-white/[0.34]",
          "shadow-[inset_0_1.5px_0_rgba(255,255,255,0.95),inset_0_0_0_1px_rgba(56,189,248,0.18),0_12px_28px_rgba(56,189,248,0.1),0_28px_60px_rgba(148,163,184,0.14)]",
          "dark:border-cyan-300/28 dark:bg-[rgba(8,24,40,0.5)] dark:shadow-[inset_0_1.5px_0_rgba(255,255,255,0.09),inset_0_0_0_1px_rgba(34,211,238,0.12),0_14px_30px_rgba(2,6,23,0.26),0_30px_64px_rgba(2,6,23,0.28)]",
        ],
      )}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
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
            {customTitle ? (
              resolvedTitle
            ) : (
              <>
                {resolvedTitle}{" "}
                <span className="text-sky-700 underline decoration-sky-300/60 underline-offset-4 transition-colors group-hover:text-sky-800 group-hover:decoration-sky-400 dark:text-cyan-200 dark:decoration-cyan-200/30 dark:group-hover:decoration-cyan-200">
                  {messages.uploadDropzoneBrowse}
                </span>
              </>
            )}
          </h3>
          <p className="mt-2 text-sm leading-6 text-foreground-muted dark:text-white/58">
            {resolvedDescription}
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
          htmlFor={fileInputId}
          role="button"
          tabIndex={isBusy ? -1 : 0}
          aria-disabled={isBusy}
          onKeyDown={handleOverlayKeyDown}
          className={cn(
            "absolute inset-0 z-20 cursor-pointer rounded-[inherit] focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 focus-visible:ring-offset-4 focus-visible:ring-offset-transparent dark:focus-visible:ring-cyan-300/40",
            isBusy && "pointer-events-none",
          )}
          aria-label={messages.uploadDropzoneTitle}
        >
          <input
            ref={fileInputRef}
            id={fileInputId}
            type="file"
            name="file"
            accept={uploadAcceptValue}
            disabled={isBusy}
            className="hidden"
            onChange={handleFileInputChange}
          />
        </label>

        {/* Dashed border indicator — decorative outline only, not a box */}
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-4 rounded-[1.6rem] border border-dashed border-slate-300/40 transition-colors duration-200 dark:border-white/10",
            isDragActive &&
              "border-sky-400/55 dark:border-cyan-300/28",
          )}
        />

        {/* ── Status states — rendered below the dropzone content ── */}
        <div className="relative z-30 w-full space-y-5" onClick={(e) => e.stopPropagation()}>

          {/* Error */}
          {error && (
            <div role="alert" className="flex items-start gap-3 rounded-xl border border-danger/20 bg-danger/10 p-4">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="mt-0.5 h-5 w-5 shrink-0 text-danger" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <div className="min-w-0 space-y-3">
                <p className="text-sm text-danger">{error.message}</p>
                {error.showSupport ? (
                  <AuthSupportDetails
                    label={messages.operationalSupportDetailsLabel}
                    notes={getOperationalSupportNotes(messages)}
                  />
                ) : null}
              </div>
            </div>
          )}

          {/* Warnings */}
          {warnings.length > 0 && (
            <div role="status" aria-live="polite" className="space-y-2 rounded-xl border border-amber-400/25 bg-amber-400/8 p-4">
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
            <div role="status" aria-live="polite" className="space-y-3">
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
                  {/* Recent-upload names must first wrap and then clamp with ellipsis so list cards keep a stable height on every viewport. */}
                  <p
                    className="line-clamp-2 break-words text-sm font-medium text-foreground [overflow-wrap:anywhere] dark:text-white"
                    title={latestDocument.fileName}
                  >
                    {latestDocument.fileName}
                  </p>
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
                    {/* Active document names must stay inside this shared CTA surface; clamp after wrapping to avoid overgrowing the action rail block. */}
                    <p
                      className="mt-3 line-clamp-2 break-words text-base font-semibold text-foreground [overflow-wrap:anywhere] dark:text-white"
                      title={activeDocument.fileName}
                    >
                      {activeDocument.fileName}
                    </p>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-foreground-muted dark:text-white/62">
                      {messages.uploadContinueBody}
                    </p>
                  </div>

                  <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap">
                    <Link
                      href={APP_ROUTES.assessment}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent-strong px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_32px_rgba(217,119,6,0.22)] transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_38px_rgba(217,119,6,0.28)] sm:w-auto dark:shadow-[0_14px_32px_rgba(16,185,129,0.22)] dark:hover:shadow-[0_18px_38px_rgba(16,185,129,0.28)]"
                    >
                      <BrainCircuit className="h-4 w-4" />
                      {messages.uploadOpenAssessmentAction}
                    </Link>

                    {canAccessInfographic ? (
                      <Link
                        href={APP_ROUTES.infographic}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/65 bg-white/58 px-4 py-3 text-sm font-semibold text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.86)] transition-all hover:-translate-y-0.5 hover:border-amber-300/60 hover:bg-amber-50/85 hover:text-amber-700 sm:w-auto dark:border-white/12 dark:bg-white/[0.05] dark:text-white/86 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] dark:hover:border-amber-300/30 dark:hover:bg-amber-400/10 dark:hover:text-amber-100"
                      >
                        <PieChart className="h-4 w-4" />
                        {messages.uploadOpenInfographicAction}
                      </Link>
                    ) : null}

                    <button
                      type="button"
                      onClick={handleRemoveActiveDocument}
                      disabled={isBusy}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm font-semibold text-danger transition-all hover:-translate-y-0.5 hover:bg-danger/20 sm:w-auto disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
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
