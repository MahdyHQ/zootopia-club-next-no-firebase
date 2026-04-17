"use client";

import { startTransition, useActionState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

export type AdminUserDetailInlineActionState = {
  status: "idle" | "success" | "error";
  code: string | null;
  message: string | null;
  feedbackId: string | null;
};

export const INITIAL_ADMIN_USER_DETAIL_INLINE_ACTION_STATE: AdminUserDetailInlineActionState = {
  status: "idle",
  code: null,
  message: null,
  feedbackId: null,
};

export type AdminUserDetailInlineAction = (
  previousState: AdminUserDetailInlineActionState,
  formData: FormData,
) =>
  | AdminUserDetailInlineActionState
  | Promise<AdminUserDetailInlineActionState>;

type AdminUserDetailInlineActionFieldConfig = {
  name: string;
  label?: string;
  hint?: string;
  placeholder: string;
  maxLength?: number;
  required?: boolean;
  className: string;
};

type AdminUserDetailInlineActionHiddenField = {
  name: string;
  value: string;
};

type AdminUserDetailInlineActionFormProps = {
  action: AdminUserDetailInlineAction;
  buttonLabel: string;
  buttonPendingLabel?: string;
  buttonVariant?: "default" | "outline" | "destructive";
  buttonClassName?: string;
  buttonIcon?: React.ReactNode;
  disabled?: boolean;
  formClassName?: string;
  hiddenFields?: AdminUserDetailInlineActionHiddenField[];
  textField?: AdminUserDetailInlineActionFieldConfig;
  refreshOnSuccess?: boolean;
  messageClassName?: string;
};

export function AdminUserDetailInlineActionForm({
  action,
  buttonLabel,
  buttonPendingLabel = "Applying...",
  buttonVariant = "outline",
  buttonClassName,
  buttonIcon,
  disabled = false,
  formClassName = "space-y-2",
  hiddenFields = [],
  textField,
  refreshOnSuccess = true,
  messageClassName,
}: AdminUserDetailInlineActionFormProps) {
  const router = useRouter();

  /* This client wrapper keeps action feedback local to the owning control card while the
     mutation itself remains server-authoritative. Keep refresh scoped to success only so
     operators do not lose failed-input context after validation errors. */
  const runInlineAction = async (
    previousState: AdminUserDetailInlineActionState,
    formData: FormData,
  ) => {
    const nextState = await action(previousState, formData);

    if (refreshOnSuccess && nextState.status === "success") {
      startTransition(() => {
        router.refresh();
      });
    }

    return nextState;
  };

  const [state, formAction, pending] = useActionState(
    runInlineAction,
    INITIAL_ADMIN_USER_DETAIL_INLINE_ACTION_STATE,
  );
  const controlsDisabled = disabled || pending;
  const resolvedMessageClassName = messageClassName
    ?? (state.status === "error"
      ? "rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300"
      : "rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200");

  return (
    <form action={formAction} className={formClassName}>
      {hiddenFields.map((field) => (
        <input key={field.name} type="hidden" name={field.name} value={field.value} />
      ))}

      {textField ? (
        <div className="space-y-1">
          {textField.label ? (
            <p className="text-[11px] font-semibold uppercase tracking-wider text-red-700 dark:text-red-300">
              {textField.label}
            </p>
          ) : null}
          {textField.hint ? (
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{textField.hint}</p>
          ) : null}
          <input
            type="text"
            name={textField.name}
            placeholder={textField.placeholder}
            className={textField.className}
            disabled={controlsDisabled}
            maxLength={textField.maxLength}
            required={textField.required}
          />
        </div>
      ) : null}

      {state.message ? (
        <p aria-live={state.status === "error" ? "assertive" : "polite"} className={resolvedMessageClassName}>
          {state.message}
        </p>
      ) : null}

      <Button
        type="submit"
        variant={buttonVariant}
        size="sm"
        disabled={controlsDisabled}
        className={buttonClassName}
      >
        {buttonIcon}
        {pending ? buttonPendingLabel : buttonLabel}
      </Button>
    </form>
  );
}
