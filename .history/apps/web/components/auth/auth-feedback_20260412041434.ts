import type { AppMessages } from "@/lib/messages";
import {
  normalizeAuthFailure,
  type AuthFailureCode,
} from "@/lib/auth-failure";

export type AuthStatusTone = "neutral" | "info" | "success" | "warning" | "danger";
export type AuthStatusIcon =
  | "info"
  | "working"
  | "success"
  | "warning"
  | "danger"
  | "permission"
  | "config";

export type AuthStatusDescriptor = {
  tone: AuthStatusTone;
  icon: AuthStatusIcon;
  title: string;
  body?: string;
  live?: "polite" | "assertive" | "off";
};

export type AuthSupportNote = {
  text: string;
  tone?: "default" | "danger";
};

export type AuthFlowError = {
  code: string;
  message?: string;
  details?: Record<string, unknown>;
};

const POPUP_POLICY_CLOSE_FALLBACK_WINDOW_MS = 1500;

function status(
  tone: AuthStatusTone,
  icon: AuthStatusIcon,
  title: string,
  body?: string,
  live?: "polite" | "assertive" | "off",
): AuthStatusDescriptor {
  return {
    tone,
    icon,
    title,
    body,
    live,
  };
}

export function createAuthFlowError(code: string, message?: string): AuthFlowError {
  return {
    code,
    message,
  };
}

export function createAuthFlowErrorWithDetails(
  code: string,
  message?: string,
  details?: Record<string, unknown>,
): AuthFlowError {
  return {
    code,
    message,
    details,
  };
}

export function getAuthFlowErrorCode(error: unknown) {
  if (typeof error === "object" && error && "code" in error && typeof error.code === "string") {
    return error.code;
  }

  return null;
}

/* Popup-first must remain the default auth entry path.
   This helper intentionally limits redirect fallback to popup failure modes that browsers
   commonly trigger (blocked popup, unsupported popup, or immediate policy-driven close).
   Future agents should avoid widening this list to generic auth failures that redirect cannot fix. */
export function shouldFallbackToRedirectFromPopupError(
  error: unknown,
  popupOpenedAtMs: number,
) {
  const code = getAuthFlowErrorCode(error);

  if (
    code === "auth/popup-blocked" ||
    code === "auth/operation-not-supported-in-this-environment"
  ) {
    return true;
  }

  if (code === "auth/popup-closed-by-user") {
    return Date.now() - popupOpenedAtMs <= POPUP_POLICY_CLOSE_FALLBACK_WINDOW_MS;
  }

  return false;
}

