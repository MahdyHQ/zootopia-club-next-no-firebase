"use client";

import type { ApiResult, Locale, UserDocument } from "@zootopia/shared-types";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  Download,
  LoaderCircle,
  LockKeyhole,
  Sparkles,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserX,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AppMessages } from "@/lib/messages";

type UsersTableProps = {
  messages: AppMessages;
  locale: Locale;
  initialUsers: UserDocument[];
  currentUserId: string;
  initialPromptEnabledUids: string[];
};

const USERS_EXPORT_ENDPOINT = "/api/admin/users/export";
/* These admin-users overview surfaces stay scoped to the list page only.
   Light mode gets stronger borders/text and motion stays disabled here so management actions
   remain immediately legible without changing the established dark-mode visual language. */
const ADMIN_USERS_OVERVIEW_SECTION_CLASS =
  "rounded-2xl border border-zinc-200/80 bg-white/84 p-4 shadow-[0_12px_28px_rgba(148,163,184,0.10)] backdrop-blur-md dark:border-border dark:bg-background-elevated/80 dark:shadow-sm";
const ADMIN_USERS_OVERVIEW_CARD_CLASS =
  "rounded-[1.75rem] border border-zinc-200/80 bg-white/92 p-5 shadow-[0_10px_26px_rgba(148,163,184,0.12)] backdrop-blur-md dark:border-border dark:bg-background-elevated/80 dark:shadow-sm";
const ADMIN_USERS_OVERVIEW_OUTLINE_BUTTON_CLASS =
  "border-zinc-300 bg-white text-zinc-900 shadow-sm shadow-zinc-200/70 transition-colors hover:translate-y-0 hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-800 dark:border-border-strong dark:bg-transparent dark:text-foreground dark:shadow-none dark:hover:bg-accent/5 dark:hover:text-accent";
const ADMIN_USERS_OVERVIEW_LINK_CLASS =
  "inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-emerald-300/90 bg-emerald-50 px-4 text-sm font-semibold text-emerald-800 shadow-sm shadow-emerald-100/80 transition-colors hover:bg-emerald-100 hover:text-emerald-900 dark:border-accent/25 dark:bg-accent/10 dark:text-accent-strong dark:shadow-none dark:hover:bg-accent/15 dark:hover:text-accent-strong";

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

  const fileNameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  return fileNameMatch?.[1] ?? fallback;
}

function formatUserGender(value: string | null | undefined, messages: AppMessages) {
  if (value === "male") {
    return messages.settingsGenderOptionMale;
  }

  if (value === "female") {
    return messages.settingsGenderOptionFemale;
  }

  if (value === "prefer_not_to_say") {
    return messages.settingsGenderOptionPreferNotToSay;
  }

  return "-";
}

