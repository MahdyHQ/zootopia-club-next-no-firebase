import { createClient } from "@supabase/supabase-js";

import { validateUserPasswordPolicy } from "@/lib/password-policy";
import { apiError, apiSuccess, applyNoStore } from "@/lib/server/api";
import { isAllowlistedAdminEmail } from "@/lib/server/admin-auth";
import { recordUserPasswordSecurityEvent } from "@/lib/server/password-security-events";
import { appendAdminLog } from "@/lib/server/repository";
import { getAuthenticatedSessionUser } from "@/lib/server/session";
import {
  getSupabasePublishableKey,
  getSupabaseUrl,
} from "@/lib/supabase/public-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type PasswordChangeRequestBody = {
  currentPassword?: unknown;
  newPassword?: unknown;
  confirmPassword?: unknown;
};

function readPasswordInput(value: unknown) {
  return typeof value === "string" ? value : "";
}

function createPasswordFlowSupabaseClient() {
  const supabaseUrl = getSupabaseUrl();
  const supabasePublishableKey = getSupabasePublishableKey();

  if (!supabaseUrl || !supabasePublishableKey) {
    return null;
  }

  return createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function mapPasswordChangeUpdateError(error: { code?: string; message?: string; status?: number }) {
  const normalizedCode = String(error.code || "").trim().toLowerCase();
  const normalizedMessage = String(error.message || "").trim().toLowerCase();

  if (normalizedCode.includes("same") || normalizedMessage.includes("same password")) {
    return {
      code: "PASSWORD_CHANGE_REUSED_PASSWORD",
      message: "New password must be different from your current password.",
      status: 400,
    };
  }

  if (normalizedCode.includes("weak") || normalizedMessage.includes("weak password")) {
    return {
      code: "PASSWORD_POLICY_FAILED",
      message: "The new password does not meet the required policy.",
      status: 400,
    };
  }

  if (normalizedCode.includes("rate") || normalizedMessage.includes("too many")) {
    return {
      code: "PASSWORD_CHANGE_RATE_LIMITED",
      message: "Too many password change attempts. Please retry shortly.",
      status: 429,
    };
  }

  if (normalizedCode.includes("reauth") || normalizedMessage.includes("reauth")) {
    return {
      code: "PASSWORD_CHANGE_REAUTH_REQUIRED",
      message: "Please sign in again before changing the password.",
      status: 401,
    };
  }

  return {
    code: "PASSWORD_CHANGE_UPDATE_FAILED",
    message: "Password could not be updated right now.",
    status: 502,
  };
}

export async function POST(request: Request) {
  const user = await getAuthenticatedSessionUser();
  if (!user) {
    return applyNoStore(
      apiError("UNAUTHENTICATED", "Sign in is required.", 401),
    );
  }

  if (user.role === "admin" || isAllowlistedAdminEmail(user.email)) {
    return applyNoStore(
      apiError(
        "ADMIN_PASSWORD_FLOW_UNSUPPORTED",
        "Admin accounts must use the dedicated admin authentication lane.",
        403,
      ),
    );
  }

  if (!user.email) {
    return applyNoStore(
      apiError(
        "PASSWORD_CHANGE_EMAIL_UNAVAILABLE",
        "This account is missing an email identity required for password verification.",
        400,
      ),
    );
  }

  let body: PasswordChangeRequestBody;

  try {
    body = (await request.json()) as PasswordChangeRequestBody;
  } catch {
    return applyNoStore(
      apiError("INVALID_JSON", "Request body must be valid JSON.", 400),
    );
  }

  const currentPassword = readPasswordInput(body.currentPassword);
  const newPassword = readPasswordInput(body.newPassword);
  const confirmPassword = readPasswordInput(body.confirmPassword);

  if (!currentPassword || !newPassword || !confirmPassword) {
    const fieldErrors: Record<string, string> = {};
    if (!currentPassword) {
      fieldErrors.currentPassword = "Current password is required.";
    }
    if (!newPassword) {
      fieldErrors.newPassword = "New password is required.";
    }
    if (!confirmPassword) {
      fieldErrors.confirmPassword = "Confirm password is required.";
    }

    return applyNoStore(
      apiError(
        "PASSWORD_CHANGE_FIELDS_REQUIRED",
        "Current password, new password, and confirmation are required.",
        400,
        fieldErrors,
      ),
    );
  }

  if (newPassword !== confirmPassword) {
    return applyNoStore(
      apiError(
        "PASSWORD_CHANGE_CONFIRM_MISMATCH",
        "New password and confirmation do not match.",
        400,
        {
          confirmPassword: "New password and confirmation do not match.",
        },
      ),
    );
  }

  if (newPassword === currentPassword) {
    return applyNoStore(
      apiError(
        "PASSWORD_CHANGE_REUSED_PASSWORD",
        "New password must be different from your current password.",
        400,
        {
          newPassword: "New password must be different from your current password.",
        },
      ),
    );
  }

  const passwordPolicy = validateUserPasswordPolicy({
    password: newPassword,
    email: user.email,
    fullName: user.fullName,
  });

  if (!passwordPolicy.ok) {
    return applyNoStore(
      apiError(
        "PASSWORD_POLICY_FAILED",
        passwordPolicy.error,
        400,
        {
          newPassword: passwordPolicy.error,
        },
      ),
    );
  }

  const supabase = createPasswordFlowSupabaseClient();
  if (!supabase) {
    return applyNoStore(
      apiError(
        "PASSWORD_CHANGE_UNAVAILABLE",
        "Password change runtime is unavailable right now.",
        503,
      ),
    );
  }

  try {
    const signInResult = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });

    if (signInResult.error || !signInResult.data.session) {
      return applyNoStore(
        apiError(
          "PASSWORD_CHANGE_CURRENT_PASSWORD_INVALID",
          "Current password is incorrect.",
          401,
          {
            currentPassword: "Current password is incorrect.",
          },
        ),
      );
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      const mapped = mapPasswordChangeUpdateError(updateError);
      return applyNoStore(
        apiError(
          mapped.code,
          mapped.message,
          mapped.status,
          mapped.code === "PASSWORD_POLICY_FAILED"
            ? { newPassword: mapped.message }
            : undefined,
        ),
      );
    }

    const { error: hardeningError } = await supabase.auth.signOut({
      scope: "others",
    });

    const sessionHardeningSucceeded = !hardeningError;

    await recordUserPasswordSecurityEvent({
      request,
      uid: user.uid,
      eventType: "in_account_change",
      eventSource: "settings",
      sessionHardeningAttempted: true,
      sessionHardeningSucceeded,
    });

    await appendAdminLog({
      actorUid: user.uid,
      actorRole: "user",
      ownerUid: user.uid,
      ownerRole: "user",
      action: "user-password-changed-in-account",
      resourceType: "session",
      resourceId: user.uid,
      route: "/api/auth/password/change",
      metadata: {
        sessionHardeningSucceeded,
      },
    });

    return applyNoStore(
      apiSuccess({
        passwordUpdated: true,
        requiresReauth: true,
        sessionHardeningSucceeded,
      }),
    );
  } finally {
    await supabase.auth.signOut({ scope: "local" }).catch(() => {
      // Best-effort cleanup for this transient server-side auth client.
    });
  }
}
