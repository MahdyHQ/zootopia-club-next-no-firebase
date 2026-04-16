"use client";

import type {
  AdminAssessmentCreditMutationRecord,
  AssessmentCreditAccountRecord,
  AssessmentDailyCreditsSummary,
} from "@zootopia/shared-types";
import {
  CalendarClock,
  Calculator,
  Coins,
  Equal,
  Gift,
  Minus,
  Plus,
  SlidersHorizontal,
} from "lucide-react";
import { startTransition, useActionState, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  INITIAL_ADMIN_CREDIT_WORKSPACE_FEEDBACK_STATE,
  type AdminCreditWorkspaceFeedbackState,
} from "@/lib/admin-credit-feedback";

type WorkspaceActionMode = "add" | "subtract" | "set" | "grant" | "override";

type WorkspacePreview = {
  submitLabel: string;
  tone: "primary" | "danger";
  valid: boolean;
  title: string;
  detail: string;
  lines: Array<{ label: string; value: string }>;
};

type AdminCreditManagementWorkspaceProps = {
  targetUid: string;
  currentCredits: AssessmentDailyCreditsSummary | null;
  currentAccount: AssessmentCreditAccountRecord | null;
  latestMutation: AdminAssessmentCreditMutationRecord | null;
  disabled: boolean;
  disabledReason: string | null;
  mutationAction: (
    previousState: AdminCreditWorkspaceFeedbackState,
    formData: FormData,
  ) => AdminCreditWorkspaceFeedbackState | Promise<AdminCreditWorkspaceFeedbackState>;
};

const ACTION_OPTIONS: Array<{ mode: WorkspaceActionMode; label: string }> = [
  { mode: "add", label: "Add Credits" },
  { mode: "subtract", label: "Subtract Credits" },
  { mode: "set", label: "Set Balance" },
  { mode: "grant", label: "Create Temporary Grant" },
  { mode: "override", label: "Set Daily Override" },
];

function parsePositiveInteger(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  const rounded = Math.round(parsed);
  return rounded > 0 ? rounded : null;
}

function parseNonNegativeInteger(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  const rounded = Math.round(parsed);
  return rounded >= 0 ? rounded : null;
}

function formatMutationActionLabel(action: AdminAssessmentCreditMutationRecord["action"]) {
  switch (action) {
    case "set_access":
      return "Access Updated";
    case "set_daily_override":
      return "Daily Override Set";
    case "clear_daily_override":
      return "Daily Override Cleared";
    case "add_manual_credits":
      return "Manual Credits Added";
    case "subtract_manual_credits":
      return "Manual Credits Removed";
    case "set_manual_credits":
      return "Manual Credits Set";
    case "grant_credits":
      return "Grant Created";
    case "revoke_grant":
      return "Grant Revoked";
    default:
      return "Credit Mutation";
  }
}

function formatDateTime(value: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(parsed));
}