export function UsersTable({
  messages,
  locale,
  initialUsers,
  currentUserId,
  initialPromptEnabledUids,
}: UsersTableProps) {
  const [error, setError] = useState<string | null>(null);
  const [exportingUsers, setExportingUsers] = useState(false);
  const promptEnabledUidSet = useMemo(
    () => new Set(initialPromptEnabledUids),
    [initialPromptEnabledUids],
  );

  const dateFormatter = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-US", {
    dateStyle: "medium",
  });

  async function handleExportUsers() {
    setError(null);
    setExportingUsers(true);

    try {
      // Export remains server-owned so admin scope, audit logging, and workbook shaping
      // cannot drift into client-only logic.
      const response = await fetch(USERS_EXPORT_ENDPOINT, {
        method: "GET",
        credentials: "same-origin",
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as ApiResult<unknown> | null;
        if (body && !body.ok) {
          throw new Error(body.error.message);
        }

        throw new Error(messages.adminUsersExportFailed);
      }

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("spreadsheetml.sheet")) {
        throw new Error(messages.adminUsersExportFailed);
      }

      const workbookBlob = await response.blob();
      if (workbookBlob.size === 0) {
        throw new Error(messages.adminUsersExportFailed);
      }

      const fileName = extractDownloadFileName(
        response.headers.get("content-disposition"),
        "zootopia-users-export.xlsx",
      );

      const downloadUrl = window.URL.createObjectURL(workbookBlob);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = fileName;
      anchor.rel = "noopener";
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      window.setTimeout(() => window.URL.revokeObjectURL(downloadUrl), 1_000);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : messages.adminUsersExportFailed,
      );
    } finally {
      setExportingUsers(false);
    }
  }

  return (
    <div className="space-y-6">
      {error ? (
        <div className="flex items-center gap-3 rounded-2xl border border-danger/20 bg-danger/5 p-4 text-danger shadow-sm">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      ) : null}

      {initialUsers.length > 0 ? (
        <section className={ADMIN_USERS_OVERVIEW_SECTION_CLASS}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm leading-7 text-foreground-muted">
              {messages.adminUsersExportLabel}
            </p>

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={exportingUsers}
              onClick={() => {
                void handleExportUsers();
              }}
              className={`h-10 gap-2 sm:min-w-[220px] ${ADMIN_USERS_OVERVIEW_OUTLINE_BUTTON_CLASS}`}
            >
              {exportingUsers ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              <span>
                {exportingUsers
                  ? messages.adminUsersExportPreparing
                  : messages.adminUsersExportAction}
              </span>
            </Button>
          </div>
        </section>
      ) : null}

      {initialUsers.length === 0 ? (
        <div className="rounded-[2rem] border border-zinc-200/80 bg-white/88 px-6 py-16 text-center shadow-[0_12px_28px_rgba(148,163,184,0.12)] backdrop-blur-md dark:border-border dark:bg-background-elevated dark:shadow-sm">
          <div className="flex flex-col items-center justify-center gap-4 text-foreground-muted">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-border-strong/10">
              <ShieldCheck className="h-6 w-6 text-foreground-muted/40" />
            </div>
            <p className="text-[1.05rem] font-medium">{messages.noUsers}</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {initialUsers.map((user) => {
            const isCurrentUser = user.uid === currentUserId;
            const isAdmin = user.role === "admin";
            const isActive = user.status === "active";
            const hasPromptEntitlement = promptEnabledUidSet.has(user.uid);
            const genderLabel = formatUserGender(user.gender, messages);
            const userInitial =
              (user.fullName || user.displayName || user.email || user.uid || "U")
                .charAt(0)
                .toUpperCase();

            return (
              <article
                key={user.uid}
                className={ADMIN_USERS_OVERVIEW_CARD_CLASS}
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent/10 font-[family-name:var(--font-display)] text-lg font-bold text-accent shadow-sm">
                    {userInitial}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[1.02rem] font-semibold leading-7 text-foreground">
                      {user.fullName || user.displayName || user.email || user.uid}
                    </p>
                    <p className="truncate font-mono text-[0.82rem] leading-6 text-foreground-muted opacity-85">
                      {user.email || user.uid}
                    </p>
                    <p className="mt-1 truncate font-mono text-[0.74rem] leading-6 text-foreground-muted opacity-80">
                      {user.uid}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                      isAdmin
                        ? "bg-gold/15 text-[#b48d3c]"
                        : "bg-foreground/5 text-foreground-muted"
                    }`}
                  >
                    {isAdmin ? (
                      <ShieldCheck className="h-3.5 w-3.5" />
                    ) : (
                      <ShieldAlert className="h-3.5 w-3.5" />
                    )}
                    {isAdmin ? messages.roleAdmin : messages.roleUser}
                  </span>

                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                      isActive
                        ? "bg-accent/15 text-accent-strong"
                        : "bg-danger/10 text-danger"
                    }`}
                  >
                    {isActive ? (
                      <UserCheck className="h-3.5 w-3.5" />
                    ) : (
                      <UserX className="h-3.5 w-3.5" />
                    )}
                    {isActive ? messages.statusActive : messages.statusSuspended}
                  </span>

                  <span
                    className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                      user.profileCompleted
                        ? "border-accent/25 bg-accent/10 text-accent-strong"
                        : "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                    }`}
                  >
                    {user.profileCompleted
                      ? messages.adminUserProfileComplete
                      : messages.adminUserProfileIncomplete}
                  </span>

                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                      hasPromptEntitlement
                        ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                        : "border-amber-500/30 bg-amber-500/12 text-amber-700 dark:text-amber-300"
                    }`}
                  >
                    {hasPromptEntitlement ? (
                      <Sparkles className="h-3.5 w-3.5" />
                    ) : (
                      <LockKeyhole className="h-3.5 w-3.5" />
                    )}
                    {hasPromptEntitlement
                      ? "Prompt Access Enabled"
                      : "Prompt Access Locked"}
                  </span>

                  {isCurrentUser ? (
                    <span className="inline-flex items-center rounded-full bg-accent/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-accent-strong">
                      {messages.adminCurrentUserBadge}
                    </span>
                  ) : null}
                </div>

                <div className="mt-4 grid gap-2 text-[0.76rem] font-medium leading-6 text-foreground-muted sm:grid-cols-2">
                  <span className="rounded-full border border-border bg-background-strong/60 px-3 py-1.5">
                    {messages.adminUserCodeLabel}: {user.universityCode || "-"}
                  </span>
                  <span className="rounded-full border border-border bg-background-strong/60 px-3 py-1.5">
                    {messages.settingsGenderLabel}: {genderLabel}
                  </span>
                  <span className="rounded-full border border-border bg-background-strong/60 px-3 py-1.5">
                    {messages.adminUserJoinedLabel}: {dateFormatter.format(new Date(user.createdAt))}
                  </span>
                </div>

                {/* Advanced mutations intentionally live on the dedicated detail route
                    so this overview remains fast, scannable, and safe to browse. */}
                <div className="mt-5">
                  <Link
                    href={`/admin/users/${encodeURIComponent(user.uid)}`}
                    className={ADMIN_USERS_OVERVIEW_LINK_CLASS}
                  >
                    <span>{messages.adminUserDetailsAction}</span>
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