export function mapRegularLoginError(
  error: unknown,
  messages: AppMessages,
): AuthStatusDescriptor {
  const normalized = normalizeAuthFailure({
    error,
    flow: "user",
    stage: "AUTH_STAGE_E_SESSION_HYDRATION",
    sessionCreationAttempted: true,
  });

  const rawCode = getAuthFlowErrorCode(error);

  switch (normalized.normalizedCode as AuthFailureCode) {
    case "AUTH_NETWORK_FAILURE":
      return status(
        "danger",
        "danger",
        messages.loginStatusNetworkTitle,
        messages.loginStatusNetworkBody,
        "assertive",
      );
    case "AUTH_ENV_MISCONFIGURED":
      return status(
        "danger",
        "config",
        messages.loginStatusServerTitle,
        messages.loginStatusServerBody,
        "assertive",
      );
    case "AUTH_PROVIDER_MISCONFIGURED":
      return status(
        "danger",
        "config",
        messages.loginStatusProviderMisconfiguredTitle,
        messages.loginStatusProviderMisconfiguredBody,
        "assertive",
      );
    case "AUTH_INVALID_CREDENTIALS":
      return status(
        "danger",
        "danger",
        messages.loginStatusInvalidCredentialsTitle,
        messages.loginStatusInvalidCredentialsBody,
        "assertive",
      );
    case "AUTH_EMAIL_NOT_CONFIRMED":
      return status(
        "warning",
        "warning",
        messages.loginStatusEmailNotConfirmedTitle,
        messages.loginStatusEmailNotConfirmedBody,
      );
    case "AUTH_RATE_LIMITED":
      return status(
        "warning",
        "warning",
        messages.adminLoginStatusRetryLaterTitle,
        messages.adminLoginStatusRetryLaterBody,
      );
    case "AUTH_ACCOUNT_SUSPENDED":
      return status(
        "danger",
        "permission",
        messages.loginStatusSuspendedTitle,
        messages.loginStatusSuspendedBody,
        "assertive",
      );
    case "AUTH_SESSION_CREATION_FAILED":
      return status(
        "danger",
        "danger",
        messages.loginStatusBootstrapErrorTitle,
        messages.loginStatusBootstrapErrorBody,
        "assertive",
      );
    case "AUTH_SESSION_REFRESH_REQUIRED":
      return status(
        "warning",
        "warning",
        messages.loginStatusRefreshTitle,
        messages.loginStatusRefreshBody,
      );
    case "AUTH_ACCESS_DENIED":
      if (rawCode === "ADMIN_LOGIN_REQUIRED") {
        return status(
          "danger",
          "permission",
          messages.loginStatusAdminRequiredTitle,
          messages.loginStatusAdminRequiredBody,
          "assertive",
        );
      }

      return status(
        "danger",
        "permission",
        messages.loginStatusGoogleRequiredTitle,
        messages.loginStatusGoogleRequiredBody,
        "assertive",
      );
    default:
      break;
  }

  switch (rawCode) {
    case "DB_REPOSITORY_UNAVAILABLE":
      return status(
        "danger",
        "danger",
        messages.loginStatusRepositoryTitle,
        messages.loginStatusRepositoryBody,
        "assertive",
      );
    case "Configuration":
    case "CallbackRouteError":
      return status(
        "danger",
        "config",
        messages.loginStatusRuntimeConfigTitle,
        messages.loginStatusRuntimeConfigBody,
        "assertive",
      );
    case "SUPABASE_ADMIN_UNAVAILABLE":
    case "ADMIN_ALLOWLIST_UNCONFIGURED":
      return status(
        "danger",
        "config",
        messages.loginStatusServerTitle,
        messages.loginStatusServerBody,
        "assertive",
      );
    case "auth/app-not-authorized":
    case "auth/invalid-api-key":
    case "auth/invalid-app-credential":
    case "auth/unauthorized-domain":
      return status(
        "danger",
        "config",
        messages.loginStatusConfigTitle,
        messages.loginStatusConfigBody,
        "assertive",
      );
    case "auth/popup-closed-by-user":
      return status(
        "warning",
        "warning",
        messages.loginStatusPopupClosedTitle,
        messages.loginStatusPopupClosedBody,
      );
    case "auth/cancelled-popup-request":
      return status(
        "warning",
        "warning",
        messages.loginStatusPopupCancelledTitle,
        messages.loginStatusPopupCancelledBody,
      );
    case "auth/popup-blocked":
    case "auth/operation-not-supported-in-this-environment":
      return status(
        "warning",
        "warning",
        messages.loginStatusRedirectingTitle,
        messages.loginStatusRedirectingBody,
      );
    case "RECENT_SIGN_IN_REQUIRED":
    case "ID_TOKEN_INVALID":
    case "ID_TOKEN_REVOKED":
    case "SESSION_NOT_ESTABLISHED":
    case "REDIRECT_RESULT_MISSING":
      return status(
        "warning",
        "warning",
        messages.loginStatusRefreshTitle,
        messages.loginStatusRefreshBody,
      );
    case "ADMIN_LOGIN_REQUIRED":
      return status(
        "danger",
        "permission",
        messages.loginStatusAdminRequiredTitle,
        messages.loginStatusAdminRequiredBody,
        "assertive",
      );
    case "GOOGLE_SIGN_IN_REQUIRED":
    case "EMAIL_PASSWORD_REQUIRED":
      return status(
        "danger",
        "permission",
        messages.loginStatusGoogleRequiredTitle,
        messages.loginStatusGoogleRequiredBody,
        "assertive",
      );
    default:
      return status(
        "danger",
        "danger",
        messages.loginStatusGenericErrorTitle,
        messages.loginStatusGenericErrorBody,
        "assertive",
      );
  }
}

