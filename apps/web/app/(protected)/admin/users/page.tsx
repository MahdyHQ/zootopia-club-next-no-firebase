import { ShieldCheck } from "lucide-react";
import { UsersTable } from "@/components/admin/users-table";
import { getRequestUiContext } from "@/lib/server/request-context";
import { listUsers } from "@/lib/server/repository";
import { requireAdminUser } from "@/lib/server/session";

export default async function AdminUsersPage() {
  const [adminUser, uiContext, users] = await Promise.all([
    requireAdminUser(),
    getRequestUiContext(),
    listUsers(),
  ]);

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <section className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-white/40 dark:bg-zinc-950/40 backdrop-blur-2xl p-8 md:p-12 shadow-2xl shadow-emerald-900/5">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-teal-900/10 pointer-events-none" />
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-emerald-500/10 dark:bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
              <ShieldCheck className="me-2 h-4 w-4" />
              {uiContext.messages.navAdminUsers}
            </span>
          </div>
          <h1 className="font-[family-name:var(--font-display)] text-4xl md:text-5xl font-black tracking-tight text-zinc-900 dark:text-white">
            {uiContext.messages.adminUsersTitle}
          </h1>
          <p className="max-w-2xl text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
            {uiContext.messages.adminUsersSubtitle}
          </p>
        </div>
      </section>

      <section className="relative overflow-hidden rounded-[2.5rem] border border-white/20 dark:border-white/5 bg-white/60 dark:bg-zinc-950/40 backdrop-blur-2xl p-6 shadow-sm">
        <UsersTable
          messages={uiContext.messages}
          locale={uiContext.locale}
          initialUsers={users}
          currentUserId={adminUser.uid}
        />
      </section>
    </div>
  );
}
