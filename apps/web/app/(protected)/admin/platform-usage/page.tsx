import { APP_ROUTES } from "@zootopia/shared-config";
import { BarChart3, ChevronLeft, ShieldCheck, Users, Wrench } from "lucide-react";
import Link from "next/link";

import { getAdminPlatformUsageSnapshot } from "@/lib/server/platform-usage-aggregation";
import { requireAdminUser } from "@/lib/server/session";

const NUMBER_FORMATTER = new Intl.NumberFormat("en-US");

function formatCount(value: number) {
  return NUMBER_FORMATTER.format(Math.max(0, Math.trunc(value)));
}

export default async function AdminPlatformUsagePage() {
  /* This route is a dedicated admin-only observability surface for platform-wide usage.
     Keep the server-side guard at the page entry so direct route execution always fails closed
     for non-admin identities even if parent layouts are refactored later. */
  await requireAdminUser();
  const usageSnapshot = await getAdminPlatformUsageSnapshot({
    topUsersLimit: 25,
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <section className="rounded-[2rem] border border-white/20 bg-white/70 p-6 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/45">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
              <ShieldCheck className="h-3.5 w-3.5" />
              Admin only
            </span>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-zinc-900 dark:text-zinc-100">
              Platform Credit Usage
            </h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              Server-authoritative, cross-tool usage aggregation from canonical accounting tables.
            </p>
          </div>

          <Link
            href={APP_ROUTES.admin}
            className="inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/70 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-white dark:border-white/10 dark:bg-zinc-900/60 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to admin
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Total platform usage (counted)",
            value: formatCount(usageSnapshot.totalPlatformUsage),
          },
          {
            label: `Usage today (${usageSnapshot.dayKey})`,
            value: formatCount(usageSnapshot.todayPlatformUsage),
          },
          {
            label: "Today remaining platform capacity",
            value: formatCount(usageSnapshot.todayPlatformRemaining),
          },
          {
            label: "Today cap status",
            value: usageSnapshot.todayPlatformReached
              ? `Reached (${formatCount(usageSnapshot.platformLimit)} limit)`
              : `Active (${formatCount(usageSnapshot.platformLimit)} limit)`,
          },
        ].map((item) => (
          <article
            key={item.label}
            className="rounded-[1.6rem] border border-white/20 bg-white/70 p-5 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/45"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500 dark:text-zinc-400">
              {item.label}
            </p>
            <p className="mt-3 text-2xl font-black tracking-tight text-zinc-900 dark:text-zinc-100">
              {item.value}
            </p>
          </article>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-[1.8rem] border border-white/20 bg-white/70 p-6 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/45">
          <h2 className="flex items-center gap-2 text-lg font-bold text-zinc-900 dark:text-zinc-100">
            <Wrench className="h-5 w-5 text-indigo-500" />
            Usage by tool
          </h2>
          <div className="mt-4 space-y-3">
            {usageSnapshot.usageByTool.length ? usageSnapshot.usageByTool.map((row) => (
              <div
                key={row.toolId}
                className="flex items-center justify-between rounded-2xl border border-white/25 bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-zinc-900/55"
              >
                <p className="font-semibold capitalize text-zinc-800 dark:text-zinc-100">{row.toolId}</p>
                <p className="text-right text-sm text-zinc-600 dark:text-zinc-300">
                  <span className="block font-semibold">Total: {formatCount(row.totalUsedCount)}</span>
                  <span className="block">Today: {formatCount(row.todayUsedCount)}</span>
                </p>
              </div>
            )) : (
              <p className="rounded-2xl border border-dashed border-zinc-300/70 px-4 py-3 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                No generation usage has been recorded yet.
              </p>
            )}
          </div>
        </article>

        <article className="rounded-[1.8rem] border border-white/20 bg-white/70 p-6 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/45">
          <h2 className="flex items-center gap-2 text-lg font-bold text-zinc-900 dark:text-zinc-100">
            <BarChart3 className="h-5 w-5 text-amber-500" />
            Exempt usage visibility
          </h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            Admin and configured exempt-email identities are tracked separately and excluded from the platform cap.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/25 bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-zinc-900/55">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">Exempt total usage</p>
              <p className="mt-2 text-xl font-black text-zinc-900 dark:text-zinc-100">{formatCount(usageSnapshot.exemptUsageTotal)}</p>
            </div>
            <div className="rounded-2xl border border-white/25 bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-zinc-900/55">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">Exempt usage today</p>
              <p className="mt-2 text-xl font-black text-zinc-900 dark:text-zinc-100">{formatCount(usageSnapshot.exemptUsageToday)}</p>
            </div>
          </div>
        </article>
      </section>

      <section className="rounded-[1.8rem] border border-white/20 bg-white/70 p-6 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/45">
        <h2 className="flex items-center gap-2 text-lg font-bold text-zinc-900 dark:text-zinc-100">
          <Users className="h-5 w-5 text-emerald-500" />
          Top users by usage
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          Showing the most active accounts from canonical server-side aggregation.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200/70 text-left dark:border-zinc-800">
                <th className="px-3 py-2 font-semibold text-zinc-500 dark:text-zinc-400">User</th>
                <th className="px-3 py-2 font-semibold text-zinc-500 dark:text-zinc-400">Role</th>
                <th className="px-3 py-2 font-semibold text-zinc-500 dark:text-zinc-400">Today</th>
                <th className="px-3 py-2 font-semibold text-zinc-500 dark:text-zinc-400">Total</th>
                <th className="px-3 py-2 font-semibold text-zinc-500 dark:text-zinc-400">Cap scope</th>
              </tr>
            </thead>
            <tbody>
              {usageSnapshot.usageByUser.length ? usageSnapshot.usageByUser.map((row) => (
                <tr key={row.ownerUid} className="border-b border-zinc-200/70 dark:border-zinc-800">
                  <td className="px-3 py-2 font-medium text-zinc-800 dark:text-zinc-100">
                    {row.ownerEmail ?? row.ownerUid}
                  </td>
                  <td className="px-3 py-2 capitalize text-zinc-600 dark:text-zinc-300">{row.ownerRole}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-300">{formatCount(row.todayUsedCount)}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-300">{formatCount(row.totalUsedCount)}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-300">
                    {row.exemptFromPlatformCap ? "Exempt" : "Counted"}
                  </td>
                </tr>
              )) : (
                <tr>
                  <td className="px-3 py-3 text-zinc-500 dark:text-zinc-400" colSpan={5}>
                    No user usage data is available yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
          Snapshot generated at {usageSnapshot.generatedAt} UTC.
        </p>
      </section>
    </div>
  );
}
