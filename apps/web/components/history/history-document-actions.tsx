"use client";

import { Download, LoaderCircle, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { AppMessages } from "@/lib/messages";

type HistoryDocumentActionsProps = {
  documentId: string;
  canDownload: boolean;
  messages: AppMessages;
};

export function HistoryDocumentActions({
  documentId,
  canDownload,
  messages,
}: HistoryDocumentActionsProps) {
  const router = useRouter();
  const [pendingDelete, setPendingDelete] = useState(false);

  async function handleDelete() {
    setPendingDelete(true);

    try {
      const response = await fetch(`/api/uploads?documentId=${encodeURIComponent(documentId)}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("DOCUMENT_DELETE_FAILED");
      }

      router.refresh();
    } finally {
      setPendingDelete(false);
    }
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-1.5 md:w-auto md:flex-row md:flex-wrap">
      {canDownload ? (
        <a
          href={`/api/uploads/${encodeURIComponent(documentId)}`}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-border-strong bg-background-strong px-2.5 py-1.5 text-[11px] font-semibold text-foreground transition hover:border-emerald-500/30 hover:text-emerald-700 md:w-auto md:px-3 md:text-xs dark:hover:text-emerald-200"
        >
          <Download className="h-3.5 w-3.5" />
          {messages.historyDownloadSource}
        </a>
      ) : null}
      <button
        type="button"
        disabled={pendingDelete}
        onClick={() => {
          void handleDelete();
        }}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-danger/20 bg-danger/5 px-2.5 py-1.5 text-[11px] font-semibold text-danger transition hover:bg-danger/10 md:w-auto md:px-3 md:text-xs disabled:cursor-not-allowed disabled:opacity-70"
      >
        {pendingDelete ? (
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Trash2 className="h-3.5 w-3.5" />
        )}
        {messages.historyRemoveItem}
      </button>
    </div>
  );
}