export function AdminCreditManagementWorkspace({
  targetUid,
  currentCredits,
  currentAccount,
  latestMutation,
  disabled,
  disabledReason,
  mutationAction,
}: AdminCreditManagementWorkspaceProps) {
  const router = useRouter();
  const [actionMode, setActionMode] = useState<WorkspaceActionMode>("add");
  const [amountInput, setAmountInput] = useState("");
  const [dailyOverrideInput, setDailyOverrideInput] = useState("");
  const [grantExpiryInput, setGrantExpiryInput] = useState("");
  const [reasonInput, setReasonInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [clearOverride, setClearOverride] = useState(false);
  /* The credit workspace keeps mutation authority on the server action, but the client owns
     local pending/feedback rendering plus the post-success route refresh. Future agents: do not
     reintroduce redirect-based same-page flashes here, or the protected scroll container will
     jump away from the operator's current section context. */
  const runWorkspaceMutation = async (
    previousState: AdminCreditWorkspaceFeedbackState,
    formData: FormData,
  ) => {
    const nextState = await mutationAction(previousState, formData);

    if (nextState.status === "success") {
      /* Successful credit mutations should clear the operator's draft inputs and refresh the
         server-rendered admin cards/history without losing scroll or section-local feedback.
         Keep this in the action lane itself so React does not need an effect-driven reset pass. */
      setAmountInput("");
      setDailyOverrideInput("");
      setGrantExpiryInput("");
      setReasonInput("");
      setNoteInput("");
      setClearOverride(false);
      startTransition(() => {
        router.refresh();
      });
    }

    return nextState;
  };
  const [mutationState, formAction, pending] = useActionState(
    runWorkspaceMutation,
    INITIAL_ADMIN_CREDIT_WORKSPACE_FEEDBACK_STATE,
  );

  const manualCredits = currentAccount?.manualCredits ?? 0;
  const remainingCount = currentCredits?.remainingCount ?? null;
  const numberFormatter = new Intl.NumberFormat("en-US");
  const controlsDisabled = disabled || pending;

  /* Preview is intentionally computed from the latest server-resolved snapshot shown on this page.
     For actions where an exact post-submit balance cannot be guaranteed client-side, we say so
     explicitly instead of inventing certainty. */
  const preview: WorkspacePreview = (() => {
    switch (actionMode) {
      case "add": {
        const amount = parsePositiveInteger(amountInput);
        if (!amount) {
          return {
            submitLabel: "Apply Credit Change",
            tone: "primary",
            valid: false,
            title: "Preview pending",
            detail: "Enter a positive amount to preview this mutation.",
            lines: [
              { label: "Current manual credits", value: numberFormatter.format(manualCredits) },
            ],
          };
        }

        const projectedManual = manualCredits + amount;
        const projectedRemaining =
          typeof remainingCount === "number"
            ? Math.max(remainingCount + amount, 0)
            : null;

        return {
          submitLabel: "Apply Credit Change",
          tone: "primary",
          valid: true,
          title: "Manual credit increase",
          detail: "Projection uses the current server summary snapshot on this page.",
          lines: [
            { label: "Current manual credits", value: numberFormatter.format(manualCredits) },
            { label: "Action", value: `Add ${numberFormatter.format(amount)}` },
            { label: "Projected manual credits", value: numberFormatter.format(projectedManual) },
            {
              label: "Projected remaining balance",
              value:
                projectedRemaining === null
                  ? "Resolved by server after submit"
                  : numberFormatter.format(projectedRemaining),
            },
          ],
        };
      }

      case "subtract": {
        const amount = parsePositiveInteger(amountInput);
        if (!amount) {
          return {
            submitLabel: "Apply Credit Change",
            tone: "danger",
            valid: false,
            title: "Preview pending",
            detail: "Enter a positive amount to preview this mutation.",
            lines: [
              { label: "Current manual credits", value: numberFormatter.format(manualCredits) },
            ],
          };
        }

        const projectedManual = Math.max(manualCredits - amount, 0);
        const projectedRemaining =
          typeof remainingCount === "number"
            ? Math.max(remainingCount - amount, 0)
            : null;

        return {
          submitLabel: "Apply Credit Change",
          tone: "danger",
          valid: true,
          title: "Manual credit decrease",
          detail: "Projection assumes no simultaneous external mutation between now and submit.",
          lines: [
            { label: "Current manual credits", value: numberFormatter.format(manualCredits) },
            { label: "Action", value: `Subtract ${numberFormatter.format(amount)}` },
            { label: "Projected manual credits", value: numberFormatter.format(projectedManual) },
            {
              label: "Projected remaining balance",
              value:
                projectedRemaining === null
                  ? "Resolved by server after submit"
                  : numberFormatter.format(projectedRemaining),
            },
          ],
        };
      }

      case "set": {
        const amount = parseNonNegativeInteger(amountInput);
        if (amount === null) {
          return {
            submitLabel: "Apply Credit Change",
            tone: "primary",
            valid: false,
            title: "Preview pending",
            detail: "Enter a non-negative balance value.",
            lines: [
              { label: "Current manual credits", value: numberFormatter.format(manualCredits) },
            ],
          };
        }

        const delta = amount - manualCredits;
        const projectedRemaining =
          typeof remainingCount === "number"
            ? Math.max(remainingCount + delta, 0)
            : null;

        return {
          submitLabel: "Apply Credit Change",
          tone: "primary",
          valid: true,
          title: "Manual balance set",
          detail: "This rewrites manual credits to the exact value shown below.",
          lines: [
            { label: "Current manual credits", value: numberFormatter.format(manualCredits) },
            { label: "Action", value: `Set to ${numberFormatter.format(amount)}` },
            { label: "Projected manual credits", value: numberFormatter.format(amount) },
            {
              label: "Projected remaining balance",
              value:
                projectedRemaining === null
                  ? "Resolved by server after submit"
                  : numberFormatter.format(projectedRemaining),
            },
          ],
        };
      }

      case "grant": {
        const amount = parsePositiveInteger(amountInput);
        if (!amount) {
          return {
            submitLabel: "Create Grant",
            tone: "primary",
            valid: false,
            title: "Preview pending",
            detail: "Enter a positive grant amount.",
            lines: [
              {
                label: "Current grant credits",
                value: numberFormatter.format(currentCredits?.grantCreditsAvailable ?? 0),
              },
            ],
          };
        }

        const accessDisabled = currentAccount?.assessmentAccess === "disabled";
        const projectedGrantCredits = (currentCredits?.grantCreditsAvailable ?? 0) + amount;
        const projectedRemaining =
          accessDisabled
            ? 0
            : typeof remainingCount === "number"
              ? remainingCount + amount
              : null;

        return {
          submitLabel: "Create Grant",
          tone: "primary",
          valid: true,
          title: "Temporary grant creation",
          detail:
            accessDisabled
              ? "Access is currently disabled; granted credits persist but remain unusable until access is re-enabled."
              : "Grant availability is projected from current snapshot and finalized server-side.",
          lines: [
            {
              label: "Current grant credits",
              value: numberFormatter.format(currentCredits?.grantCreditsAvailable ?? 0),
            },
            { label: "Action", value: `Grant ${numberFormatter.format(amount)}` },
            {
              label: "Projected grant credits",
              value: numberFormatter.format(projectedGrantCredits),
            },
            {
              label: "Projected remaining balance",
              value:
                projectedRemaining === null
                  ? "Resolved by server after submit"
                  : numberFormatter.format(projectedRemaining),
            },
          ],
        };
      }

      case "override": {
        if (!clearOverride) {
          const override = parsePositiveInteger(dailyOverrideInput);
          if (!override) {
            return {
              submitLabel: "Save Override",
              tone: "primary",
              valid: false,
              title: "Preview pending",
              detail: "Enter a positive daily override value, or choose clear.",
              lines: [
                {
                  label: "Current daily limit",
                  value:
                    typeof currentCredits?.dailyLimit === "number"
                      ? numberFormatter.format(currentCredits.dailyLimit)
                      : "Unavailable",
                },
              ],
            };
          }

          return {
            submitLabel: "Save Override",
            tone: "primary",
            valid: true,
            title: "Daily override update",
            detail: "Daily-limit effects are resolved by server credit computation immediately after submit.",
            lines: [
              {
                label: "Current daily limit",
                value:
                  typeof currentCredits?.dailyLimit === "number"
                    ? numberFormatter.format(currentCredits.dailyLimit)
                    : "Unavailable",
              },
              { label: "Action", value: `Set override to ${numberFormatter.format(override)}` },
              { label: "Projected daily limit", value: numberFormatter.format(override) },
            ],
          };
        }

        return {
          submitLabel: "Clear Override",
          tone: "danger",
          valid: true,
          title: "Daily override clear",
          detail: "The account returns to the default daily limit after server recomputation.",
          lines: [
            {
              label: "Current override",
              value:
                typeof currentAccount?.dailyLimitOverride === "number"
                  ? numberFormatter.format(currentAccount.dailyLimitOverride)
                  : "No active override",
            },
            {
              label: "Projected daily limit",
              value:
                typeof currentCredits?.dailyDefaultLimit === "number"
                  ? numberFormatter.format(currentCredits.dailyDefaultLimit)
                  : "Default (server resolved)",
            },
          ],
        };
      }

      default:
        return {
          submitLabel: "Apply Credit Change",
          tone: "primary",
          valid: false,
          title: "Preview pending",
          detail: "Choose an action to continue.",
          lines: [],
        };
    }
  })();

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-zinc-200/80 bg-white/92 p-4 shadow-[0_8px_20px_rgba(148,163,184,0.10)] dark:border-zinc-800 dark:bg-zinc-900/55 dark:shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
              Current Credit Truth
            </p>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Snapshot from server-resolved account and credit summary for this target user.
            </p>
          </div>
          <span className="rounded-full border border-zinc-300/80 bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {targetUid}
          </span>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <p className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-300">
            Remaining: <span className="font-semibold text-zinc-900 dark:text-zinc-100">{typeof currentCredits?.remainingCount === "number" ? numberFormatter.format(currentCredits.remainingCount) : "Unlimited / unavailable"}</span>
          </p>
          <p className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-300">
            Manual: <span className="font-semibold text-zinc-900 dark:text-zinc-100">{numberFormatter.format(manualCredits)}</span>
          </p>
          <p className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-300">
            Grant credits: <span className="font-semibold text-zinc-900 dark:text-zinc-100">{numberFormatter.format(currentCredits?.grantCreditsAvailable ?? 0)}</span>
          </p>
          <p className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-300">
            Daily limit: <span className="font-semibold text-zinc-900 dark:text-zinc-100">{typeof currentCredits?.dailyLimit === "number" ? numberFormatter.format(currentCredits.dailyLimit) : "Unavailable"}</span>
          </p>
          <p className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-300">
            Access: <span className="font-semibold text-zinc-900 dark:text-zinc-100">{currentAccount?.assessmentAccess ?? "Unavailable"}</span>
          </p>
          <p className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-300">
            Last update: <span className="font-semibold text-zinc-900 dark:text-zinc-100">{latestMutation ? formatDateTime(latestMutation.createdAt) : "No mutation yet"}</span>
          </p>
        </div>
      </div>

      {disabledReason ? (
        <div className="rounded-xl border border-sky-300/80 bg-sky-50 px-3.5 py-3 text-sm text-sky-800 shadow-sm shadow-sky-100/80 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-200 dark:shadow-none">
          {disabledReason}
        </div>
      ) : null}

      {mutationState.message ? (
        <div
          aria-live={mutationState.status === "error" ? "assertive" : "polite"}
          className={`rounded-xl px-3.5 py-3 text-sm shadow-sm ${
            mutationState.status === "error"
              ? "border border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300"
              : "border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200"
          }`}
        >
          {mutationState.message}
        </div>
      ) : null}

      <form action={formAction} className="space-y-4" aria-busy={pending}>
        <input type="hidden" name="targetUid" value={targetUid} />
        <input type="hidden" name="workspaceAction" value={actionMode} />

        <div className="rounded-xl border border-zinc-200/80 bg-white/92 p-4 shadow-[0_8px_20px_rgba(148,163,184,0.10)] dark:border-zinc-800 dark:bg-zinc-900/55 dark:shadow-none">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
            Action Type
          </p>
          <div className="mt-3 grid gap-2 md:grid-cols-2 md:gap-3 xl:grid-cols-5 xl:gap-3" role="radiogroup" aria-label="Credit action type">
            {ACTION_OPTIONS.map((option) => {
              const selected = option.mode === actionMode;

              return (
                <button
                  key={option.mode}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={controlsDisabled}
                  onClick={() => setActionMode(option.mode)}
                  className={`min-h-10 rounded-lg border px-3 py-2 text-[11px] font-semibold uppercase leading-tight tracking-wider whitespace-normal transition-colors ${selected ? "border-emerald-500 bg-emerald-50 text-emerald-900 dark:border-emerald-500/60 dark:bg-emerald-500/15 dark:text-emerald-200" : "border-zinc-300 bg-white text-zinc-700 hover:border-emerald-400 hover:text-emerald-800 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-300 dark:hover:border-emerald-500/40 dark:hover:text-emerald-200"}`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          <div className="mt-4 space-y-3">
            {(actionMode === "add" || actionMode === "subtract" || actionMode === "set" || actionMode === "grant") ? (
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
                Amount
                <input
                  type="number"
                  name="amount"
                  min={actionMode === "set" ? 0 : 1}
                  step={1}
                  value={amountInput}
                  onChange={(event) => setAmountInput(event.target.value)}
                  disabled={controlsDisabled}
                  className="mt-1 h-10 w-full rounded-lg border border-zinc-300/90 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-500 focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-100"
                  placeholder={actionMode === "set" ? "Set manual credits to..." : "Enter amount"}
                />
              </label>
            ) : null}

            {actionMode === "grant" ? (
              <>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
                  Optional expiry
                  <input
                    type="datetime-local"
                    name="expiresAt"
                    value={grantExpiryInput}
                    onChange={(event) => setGrantExpiryInput(event.target.value)}
                    disabled={controlsDisabled}
                    className="mt-1 h-10 w-full rounded-lg border border-zinc-300/90 bg-white px-3 text-sm text-zinc-900 focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-100"
                  />
                </label>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
                  Internal note (optional)
                  <textarea
                    name="note"
                    value={noteInput}
                    onChange={(event) => setNoteInput(event.target.value)}
                    disabled={controlsDisabled}
                    maxLength={1000}
                    className="mt-1 min-h-20 w-full resize-y rounded-lg border border-zinc-300/90 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-500 focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-100"
                    placeholder="Optional internal context for this grant"
                  />
                </label>
              </>
            ) : null}

            {actionMode === "override" ? (
              <>
                <input
                  type="hidden"
                  name="overrideMode"
                  value={clearOverride ? "clear" : "set"}
                />
                {typeof currentAccount?.dailyLimitOverride === "number" ? (
                  <label className="inline-flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                    <input
                      type="checkbox"
                      checked={clearOverride}
                      onChange={(event) => setClearOverride(event.target.checked)}
                      disabled={controlsDisabled}
                      className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    Clear current override ({numberFormatter.format(currentAccount.dailyLimitOverride)})
                  </label>
                ) : null}
                {!clearOverride ? (
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
                    Daily override value
                    <input
                      type="number"
                      name="dailyLimitOverride"
                      min={1}
                      step={1}
                      value={dailyOverrideInput}
                      onChange={(event) => setDailyOverrideInput(event.target.value)}
                      disabled={controlsDisabled}
                      className="mt-1 h-10 w-full rounded-lg border border-zinc-300/90 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-500 focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-100"
                      placeholder="Override daily limit"
                    />
                  </label>
                ) : null}
              </>
            ) : null}

            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
              Reason (optional)
              <input
                type="text"
                name="reason"
                value={reasonInput}
                onChange={(event) => setReasonInput(event.target.value)}
                disabled={controlsDisabled}
                maxLength={320}
                className="mt-1 h-10 w-full rounded-lg border border-zinc-300/90 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-500 focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-100"
                placeholder="Short operator note for audit context"
              />
            </label>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200/80 bg-white/92 p-4 shadow-[0_8px_20px_rgba(148,163,184,0.10)] dark:border-zinc-800 dark:bg-zinc-900/55 dark:shadow-none">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-zinc-300 bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              <Calculator className="h-3.5 w-3.5" />
              Result Preview
            </span>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{preview.title}</p>
          </div>

          <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">{preview.detail}</p>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {preview.lines.map((line) => (
              <p
                key={line.label}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/65 dark:text-zinc-300"
              >
                {line.label}: <span className="font-semibold text-zinc-900 dark:text-zinc-100">{line.value}</span>
              </p>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-zinc-200/80 bg-white/92 p-4 shadow-[0_8px_20px_rgba(148,163,184,0.10)] dark:border-zinc-800 dark:bg-zinc-900/55 dark:shadow-none sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
            {actionMode === "grant" ? <Gift className="h-4 w-4" /> : null}
            {actionMode === "add" ? <Plus className="h-4 w-4" /> : null}
            {actionMode === "subtract" ? <Minus className="h-4 w-4" /> : null}
            {actionMode === "set" ? <Equal className="h-4 w-4" /> : null}
            {actionMode === "override" ? <SlidersHorizontal className="h-4 w-4" /> : null}
            {actionMode === "grant" && grantExpiryInput ? <CalendarClock className="h-4 w-4" /> : null}
            <span>One primary action submits this mutation with backend authority.</span>
          </div>

          <Button
            type="submit"
            size="sm"
            disabled={controlsDisabled || !preview.valid}
            className={`h-10 px-5 ${preview.tone === "danger" ? "border border-red-500/80 bg-red-600 text-white hover:border-red-700 hover:bg-red-700 dark:border-red-500/40 dark:bg-danger dark:hover:bg-danger/90" : "border border-emerald-500/70 bg-emerald-600 text-white hover:border-emerald-700 hover:bg-emerald-700 dark:border-accent/40 dark:bg-accent dark:hover:bg-accent/90"}`}
          >
            <Coins className="h-4 w-4" />
            {pending ? "Applying..." : preview.submitLabel}
          </Button>
        </div>
      </form>

      {latestMutation ? (
        <div className="rounded-xl border border-zinc-200/80 bg-white/92 p-3 text-xs text-zinc-700 shadow-[0_8px_20px_rgba(148,163,184,0.10)] dark:border-zinc-800 dark:bg-zinc-900/55 dark:text-zinc-300 dark:shadow-none">
          Latest audit: <span className="font-semibold text-zinc-900 dark:text-zinc-100">{formatMutationActionLabel(latestMutation.action)}</span>
          {" "}at {formatDateTime(latestMutation.createdAt)} by {latestMutation.adminUid}
        </div>
      ) : null}
    </div>
  );
}
