import "server-only";

import {
  Activity,
  AlertCircle,
  Calendar,
  Clock3,
  Database,
  FileText,
  Gauge,
  HardDrive,
  History,
  Mail,
  Shield,
  ShieldCheck,
  ShieldX,
  Trash2,
  User,
  UserCheck,
  UserX,
} from "lucide-react";
import { notFound, redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  getAdminAssessmentCreditStateForUser,
  getUserByUid,
  listAdminActivityLogs,
  listAssessmentGenerationsForUser,
  listDocumentsForUser,
  listInfographicGenerationsForUser,
} from "@/lib/server/repository";
import { getAllRetentionPolicySummaries } from "@/lib/server/storage-retention-config";
import { requireAdminUser } from "@/lib/server/session";
import {
  hasRemoteBlobStorage,
  listZootopiaPrivateObjectDescriptorsByPrefix,
} from "@/lib/server/supabase-blob-storage";

export const runtime = "nodejs";

const USER_STORAGE_NAMESPACES = [
  "uploads/temp",
  "documents",
  "assessment-results",
  "assessment-exports",
] as const;

type SearchParamValue = string | string[] | undefined;

function getFirstSearchParamValue(value: SearchParamValue) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function toEpochMs(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDateTime(dateFormatter: Intl.DateTimeFormat, value: string | null | undefined) {
  if (!value) {
    return "Unknown";
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return "Unknown";
  }

  return dateFormatter.format(new Date(timestamp));
}

function formatBytes(sizeBytes: number) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let unitIndex = 0;
  let value = sizeBytes;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const precision = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

/**
 * Dedicated admin user detail page.
 *
 * Server-rendered, admin-only. Shows full user identity, credits, content,
 * storage summary, and admin controls including per-user storage cleanup.
 *
 * Access guard: requireAdminUser() in the parent layout ensures only admins
 * can reach any /admin/* route. This page additionally verifies the target
 * user exists and returns 404 if not found.
 */
export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ uid: string }>;
}) {
  const [adminUser, resolvedParams] = await Promise.all([
    requireAdminUser(),
    params,
  ]);

  const targetUid = resolvedParams.uid?.trim();
  if (!targetUid) {
    redirect("/admin/users");
  }

  const targetUser = await getUserByUid(targetUid);
  if (!targetUser) {
    notFound();
  }

  const isAdmin = targetUser.role === "admin";
  const isActive = targetUser.status === "active";
  const isCurrentUser = targetUser.uid === adminUser.uid;

  const userInitial = (targetUser.fullName || targetUser.displayName || targetUser.email || targetUser.uid || "U")
    .charAt(0)
    .toUpperCase();

  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeStyle: "short",
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Header */}
      <section className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-white/40 dark:bg-zinc-950/40 backdrop-blur-2xl p-8 md:p-12 shadow-2xl shadow-emerald-900/5">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-teal-900/10 pointer-events-none" />
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-emerald-500/10 dark:bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent/10 font-[family-name:var(--font-display)] text-2xl font-bold text-accent shadow-sm">
              {userInitial}
            </div>
            <div className="min-w-0">
              <h1 className="font-[family-name:var(--font-display)] text-3xl md:text-4xl font-black tracking-tight text-zinc-900 dark:text-white truncate">
                {targetUser.fullName || targetUser.displayName || targetUser.email || targetUser.uid}
              </h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 font-mono truncate">
                {targetUser.uid}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mt-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wider ${
                isAdmin
                  ? "bg-gold/15 text-[#b48d3c] dark:bg-yellow-500/15 dark:text-yellow-400"
                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
              }`}
            >
              {isAdmin ? <ShieldCheck className="h-3.5 w-3.5" /> : <Shield className="h-3.5 w-3.5" />}
              {isAdmin ? "Admin" : "User"}
            </span>

            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wider ${
                isActive
                  ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
                  : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
              }`}
            >
              {isActive ? <UserCheck className="h-3.5 w-3.5" /> : <UserX className="h-3.5 w-3.5" />}
              {isActive ? "Active" : "Suspended"}
            </span>

            {targetUser.profileCompleted ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 dark:bg-blue-900/30 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400">
                Profile Complete
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 dark:bg-amber-900/30 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                Profile Incomplete
              </span>
            )}

            {isCurrentUser && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 dark:bg-violet-900/30 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-violet-700 dark:text-violet-400">
                Current User
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Identity / Account Section */}
      <section className="rounded-[2rem] border border-white/20 dark:border-white/5 bg-white/60 dark:bg-zinc-950/40 backdrop-blur-2xl p-6 shadow-sm">
        <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-4 flex items-center gap-2">
          <User className="h-5 w-5" />
          Identity & Account
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <DetailCard label="UID" value={targetUser.uid} mono />
          <DetailCard label="Email" value={targetUser.email || "Not set"} icon={<Mail className="h-4 w-4" />} />
          <DetailCard label="Display Name" value={targetUser.displayName || "Not set"} />
          <DetailCard label="Full Name" value={targetUser.fullName || "Not set"} />
          <DetailCard label="University Code" value={targetUser.universityCode || "Not set"} />
          <DetailCard label="Phone" value={targetUser.phoneNumber || "Not set"} />
          <DetailCard label="Nationality" value={targetUser.nationality || "Not set"} />
          <DetailCard
            label="Role"
            value={targetUser.role}
            badge={targetUser.role === "admin" ? "accent" : "default"}
          />
          <DetailCard
            label="Status"
            value={targetUser.status}
            badge={targetUser.status === "active" ? "success" : "danger"}
          />
          <DetailCard
            label="Created"
            value={dateFormatter.format(new Date(targetUser.createdAt))}
            icon={<Calendar className="h-4 w-4" />}
          />
          <DetailCard
            label="Last Updated"
            value={dateFormatter.format(new Date(targetUser.updatedAt))}
            icon={<Calendar className="h-4 w-4" />}
          />
          <DetailCard
            label="Profile Completed"
            value={targetUser.profileCompleted ? "Yes" : "No"}
            badge={targetUser.profileCompleted ? "success" : "warning"}
          />
        </div>
      </section>

      {/* Admin Controls Section */}
      <section className="rounded-[2rem] border border-white/20 dark:border-white/5 bg-white/60 dark:bg-zinc-950/40 backdrop-blur-2xl p-6 shadow-sm">
        <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-4 flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Admin Controls
        </h2>

        {isCurrentUser && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-800 dark:text-amber-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            You cannot perform destructive actions on your own account from this page.
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Role toggle */}
          <RoleToggleForm
            targetUid={targetUser.uid}
            currentRole={targetUser.role}
            disabled={isCurrentUser}
          />

          {/* Status toggle */}
          <StatusToggleForm
            targetUid={targetUser.uid}
            currentStatus={targetUser.status}
            disabled={isCurrentUser}
          />

          {/* Delete user account */}
          <DeleteUserForm
            targetUid={targetUser.uid}
            targetEmail={targetUser.email}
            disabled={isCurrentUser}
          />

          {/* Delete all files for this user */}
          <DeleteUserStorageForm
            targetUid={targetUser.uid}
            targetEmail={targetUser.email}
            disabled={isCurrentUser}
          />
        </div>
      </section>

      {/* Storage Section */}
      <section className="rounded-[2rem] border border-white/20 dark:border-white/5 bg-white/60 dark:bg-zinc-950/40 backdrop-blur-2xl p-6 shadow-sm">
        <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-4 flex items-center gap-2">
          <HardDrive className="h-5 w-5" />
          Storage & Content
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <DetailCard
            label="Documents"
            value="See below"
            subtitle="Uploaded source files"
            icon={<FileText className="h-4 w-4" />}
          />
          <DetailCard
            label="Assessments"
            value="See below"
            subtitle="Generated assessments"
            icon={<FileText className="h-4 w-4" />}
          />
          <DetailCard
            label="Infographics"
            value="See below"
            subtitle="Generated infographics"
            icon={<FileText className="h-4 w-4" />}
          />
          <DetailCard
            label="Storage Objects"
            value="Managed via cleanup"
            subtitle="Supabase Storage"
            icon={<HardDrive className="h-4 w-4" />}
          />
        </div>
      </section>

      {/* Back to users list */}
      <div className="flex justify-start">
        <a
          href="/admin/users"
          className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
        >
          &larr; Back to Users List
        </a>
      </div>
    </div>
  );
}

