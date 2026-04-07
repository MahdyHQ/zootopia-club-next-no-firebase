"use client";

import type {
  AdminAssessmentCreditMutationInput,
  AdminAssessmentCreditState,
  AdminUserAssessmentCreditsResponse,
  ApiResult,
  Locale,
  UserDocument,
  UserRole,
  UserStatus,
} from "@zootopia/shared-types";
import { useMemo, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  LoaderCircle,
  Shield,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserX,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { dispatchAssessmentCreditRefresh } from "@/lib/assessment-credit-events";
import type { AppMessages } from "@/lib/messages";

type UsersTableProps = {
  messages: AppMessages;
  locale: Locale;
  initialUsers: UserDocument[];
  currentUserId: string;
};

type CreditDraft = {
  manualAmount: string;
  manualSetAmount: string;
  dailyOverride: string;
  grantAmount: string;
  grantExpiresAt: string;
  grantReason: string;
};

const EMPTY_CREDIT_DRAFT: CreditDraft = {
  manualAmount: "1",
  manualSetAmount: "0",
  dailyOverride: "",
  grantAmount: "1",
  grantExpiresAt: "",
  grantReason: "",
};

function parsePositiveInteger(value: string) {
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function parseNonNegativeInteger(value: string) {
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function toLocalDateTimeInput(value: string | null) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const offsetMs = parsed.getTimezoneOffset() * 60_000;
  return new Date(parsed.getTime() - offsetMs).toISOString().slice(0, 16);
}

function buildCreditDraft(state: AdminAssessmentCreditState): CreditDraft {
  return {
    manualAmount: "1",
    manualSetAmount: String(state.account.manualCredits),
    dailyOverride:
      typeof state.account.dailyLimitOverride === "number"
        ? String(state.account.dailyLimitOverride)
        : "",
    grantAmount: "1",
    grantExpiresAt: "",
    grantReason: "",
  };
}

export function UsersTable({
  messages,
  locale,
  initialUsers,
  currentUserId,
}: UsersTableProps) {
  const [users, setUsers] = useState(initialUsers);
  const [error, setError] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [creditsBusyUserId, setCreditsBusyUserId] = useState<string | null>(null);
  const [expandedCreditsUserId, setExpandedCreditsUserId] = useState<string | null>(null);
  const [creditsByUserId, setCreditsByUserId] = useState<
    Record<string, AdminAssessmentCreditState | undefined>
  >({});
  const [creditDraftsByUserId, setCreditDraftsByUserId] = useState<
    Record<string, CreditDraft | undefined>
  >({});
  const dateFormatter = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-US", {
    dateStyle: "medium",
      {users.length === 0 ? (
        <div className="rounded-[2rem] border border-border bg-background-elevated px-6 py-16 text-center shadow-sm backdrop-blur-md">
          <div className="flex flex-col items-center justify-center gap-4 text-foreground-muted">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-border-strong/10">
              <Shield className="h-6 w-6 text-foreground-muted/40" />
            </div>
            <p className="text-[1.05rem] font-medium">{messages.noUsers}</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {users.map((user) => {
            const locked = user.uid === currentUserId;
            const pending = busyUserId === user.uid;
            const isAdmin = user.role === "admin";
            const isActive = user.status === "active";
            const userInitial = (user.fullName || user.displayName || user.email || user.uid || "U")
              .charAt(0)
              .toUpperCase();
            const joinedLabel = dateFormatter.format(new Date(user.createdAt));
            const universityCode = user.universityCode || "—";
            const roleActionLabel = isAdmin
              ? messages.adminDemoteAction
              : messages.adminPromoteAction;
            const statusActionLabel = isActive
              ? messages.adminBlockAction
              : messages.adminUnblockAction;
            const expandedCredits = expandedCreditsUserId === user.uid;
            const creditState = creditsByUserId[user.uid];
            const creditDraft = creditDraftsByUserId[user.uid] ?? EMPTY_CREDIT_DRAFT;
            const creditsPending = creditsBusyUserId === user.uid;
            const creditsRemainingLabel = creditState?.credits.isAdminExempt
              ? messages.roleAdmin
              : String(creditState?.credits.remainingCount ?? "0");
            const creditsExtraLabel = creditState
              ? String(creditState.credits.extraCreditsAvailable)
              : "0";
            const creditsDailyLabel = creditState
              ? `${creditState.credits.usedCount}/${creditState.credits.dailyLimit}`
              : "0/0";
            const accessEnabled =
              (creditState?.account.assessmentAccess ?? "enabled") === "enabled";

            return (
              <article
                key={user.uid}
                className="overflow-hidden rounded-[1.75rem] border border-border bg-background-elevated/80 shadow-sm backdrop-blur-md"
              >
                {/* This compact row stays readable while the heavy admin controls live in the inline panel below.
                    Keep selection tied to the user card so management context is always visually anchored to the chosen account. */}
                <button
                  type="button"
                  disabled={creditsPending}
                  aria-expanded={expandedCredits}
                  onClick={() => {
                    void toggleCreditsPanel(user.uid);
                  }}
                  className="group flex w-full flex-col gap-4 p-4 text-start transition-colors hover:bg-background-strong/35 sm:p-5 lg:p-6"
                >
                  <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 items-start gap-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent/10 font-[family-name:var(--font-display)] text-lg font-bold text-accent shadow-sm">
                        {userInitial}
                      </div>
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <p className="text-[1.02rem] font-semibold leading-7 text-foreground">
                            {user.fullName || user.displayName || user.email || user.uid}
                          </p>
                          {locked ? (
                            <span className="inline-flex items-center rounded-full bg-accent/10 px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-wider text-accent-strong">
                              {messages.adminCurrentUserBadge}
                            </span>
                          ) : null}
                        </div>
                        <p className="font-mono text-[0.82rem] leading-6 text-foreground-muted opacity-85">
                          {user.email || user.uid}
                        </p>
                        <div className="flex flex-wrap gap-2.5 text-[0.76rem] font-medium leading-6 text-foreground-muted">
                          <span className="rounded-full border border-border bg-background-strong/60 px-2.5 py-1">
                            {messages.adminUserCodeLabel}: {universityCode}
                          </span>
                          <span className="rounded-full border border-border bg-background-strong/60 px-2.5 py-1">
                            {messages.adminUserJoinedLabel}: {joinedLabel}
                          </span>
                          <span
                            className={`rounded-full border px-2.5 py-1 ${
                              user.profileCompleted
                                ? "border-accent/25 bg-accent/10 text-accent-strong"
                                : "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                            }`}
                          >
                            {user.profileCompleted
                              ? messages.adminUserProfileComplete
                              : messages.adminUserProfileIncomplete}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
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
                        {isActive ? messages.statusActive : messages.statusSuspended}
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background-strong/70 px-3 py-1 text-[0.68rem] font-bold uppercase tracking-wider text-foreground-muted">
                        {messages.adminAssessmentCreditsManageAction}
                        {creditsPending ? (
                          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                        ) : expandedCredits ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                      </span>
                    </div>
                  </div>
                </button>

                {expandedCredits ? (
                  <div className="border-t border-border/70 bg-background-strong/35 p-4 text-start sm:p-5 lg:p-6">
                    {creditState ? (
                      <div className="space-y-4">
                        {/* This panel groups all management controls by intent (account actions, summary, limits, grants)
                            so admins can operate comfortably without the old right-rail squeeze or control overlap. */}
                        <section className="space-y-3 rounded-2xl border border-border bg-background-elevated/75 p-3.5 sm:p-4">
                          <p className="text-[0.72rem] font-bold uppercase tracking-[0.16em] text-foreground-muted">
                            {messages.adminActionsTitle}
                          </p>
                          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={pending || locked}
                              onClick={() =>
                                void patchUser(user.uid, "role", {
                                  role: isAdmin ? "user" : "admin",
                                })
                              }
                              className="h-10 w-full justify-center bg-background shadow-sm"
                            >
                              {pending ? (
                                <LoaderCircle className="h-4 w-4 shrink-0 animate-spin" />
                              ) : isAdmin ? (
                                <ShieldAlert className="h-4 w-4 shrink-0 text-foreground-muted" />
                              ) : (
                                <ShieldCheck className="h-4 w-4 shrink-0 text-accent" />
                              )}
                              <span>{roleActionLabel}</span>
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
                              className={`h-10 w-full justify-center shadow-sm ${
                                isActive ? "border-danger/30 text-danger hover:bg-danger hover:text-white" : ""
                              }`}
                            >
                              {pending ? (
                                <LoaderCircle className="h-4 w-4 shrink-0 animate-spin" />
                              ) : isActive ? (
                                <UserX className="h-4 w-4 shrink-0" />
                              ) : (
                                <UserCheck className="h-4 w-4 shrink-0" />
                              )}
                              <span>{statusActionLabel}</span>
                            </Button>

                            <Button
                              type="button"
                              variant={accessEnabled ? "outline" : "default"}
                              size="sm"
                              disabled={creditsPending}
                              onClick={() => {
                                void handleToggleAssessmentAccess(
                                  user.uid,
                                  accessEnabled ? "disabled" : "enabled",
                                );
                              }}
                              className="h-10 w-full justify-center"
                            >
                              {accessEnabled
                                ? messages.adminAssessmentCreditsDisableAction
                                : messages.adminAssessmentCreditsEnableAction}
                            </Button>
                          </div>
                        </section>

                        <section className="rounded-2xl border border-border bg-background-elevated/75 p-3.5 sm:p-4">
                          <div className="grid gap-2.5 sm:grid-cols-3">
                            <div className="rounded-xl border border-border bg-background-strong/70 px-3 py-2.5">
                              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-foreground-muted">
                                {messages.adminAssessmentCreditsRemainingLabel}
                              </p>
                              <p className="mt-1.5 text-base font-bold leading-7 text-foreground">
                                {creditsRemainingLabel}
                              </p>
                            </div>
                            <div className="rounded-xl border border-border bg-background-strong/70 px-3 py-2.5">
                              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-foreground-muted">
                                {messages.adminAssessmentCreditsDailyLabel}
                              </p>
                              <p className="mt-1.5 text-base font-bold leading-7 text-foreground">
                                {creditsDailyLabel}
                              </p>
                            </div>
                            <div className="rounded-xl border border-border bg-background-strong/70 px-3 py-2.5">
                              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-foreground-muted">
                                {messages.adminAssessmentCreditsExtraLabel}
                              </p>
                              <p className="mt-1.5 text-base font-bold leading-7 text-foreground">
                                {creditsExtraLabel}
                              </p>
                            </div>
                          </div>
                        </section>

                        <div className="grid gap-4 xl:grid-cols-2">
                          <section className="space-y-3 rounded-2xl border border-border bg-background-elevated/75 p-3.5 sm:p-4">
                            <p className="text-[0.72rem] font-bold uppercase tracking-[0.16em] text-foreground-muted">
                              {messages.adminAssessmentCreditsDailyOverrideLabel}
                            </p>
                            <input
                              type="number"
                              min={1}
                              step={1}
                              value={creditDraft.dailyOverride}
                              onChange={(event) => {
                                updateCreditDraft(user.uid, (current) => ({
                                  ...current,
                                  dailyOverride: event.target.value,
                                }));
                              }}
                              className="field-control h-10 w-full"
                              placeholder={messages.adminAssessmentCreditsDailyOverridePlaceholder}
                            />
                            <div className="grid gap-2 sm:grid-cols-2">
                              <Button
                                type="button"
                                size="sm"
                                disabled={creditsPending}
                                onClick={() => {
                                  void handleSaveDailyOverride(user.uid);
                                }}
                                className="w-full"
                              >
                                {messages.adminAssessmentCreditsSaveOverrideAction}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={creditsPending}
                                onClick={() => {
                                  updateCreditDraft(user.uid, (current) => ({
                                    ...current,
                                    dailyOverride: "",
                                  }));
                                  void patchCredits(user.uid, {
                                    action: "clear_daily_override",
                                  });
                                }}
                                className="w-full"
                              >
                                {messages.adminAssessmentCreditsClearOverrideAction}
                              </Button>
                            </div>
                          </section>

                          <section className="space-y-3 rounded-2xl border border-border bg-background-elevated/75 p-3.5 sm:p-4">
                            <p className="text-[0.72rem] font-bold uppercase tracking-[0.16em] text-foreground-muted">
                              {messages.adminAssessmentCreditsManualLabel}
                            </p>
                            <div className="grid gap-2 sm:grid-cols-2">
                              <input
                                type="number"
                                min={1}
                                step={1}
                                value={creditDraft.manualAmount}
                                onChange={(event) => {
                                  updateCreditDraft(user.uid, (current) => ({
                                    ...current,
                                    manualAmount: event.target.value,
                                  }));
                                }}
                                className="field-control h-10"
                                placeholder={messages.adminAssessmentCreditsAmountPlaceholder}
                              />
                              <input
                                type="number"
                                min={0}
                                step={1}
                                value={creditDraft.manualSetAmount}
                                onChange={(event) => {
                                  updateCreditDraft(user.uid, (current) => ({
                                    ...current,
                                    manualSetAmount: event.target.value,
                                  }));
                                }}
                                className="field-control h-10"
                                placeholder={messages.adminAssessmentCreditsSetAmountPlaceholder}
                              />
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                              <Button
                                type="button"
                                size="sm"
                                disabled={creditsPending}
                                onClick={() => {
                                  void handleManualCreditsMutation(
                                    user.uid,
                                    "add_manual_credits",
                                  );
                                }}
                                className="w-full"
                              >
                                {messages.adminAssessmentCreditsAddAction}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={creditsPending}
                                onClick={() => {
                                  void handleManualCreditsMutation(
                                    user.uid,
                                    "subtract_manual_credits",
                                  );
                                }}
                                className="w-full"
                              >
                                {messages.adminAssessmentCreditsSubtractAction}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={creditsPending}
                                onClick={() => {
                                  void handleManualCreditsMutation(
                                    user.uid,
                                    "set_manual_credits",
                                  );
                                }}
                                className="w-full sm:col-span-2 xl:col-span-1"
                              >
                                {messages.adminAssessmentCreditsSetAction}
                              </Button>
                            </div>
                          </section>
                        </div>

                        <section className="space-y-3 rounded-2xl border border-border bg-background-elevated/75 p-3.5 sm:p-4">
                          <p className="text-[0.72rem] font-bold uppercase tracking-[0.16em] text-foreground-muted">
                            {messages.adminAssessmentCreditsGrantLabel}
                          </p>
                          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                            <input
                              type="number"
                              min={1}
                              step={1}
                              value={creditDraft.grantAmount}
                              onChange={(event) => {
                                updateCreditDraft(user.uid, (current) => ({
                                  ...current,
                                  grantAmount: event.target.value,
                                }));
                              }}
                              className="field-control h-10"
                              placeholder={messages.adminAssessmentCreditsGrantAmountPlaceholder}
                            />
                            <input
                              type="datetime-local"
                              value={creditDraft.grantExpiresAt}
                              min={toLocalDateTimeInput(new Date().toISOString())}
                              onChange={(event) => {
                                updateCreditDraft(user.uid, (current) => ({
                                  ...current,
                                  grantExpiresAt: event.target.value,
                                }));
                              }}
                              className="field-control h-10"
                            />
                            <input
                              type="text"
                              value={creditDraft.grantReason}
                              onChange={(event) => {
                                updateCreditDraft(user.uid, (current) => ({
                                  ...current,
                                  grantReason: event.target.value,
                                }));
                              }}
                              className="field-control h-10 sm:col-span-2 xl:col-span-1"
                              placeholder={messages.adminAssessmentCreditsGrantReasonPlaceholder}
                            />
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            disabled={creditsPending}
                            onClick={() => {
                              void handleGrantCredits(user.uid);
                            }}
                            className="w-full"
                          >
                            {messages.adminAssessmentCreditsGrantAction}
                          </Button>
                        </section>

                        <section className="space-y-3 rounded-2xl border border-border bg-background-elevated/75 p-3.5 sm:p-4">
                          <p className="text-[0.72rem] font-bold uppercase tracking-[0.16em] text-foreground-muted">
                            {messages.adminAssessmentCreditsGrantListLabel}
                          </p>
                          {creditState.grants.length === 0 ? (
                            <p className="text-sm leading-7 text-foreground-muted">
                              {messages.adminAssessmentCreditsNoGrants}
                            </p>
                          ) : (
                            <div className="space-y-2.5">
                              {creditState.grants.map((grant) => {
                                const grantStatusLabel =
                                  grant.effectiveStatus === "active"
                                    ? messages.statusActive
                                    : grant.effectiveStatus === "revoked"
                                      ? messages.adminAssessmentCreditsGrantRevokedLabel
                                      : grant.effectiveStatus === "expired"
                                        ? messages.adminAssessmentCreditsGrantExpiredLabel
                                        : messages.adminAssessmentCreditsGrantExhaustedLabel;

                                return (
                                  <div
                                    key={grant.id}
                                    className="rounded-xl border border-border bg-background px-3 py-2.5"
                                  >
                                    <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
                                      <div className="min-w-0">
                                        <p className="text-sm font-semibold leading-6 text-foreground">
                                          {grant.available}/{grant.credits}
                                        </p>
                                        <p className="text-xs leading-6 text-foreground-muted">
                                          {grantStatusLabel}
                                          {grant.expiresAt
                                            ? ` • ${dateTimeFormatter.format(new Date(grant.expiresAt))}`
                                            : ""}
                                        </p>
                                        {grant.reason ? (
                                          <p className="mt-0.5 text-xs leading-6 text-foreground-muted">
                                            {grant.reason}
                                          </p>
                                        ) : null}
                                      </div>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        disabled={creditsPending || grant.effectiveStatus !== "active"}
                                        onClick={() => {
                                          void handleRevokeGrant(user.uid, grant.id);
                                        }}
                                        className="w-full lg:w-auto lg:min-w-[150px]"
                                      >
                                        {messages.adminAssessmentCreditsGrantRevokeAction}
                                      </Button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </section>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-foreground-muted">
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                        <span>{messages.loading}</span>
                      </div>
                    )}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
                                        size="sm"
                                        disabled={creditsPending}
                                        onClick={() => {
                                          void handleSaveDailyOverride(user.uid);
                                        }}
                                        className="flex-1"
                                      >
                                        {messages.adminAssessmentCreditsSaveOverrideAction}
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        disabled={creditsPending}
                                        onClick={() => {
                                          updateCreditDraft(user.uid, (current) => ({
                                            ...current,
                                            dailyOverride: "",
                                          }));
                                          void patchCredits(user.uid, {
                                            action: "clear_daily_override",
                                          });
                                        }}
                                        className="flex-1"
                                      >
                                        {messages.adminAssessmentCreditsClearOverrideAction}
                                      </Button>
                                    </div>
                                  </div>
                                </div>

                                <div className="space-y-2 rounded-xl border border-border bg-background-strong/60 p-3">
                                  <p className="text-xs font-bold uppercase tracking-wider text-foreground-muted">
                                    {messages.adminAssessmentCreditsManualLabel}
                                  </p>
                                  <div className="grid gap-2 md:grid-cols-2">
                                    <input
                                      type="number"
                                      min={1}
                                      step={1}
                                      value={creditDraft.manualAmount}
                                      onChange={(event) => {
                                        updateCreditDraft(user.uid, (current) => ({
                                          ...current,
                                          manualAmount: event.target.value,
                                        }));
                                      }}
                                      className="field-control h-10"
                                      placeholder={messages.adminAssessmentCreditsAmountPlaceholder}
                                    />
                                    <input
                                      type="number"
                                      min={0}
                                      step={1}
                                      value={creditDraft.manualSetAmount}
                                      onChange={(event) => {
                                        updateCreditDraft(user.uid, (current) => ({
                                          ...current,
                                          manualSetAmount: event.target.value,
                                        }));
                                      }}
                                      className="field-control h-10"
                                      placeholder={messages.adminAssessmentCreditsSetAmountPlaceholder}
                                    />
                                  </div>
                                  <div className="grid gap-2 md:grid-cols-3">
                                    <Button
                                      type="button"
                                      size="sm"
                                      disabled={creditsPending}
                                      onClick={() => {
                                        void handleManualCreditsMutation(
                                          user.uid,
                                          "add_manual_credits",
                                        );
                                      }}
                                    >
                                      {messages.adminAssessmentCreditsAddAction}
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      disabled={creditsPending}
                                      onClick={() => {
                                        void handleManualCreditsMutation(
                                          user.uid,
                                          "subtract_manual_credits",
                                        );
                                      }}
                                    >
                                      {messages.adminAssessmentCreditsSubtractAction}
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      disabled={creditsPending}
                                      onClick={() => {
                                        void handleManualCreditsMutation(
                                          user.uid,
                                          "set_manual_credits",
                                        );
                                      }}
                                    >
                                      {messages.adminAssessmentCreditsSetAction}
                                    </Button>
                                  </div>
                                </div>

                                <div className="space-y-2 rounded-xl border border-border bg-background-strong/60 p-3">
                                  <p className="text-xs font-bold uppercase tracking-wider text-foreground-muted">
                                    {messages.adminAssessmentCreditsGrantLabel}
                                  </p>
                                  <div className="grid gap-2 md:grid-cols-3">
                                    <input
                                      type="number"
                                      min={1}
                                      step={1}
                                      value={creditDraft.grantAmount}
                                      onChange={(event) => {
                                        updateCreditDraft(user.uid, (current) => ({
                                          ...current,
                                          grantAmount: event.target.value,
                                        }));
                                      }}
                                      className="field-control h-10"
                                      placeholder={messages.adminAssessmentCreditsGrantAmountPlaceholder}
                                    />
                                    <input
                                      type="datetime-local"
                                      value={creditDraft.grantExpiresAt}
                                      min={toLocalDateTimeInput(new Date().toISOString())}
                                      onChange={(event) => {
                                        updateCreditDraft(user.uid, (current) => ({
                                          ...current,
                                          grantExpiresAt: event.target.value,
                                        }));
                                      }}
                                      className="field-control h-10"
                                    />
                                    <input
                                      type="text"
                                      value={creditDraft.grantReason}
                                      onChange={(event) => {
                                        updateCreditDraft(user.uid, (current) => ({
                                          ...current,
                                          grantReason: event.target.value,
                                        }));
                                      }}
                                      className="field-control h-10"
                                      placeholder={messages.adminAssessmentCreditsGrantReasonPlaceholder}
                                    />
                                  </div>
                                  <Button
                                    type="button"
                                    size="sm"
                                    disabled={creditsPending}
                                    onClick={() => {
                                      void handleGrantCredits(user.uid);
                                    }}
                                    className="w-full"
                                  >
                                    {messages.adminAssessmentCreditsGrantAction}
                                  </Button>
                                </div>

                                <div className="space-y-2 rounded-xl border border-border bg-background-strong/60 p-3">
                                  <p className="text-xs font-bold uppercase tracking-wider text-foreground-muted">
                                    {messages.adminAssessmentCreditsGrantListLabel}
                                  </p>
                                  {creditState.grants.length === 0 ? (
                                    <p className="text-sm text-foreground-muted">
                                      {messages.adminAssessmentCreditsNoGrants}
                                    </p>
                                  ) : (
                                    <div className="space-y-2">
                                      {creditState.grants.map((grant) => {
                                        const grantStatusLabel =
                                          grant.effectiveStatus === "active"
                                            ? messages.statusActive
                                            : grant.effectiveStatus === "revoked"
                                              ? messages.adminAssessmentCreditsGrantRevokedLabel
                                              : grant.effectiveStatus === "expired"
                                                ? messages.adminAssessmentCreditsGrantExpiredLabel
                                                : messages.adminAssessmentCreditsGrantExhaustedLabel;

                                        return (
                                          <div
                                            key={grant.id}
                                            className="rounded-xl border border-border bg-background px-3 py-2"
                                          >
                                            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                              <div className="min-w-0">
                                                <p className="text-sm font-semibold text-foreground">
                                                  {grant.available}/{grant.credits}
                                                </p>
                                                <p className="text-xs text-foreground-muted">
                                                  {grantStatusLabel}
                                                  {grant.expiresAt
                                                    ? ` • ${dateTimeFormatter.format(new Date(grant.expiresAt))}`
                                                    : ""}
                                                </p>
                                                {grant.reason ? (
                                                  <p className="mt-1 text-xs text-foreground-muted">
                                                    {grant.reason}
                                                  </p>
                                                ) : null}
                                              </div>
                                              <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                disabled={
                                                  creditsPending || grant.effectiveStatus !== "active"
                                                }
                                                onClick={() => {
                                                  void handleRevokeGrant(user.uid, grant.id);
                                                }}
                                                className="md:min-w-[150px]"
                                              >
                                                {messages.adminAssessmentCreditsGrantRevokeAction}
                                              </Button>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 text-sm text-foreground-muted">
                                <LoaderCircle className="h-4 w-4 animate-spin" />
                                <span>{messages.loading}</span>
                              </div>
                            )}
                          </div>
                        ) : null}
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