export function mapAdminLoginError(
  error: unknown,
  messages: AppMessages,
): AuthStatusDescriptor {
  const normalized = normalizeAuthFailure({
    error,
    flow: "admin",
    stage: "AUTH_STAGE_E_SESSION_HYDRATION",
    sessionCreationAttempted: true,
  });

  const rawCode = getAuthFlowErrorCode(error);

  switch (normalized.normalizedCode as AuthFailureCode) {
    case "AUTH_NETWORK_FAILURE":
      return status(
        "danger",
        "danger",
        messages.adminLoginStatusNetworkTitle,
        messages.adminLoginStatusNetworkBody,
        "assertive",
      );
    case "AUTH_ENV_MISCONFIGURED":
      return status(
        "danger",
        "config",
        messages.adminLoginStatusServerTitle,
        messages.adminLoginStatusServerBody,
        "assertive",
      );
    case "AUTH_PROVIDER_MISCONFIGURED":
      return status(
        "danger",
        "config",
        messages.adminLoginStatusConfigTitle,
        messages.adminLoginStatusConfigBody,
        "assertive",
      );
    case "AUTH_INVALID_CREDENTIALS":
      return status(
        "danger",
        "danger",
        messages.adminLoginStatusInvalidCredentialsTitle,
        messages.adminLoginStatusInvalidCredentialsBody,
        "assertive",
      );
    case "AUTH_EMAIL_NOT_CONFIRMED":
      return status(
        "warning",
        "warning",
        messages.adminLoginStatusEmailNotConfirmedTitle,
        messages.adminLoginStatusEmailNotConfirmedBody,
      );
    case "AUTH_RATE_LIMITED":
      return status(
        "warning",
        "warning",
        messages.adminLoginStatusRetryLaterTitle,
        messages.adminLoginStatusRetryLaterBody,
      );
    case "AUTH_ACCOUNT_SUSPENDED":
      return status(
        "danger",
        "permission",
        messages.adminLoginStatusSuspendedTitle,
        messages.adminLoginStatusSuspendedBody,
        "assertive",
      );
    case "AUTH_SESSION_CREATION_FAILED":
      return status(
        "danger",
        "danger",
        messages.adminLoginStatusBootstrapErrorTitle,
        messages.adminLoginStatusBootstrapErrorBody,
        "assertive",
      );
    case "AUTH_SESSION_REFRESH_REQUIRED":
      return status(
        "warning",
        "warning",
        messages.adminLoginStatusRecentSigninTitle,
        messages.adminLoginStatusRecentSigninBody,
      );
    default:
      break;
  }

  switch (rawCode) {
    case "DB_REPOSITORY_UNAVAILABLE":
      return status(
        "danger",
        "danger",
        messages.adminLoginStatusRepositoryTitle,
        messages.adminLoginStatusRepositoryBody,
        "assertive",
      );
    case "Configuration":
    case "CallbackRouteError":
      return status(
        "danger",
        "config",
        messages.adminLoginStatusRuntimeConfigTitle,
        messages.adminLoginStatusRuntimeConfigBody,
        "assertive",
      );
    case "SUPABASE_ADMIN_UNAVAILABLE":
    case "ADMIN_ALLOWLIST_UNCONFIGURED":
      return status(
        "danger",
        "config",
        messages.adminLoginStatusServerTitle,
        messages.adminLoginStatusServerBody,
        "assertive",
      );
    case "auth/app-not-authorized":
    case "auth/invalid-api-key":
    case "auth/invalid-app-credential":
    case "auth/unauthorized-domain":
      return status(
        "danger",
        "config",
        messages.adminLoginStatusConfigTitle,
        messages.adminLoginStatusConfigBody,
        "assertive",
      );
    case "IDENTIFIER_REQUIRED":
      return status(
        "warning",
        "warning",
        messages.adminLoginStatusIdentifierRequiredTitle,
        messages.adminLoginStatusIdentifierRequiredBody,
      );
    case "ADMIN_USERNAME_NOT_FOUND":
      return status(
        "warning",
        "warning",
        messages.adminLoginStatusIdentifierNotFoundTitle,
        messages.adminLoginStatusIdentifierNotFoundBody,
      );
    case "ADMIN_ACCOUNT_UNAUTHORIZED":
      return status(
        "danger",
        "permission",
        messages.adminLoginStatusUnauthorizedTitle,
        messages.adminLoginStatusUnauthorizedBody,
        "assertive",
      );
    case "ADMIN_CLAIM_REQUIRED":
    case "ADMIN_CLAIM_DENIED":
      return status(
        "danger",
        "permission",
        messages.adminLoginStatusClaimRequiredTitle,
        messages.adminLoginStatusClaimRequiredBody,
        "assertive",
      );
    case "ADMIN_TOKEN_REFRESH_REQUIRED":
      return status(
        "warning",
        "warning",
        messages.adminLoginStatusClaimRefreshTitle,
        messages.adminLoginStatusClaimRefreshBody,
      );
    case "EMAIL_PASSWORD_REQUIRED":
      return status(
        "danger",
        "permission",
        messages.adminLoginStatusPasswordRequiredTitle,
        messages.adminLoginStatusPasswordRequiredBody,
        "assertive",
      );
    default:
      return status(
        "danger",
        "danger",
        messages.adminLoginStatusGenericErrorTitle,
        messages.adminLoginStatusGenericErrorBody,
        "assertive",
      );
  }
}