/**
 * Reusable detail card for the admin user detail page.
 */
function DetailCard({
  label,
  value,
  subtitle,
  mono,
  icon,
  badge,
}: {
  label: string;
  value: string;
  subtitle?: string;
  mono?: boolean;
  icon?: React.ReactNode;
  badge?: "accent" | "success" | "danger" | "warning" | "default";
}) {
  const badgeClasses: Record<string, string> = {
    accent: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400",
    success: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400",
    danger: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
    warning: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
    default: "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400",
  };

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/50 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-500">
        {label}
      </p>
      <div className="mt-1.5 flex items-center gap-2">
        {icon && <span className="text-zinc-400">{icon}</span>}
        <p className={`text-sm font-medium text-zinc-900 dark:text-white ${mono ? "font-mono text-xs break-all" : ""}`}>
          {value}
        </p>
      </div>
      {subtitle && (
        <p className="mt-1 text-xs text-zinc-500">{subtitle}</p>
      )}
      {badge && (
        <span className={`mt-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${badgeClasses[badge] || badgeClasses.default}`}>
          {value}
        </span>
      )}
    </div>
  );
}

/**
 * Client-side role toggle form.
 */
function RoleToggleForm({
  targetUid,
  currentRole,
  disabled,
}: {
  targetUid: string;
  currentRole: string;
  disabled: boolean;
}) {
  const isAdmin = currentRole === "admin";
  const actionLabel = isAdmin ? "Demote to User" : "Promote to Admin";

  return (
    <form
      action={async () => {
        "use server";
        const { setUserRole } = await import("@/lib/server/repository");
        const { requireAdminUser } = await import("@/lib/server/session");
        await requireAdminUser();
        await setUserRole(targetUid, isAdmin ? "user" : "admin");
        redirect(`/admin/users/${targetUid}`);
      }}
    >
      <Button
        type="submit"
        variant="outline"
        size="sm"
        disabled={disabled}
        className="w-full h-10 justify-center gap-2"
      >
        {isAdmin ? <ShieldX className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
        {actionLabel}
      </Button>
    </form>
  );
}

/**
 * Client-side status toggle form.
 */
function StatusToggleForm({
  targetUid,
  currentStatus,
  disabled,
}: {
  targetUid: string;
  currentStatus: string;
  disabled: boolean;
}) {
  const isActive = currentStatus === "active";
  const actionLabel = isActive ? "Suspend User" : "Activate User";

  return (
    <form
      action={async () => {
        "use server";
        const { setUserStatus } = await import("@/lib/server/repository");
        const { requireAdminUser } = await import("@/lib/server/session");
        await requireAdminUser();
        await setUserStatus(targetUid, isActive ? "suspended" : "active");
        redirect(`/admin/users/${targetUid}`);
      }}
    >
      <Button
        type="submit"
        variant={isActive ? "outline" : "default"}
        size="sm"
        disabled={disabled}
        className={`w-full h-10 justify-center gap-2 ${
          isActive
            ? "border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
            : ""
        }`}
      >
        {isActive ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
        {actionLabel}
      </Button>
    </form>
  );
}

/**
 * Delete user account form with confirmation.
 */
function DeleteUserForm({
  targetUid,
  targetEmail,
  disabled,
}: {
  targetUid: string;
  targetEmail: string | null;
  disabled: boolean;
}) {
  const confirmationTarget = targetEmail || targetUid;

  return (
    <form
      action={async (formData: FormData) => {
        "use server";
        const { deleteUserAccountAsAdmin } = await import("@/lib/server/repository");
        const { requireAdminUser } = await import("@/lib/server/session");
        const admin = await requireAdminUser();
        const confirmation = String(formData.get("confirmation") || "").trim();

        if (!confirmation) {
          redirect(`/admin/users/${targetUid}?error=confirmation_required`);
        }

        const confirmationNormalized = confirmation.toLowerCase();
        const matchesUid = confirmation === targetUid;
        const matchesEmail =
          typeof targetEmail === "string"
          && targetEmail.trim().length > 0
          && confirmationNormalized === targetEmail.trim().toLowerCase();

        if (!matchesUid && !matchesEmail) {
          redirect(`/admin/users/${targetUid}?error=confirmation_mismatch`);
        }

        try {
          await deleteUserAccountAsAdmin({
            targetUid,
            actingAdmin: { uid: admin.uid, role: admin.role },
            route: "/admin/users/[uid]",
          });
          redirect("/admin/users?deleted=true");
        } catch {
          redirect(`/admin/users/${targetUid}?error=delete_failed`);
        }
      }}
    >
      <input type="hidden" name="uid" value={targetUid} />
      <div className="space-y-2">
        <input
          type="text"
          name="confirmation"
          placeholder={`Type "${confirmationTarget}" to confirm`}
          className="field-control h-10 w-full text-xs"
          disabled={disabled}
          required
        />
        <Button
          type="submit"
          variant="destructive"
          size="sm"
          disabled={disabled}
          className="w-full h-10 justify-center gap-2"
        >
          <Trash2 className="h-4 w-4" />
          Delete User
        </Button>
      </div>
    </form>
  );
}

/**
 * Delete all storage files for this user form with confirmation.
 */
function DeleteUserStorageForm({
  targetUid,
  targetEmail,
  disabled,
}: {
  targetUid: string;
  targetEmail: string | null;
  disabled: boolean;
}) {
  const confirmationTarget = targetEmail || targetUid;

  return (
    <form
      action={async (formData: FormData) => {
        "use server";
        const { requireAdminUser } = await import("@/lib/server/session");
        await requireAdminUser();
        const confirmation = String(formData.get("confirmation") || "").trim();

        if (confirmation !== targetUid) {
          redirect(`/admin/users/${targetUid}?error=storage_confirmation_mismatch`);
        }

        try {
          const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/admin/storage/cleanup`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              mode: "user",
              targetUid,
              confirmation,
            }),
          });

          if (!response.ok) {
            redirect(`/admin/users/${targetUid}?error=storage_cleanup_failed`);
          }

          redirect(`/admin/users/${targetUid}?storage_cleaned=true`);
        } catch {
          redirect(`/admin/users/${targetUid}?error=storage_cleanup_failed`);
        }
      }}
    >
      <input type="hidden" name="uid" value={targetUid} />
      <div className="space-y-2">
        <input
          type="text"
          name="confirmation"
          placeholder={`Type "${confirmationTarget}" to confirm`}
          className="field-control h-10 w-full text-xs"
          disabled={disabled}
          required
        />
        <Button
          type="submit"
          variant="destructive"
          size="sm"
          disabled={disabled}
          className="w-full h-10 justify-center gap-2"
        >
          <HardDrive className="h-4 w-4" />
          Delete All Files
        </Button>
      </div>
    </form>
  );
}