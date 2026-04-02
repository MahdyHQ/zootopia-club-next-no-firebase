"use client";

import type { ApiResult, UserDocument, UserRole, UserStatus } from "@zootopia/shared-types";
import { useState } from "react";
import { Shield, ShieldAlert, ShieldCheck, UserX, UserCheck, AlertCircle, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

import type { AppMessages } from "@/lib/messages";

type UsersTableProps = {
  messages: AppMessages;
  initialUsers: UserDocument[];
  currentUserId: string;
};

export function UsersTable({
  messages,
  initialUsers,
  currentUserId,
}: UsersTableProps) {
  const [users, setUsers] = useState(initialUsers);
  const [error, setError] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  async function patchUser(
    uid: string,
    path: "role" | "status",
    payload: { role?: UserRole; status?: UserStatus },
  ) {
    setBusyUserId(uid);
    setError(null);

    try {
      const response = await fetch(`/api/admin/users/${uid}/${path}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const body = (await response.json()) as ApiResult<{ user: UserDocument }>;
      if (!response.ok || !body.ok) {
        throw new Error(body.ok ? "USER_UPDATE_FAILED" : body.error.message);
      }

      setUsers((current) =>
        current.map((user) => (user.uid === uid ? body.data.user : user)),
      );
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "User update failed.");
    } finally {
      setBusyUserId(null);
    }
  }

  return (
    <div className="space-y-6 animate-float translate-y-0">
      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-danger/20 bg-danger/5 p-4 text-danger shadow-sm">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      <div className="overflow-hidden rounded-[2rem] border border-border bg-background-elevated shadow-sm backdrop-blur-md">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-background-strong/50 uppercase tracking-wider text-foreground-muted">
              <tr>
                <th className="px-6 py-5 font-semibold whitespace-nowrap">{messages.tableUser}</th>
                <th className="px-6 py-5 font-semibold whitespace-nowrap">{messages.tableRole}</th>
                <th className="px-6 py-5 font-semibold whitespace-nowrap">{messages.tableStatus}</th>
                <th className="px-6 py-5 font-semibold text-right whitespace-nowrap">{messages.adminActionsTitle}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center justify-center gap-4 text-foreground-muted">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-border-strong/10">
                        <Shield className="h-6 w-6 text-foreground-muted/40" />
                      </div>
                      <p className="text-[1.05rem] font-medium">{messages.noUsers}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                users.map((user) => {
                  const locked = user.uid === currentUserId;
                  const pending = busyUserId === user.uid;
                  const isAdmin = user.role === "admin";
                  const isActive = user.status === "active";
                  const userInitial = (user.fullName || user.displayName || user.email || user.uid || "U").charAt(0).toUpperCase();

                  return (
                    <tr key={user.uid} className="transition-colors hover:bg-background-strong/40">
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-4">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent/10 font-[family-name:var(--font-display)] text-lg font-bold text-accent shadow-sm">
                            {userInitial}
                          </div>
                          <div>
                            <p className="font-semibold text-foreground">
                              {user.fullName || user.displayName || user.email || user.uid}
                            </p>
                            <p className="text-[0.8rem] text-foreground-muted font-mono mt-1 opacity-80">
                              {user.email || user.uid}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                            isAdmin
                              ? "bg-gold/15 text-[#b48d3c]" 
                              : "bg-foreground/5 text-foreground-muted"
                          }`}
                        >
                          {isAdmin ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
                          {isAdmin ? messages.roleAdmin : messages.roleUser}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                            isActive
                              ? "bg-accent/15 text-accent-strong"
                              : "bg-danger/10 text-danger"
                          }`}
                        >
                          {isActive ? messages.statusActive : messages.statusSuspended}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={pending || locked}
                            onClick={() =>
                              void patchUser(user.uid, "role", {
                                role: isAdmin ? "user" : "admin",
                              })
                            }
                            className="min-w-[120px] bg-background-strong shadow-sm"
                          >
                            {pending ? <LoaderCircle className="h-4 w-4 animate-spin shrink-0" /> : isAdmin ? <ShieldAlert className="h-4 w-4 shrink-0 text-foreground-muted" /> : <ShieldCheck className="h-4 w-4 shrink-0 text-accent" />}
                            <span>{messages.adminRoleAction}</span>
                          </Button>
                          
                          <Button
                            variant={isActive ? "outline" : "default"}
                            size="sm"
                            disabled={pending || locked}
                            onClick={() =>
                              void patchUser(user.uid, "status", {
                                status: isActive ? "suspended" : "active",
                              })
                            }
                            className={`min-w-[130px] shadow-sm ${isActive ? "border-danger/30 text-danger hover:bg-danger hover:text-white" : ""}`}
                          >
                            {pending ? <LoaderCircle className="h-4 w-4 animate-spin shrink-0" /> : isActive ? <UserX className="h-4 w-4 shrink-0" /> : <UserCheck className="h-4 w-4 shrink-0" />}
                            <span>{messages.adminStatusAction}</span>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
