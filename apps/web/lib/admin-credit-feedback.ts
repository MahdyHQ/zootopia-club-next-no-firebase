import type { AdminAssessmentCreditMutationAction } from "@zootopia/shared-types";

export type AdminCreditWorkspaceFeedbackState = {
  status: "idle" | "success" | "error";
  action: AdminAssessmentCreditMutationAction | null;
  code: string | null;
  message: string | null;
  feedbackId: string | null;
};

export const INITIAL_ADMIN_CREDIT_WORKSPACE_FEEDBACK_STATE: AdminCreditWorkspaceFeedbackState =
  {
    status: "idle",
    action: null,
    code: null,
    message: null,
    feedbackId: null,
  };

const ADMIN_CREDIT_SUCCESS_MESSAGES: Record<AdminAssessmentCreditMutationAction, string> = {
  set_access: "Assessment access was updated successfully.",
  set_daily_override: "Daily credit override was saved successfully.",
  clear_daily_override: "Daily credit override was cleared successfully.",
  add_manual_credits: "Manual credits were added successfully.",
  subtract_manual_credits: "Manual credits were deducted successfully.",
  set_manual_credits: "Manual credits were set successfully.",
  grant_credits: "Credit grant was created successfully.",
  revoke_grant: "Credit grant was revoked successfully.",
};

const ADMIN_CREDIT_ERROR_MESSAGES: Record<string, string> = {
  credits_user_not_found: "The selected user no longer exists.",
  credits_self_mutation_forbidden:
    "Admins cannot mutate their own assessment credit balances.",
  credits_amount_invalid: "Enter a valid credit amount.",
  credits_daily_override_invalid:
    "Daily override must be a positive whole number.",
  credits_grant_expiry_invalid:
    "Grant expiration must be a valid future date and time.",
  credits_grant_id_required: "A grant identifier is required for this operation.",
  credits_grant_not_found: "The selected grant could not be found.",
  credits_grant_owner_mismatch:
    "The selected grant does not belong to this user.",
  credits_grant_already_revoked: "This grant was already revoked.",
  credits_invalid_request: "The credit mutation request is invalid.",
  credits_update_failed: "Unable to update credits right now. Try again shortly.",
};

export function getAdminCreditMutationSuccessMessage(
  action: string | null | undefined,
) {
  if (!action) {
    return null;
  }

  return (
    ADMIN_CREDIT_SUCCESS_MESSAGES[action as AdminAssessmentCreditMutationAction]
    ?? "Assessment credits updated successfully."
  );
}

export function getAdminCreditMutationErrorMessage(code: string | null | undefined) {
  if (!code) {
    return null;
  }

  return ADMIN_CREDIT_ERROR_MESSAGES[code] ?? null;
}
