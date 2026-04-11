import "server-only";

import { AlertCircle, HardDrive, ShieldAlert } from "lucide-react";
import { redirect } from "next/navigation";

import { getServerRuntimeBaseUrl } from "@/lib/server/runtime-base-url";
import { requireAdminUser } from "@/lib/server/session";
import { hasRemoteBlobStorage } from "@/lib/server/supabase-blob-storage";

export const runtime = "nodejs";

/**
 * Admin storage maintenance page.
 *
 * Provides global storage cleanup controls. This page is admin-only
 * (enforced by the parent layout) and houses the most dangerous
 * storage actions behind strong confirmation flows.
 */
export default async function AdminStoragePage() {
  await requireAdminUser();
  const storageAvailable = hasRemoteBlobStorage();

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Header */}
      <section className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-white/40 dark:bg-zinc-950/40 backdrop-blur-2xl p-8 md:p-12 shadow-2xl shadow-emerald-900/5">
        <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 via-transparent to-orange-900/10 pointer-events-none" />
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-red-500/10 dark:bg-red-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center rounded-full bg-red-100 dark:bg-red-900/50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-red-700 dark:text-red-300">
              <ShieldAlert className="me-2 h-4 w-4" />
              Storage Maintenance
            </span>
          </div>
          <h1 className="font-[family-name:var(--font-display)] text-4xl md:text-5xl font-black tracking-tight text-zinc-900 dark:text-white">
            Storage Controls
          </h1>
          <p className="max-w-2xl text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
            Manage Supabase Storage objects. These actions are destructive and irreversible.
          </p>
        </div>
      </section>

      {!storageAvailable && (
        <div className="flex items-center gap-3 rounded-2xl border border-danger/20 bg-danger/5 p-4 text-danger shadow-sm">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p className="text-sm font-medium">Remote storage is not available in this runtime.</p>
        </div>
      )}

      {/* Global Cleanup */}
      <section className="rounded-[2rem] border border-red-200 dark:border-red-900/50 bg-red-50/60 dark:bg-red-950/20 backdrop-blur-2xl p-6 shadow-sm">
        <h2 className="text-xl font-bold text-red-700 dark:text-red-400 mb-2 flex items-center gap-2">
          <HardDrive className="h-5 w-5" />
          Global Storage Cleanup
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
          This will delete ALL user-owned storage objects across all namespaces
          (uploads/temp, documents, assessment-results, assessment-exports). This action cannot be undone.
        </p>

        <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-800 dark:text-amber-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          You must type <code className="font-mono font-bold">DELETE ALL STORAGE</code> exactly to confirm.
        </div>

        <form
          action={async (formData: FormData) => {
            "use server";
            await requireAdminUser();
            const confirmation = String(formData.get("confirmation") || "").trim();

            if (confirmation !== "DELETE ALL STORAGE") {
              redirect("/admin/storage?error=confirmation_mismatch");
            }

            try {
              // Keep admin global cleanup portable across local and Vercel runtimes.
              const baseUrl = getServerRuntimeBaseUrl();
              const response = await fetch(`${baseUrl}/api/admin/storage/cleanup`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  mode: "global",
                  scope: "user-namespaces-only",
                  confirmation,
                }),
              });

              if (!response.ok) {
                redirect("/admin/storage?error=cleanup_failed");
              }

              redirect("/admin/storage?cleaned=true");
            } catch {
              redirect("/admin/storage?error=cleanup_failed");
            }
          }}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label htmlFor="global-confirmation" className="sr-only">
                Confirmation phrase
              </label>
              <input
                id="global-confirmation"
                type="text"
                name="confirmation"
                placeholder='Type "DELETE ALL STORAGE" to confirm'
                className="field-control h-10 w-full text-xs"
                required
                disabled={!storageAvailable}
              />
            </div>
            <button
              type="submit"
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!storageAvailable}
            >
              <HardDrive className="h-4 w-4" />
              Delete All Storage
            </button>
          </div>
        </form>
      </section>

      {/* Back to admin */}
      <div className="flex justify-start">
        <a
          href="/admin"
          className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
        >
          &larr; Back to Admin Dashboard
        </a>
      </div>
    </div>
  );
}