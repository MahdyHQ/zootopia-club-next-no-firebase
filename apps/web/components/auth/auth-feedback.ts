import type { AppMessages } from "@/lib/messages";
import { withOperationalSupport } from "@/lib/operational-support";
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
  supportLabel?: string;
  supportNotes?: AuthSupportNote[];
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

type CapacitySnapshot = {
  activeNormalUsers: number;
  maxActiveNormalUsers: number;
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

function readCapacitySnapshot(error: unknown): CapacitySnapshot | null {
  if (
    typeof error !== "object"
    || !error
    || !("details" in error)
    || typeof error.details !== "object"
    || !error.details
    || !("capacity" in error.details)
    || typeof error.details.capacity !== "object"
    || !error.details.capacity
  ) {
    return null;
  }

  const capacity = error.details.capacity as {
    activeNormalUsers?: unknown;
    maxActiveNormalUsers?: unknown;
  };
  if (
    typeof capacity.activeNormalUsers !== "number"
    || !Number.isFinite(capacity.activeNormalUsers)
    || typeof capacity.maxActiveNormalUsers !== "number"
    || !Number.isFinite(capacity.maxActiveNormalUsers)
  ) {
    return null;
  }

  return {
    activeNormalUsers: Math.max(0, Math.trunc(capacity.activeNormalUsers)),
    maxActiveNormalUsers: Math.max(1, Math.trunc(capacity.maxActiveNormalUsers)),
  };
}

function interpolateCapacityTemplate(template: string, snapshot: CapacitySnapshot) {
  return template
    .replace("{active}", String(snapshot.activeNormalUsers))
    .replace("{limit}", String(snapshot.maxActiveNormalUsers));
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
      return withOperationalSupport(
        status(
          "danger",
          "config",
          messages.loginStatusServerTitle,
          messages.loginStatusServerBody,
          "assertive",
        ),
        messages,
      );
    case "AUTH_PROVIDER_MISCONFIGURED":
      return withOperationalSupport(
        status(
          "danger",
          "config",
          messages.loginStatusProviderMisconfiguredTitle,
          messages.loginStatusProviderMisconfiguredBody,
          "assertive",
        ),
        messages,
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
    case "AUTH_ACCOUNT_ALREADY_EXISTS":
      return status(
        "warning",
        "warning",
        messages.loginStatusAccountExistsTitle,
        messages.loginStatusAccountExistsBody,
      );
    case "AUTH_ACTIVE_USER_ADMISSION_UNAVAILABLE":
      return status(
        "warning",
        "warning",
        messages.loginStatusAdmissionUnavailableTitle,
        messages.loginStatusAdmissionUnavailableBody,
      );
    case "AUTH_RATE_LIMITED":
      return status(
        "warning",
        "warning",
        messages.loginStatusRetryLaterTitle,
        messages.loginStatusRetryLaterBody,
      );
    case "AUTH_ACCOUNT_SUSPENDED":
      return status(
        "danger",
        "permission",
        messages.loginStatusSuspendedTitle,
        messages.loginStatusSuspendedBody,
        "assertive",
      );
    case "AUTH_ACTIVE_USER_CAPACITY_FULL": {
      const snapshot = readCapacitySnapshot(error);
      return status(
        "warning",
        "warning",
        messages.loginStatusCapacityFullTitle,
        snapshot
          ? interpolateCapacityTemplate(messages.loginStatusCapacityFullBody, snapshot)
          : messages.loginStatusCapacityFullFallbackBody,
      );
    }
    case "AUTH_SESSION_CREATION_FAILED":
      return withOperationalSupport(
        status(
          "danger",
          "danger",
          messages.loginStatusBootstrapErrorTitle,
          messages.loginStatusBootstrapErrorBody,
          "assertive",
        ),
        messages,
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
      return withOperationalSupport(
        status(
          "danger",
          "danger",
          messages.loginStatusRepositoryTitle,
          messages.loginStatusRepositoryBody,
          "assertive",
        ),
        messages,
      );
    case "Configuration":
    case "CallbackRouteError":
      return withOperationalSupport(
        status(
          "danger",
          "config",
          messages.loginStatusRuntimeConfigTitle,
          messages.loginStatusRuntimeConfigBody,
          "assertive",
        ),
        messages,
      );
    case "SUPABASE_ADMIN_UNAVAILABLE":
    case "ADMIN_ALLOWLIST_UNCONFIGURED":
      return withOperationalSupport(
        status(
          "danger",
          "config",
          messages.loginStatusServerTitle,
          messages.loginStatusServerBody,
          "assertive",
        ),
        messages,
      );
    case "auth/app-not-authorized":
    case "auth/invalid-api-key":
    case "auth/invalid-app-credential":
    case "auth/unauthorized-domain":
      return withOperationalSupport(
        status(
          "danger",
          "config",
          messages.loginStatusConfigTitle,
          messages.loginStatusConfigBody,
          "assertive",
        ),
        messages,
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
      return withOperationalSupport(
        status(
          "danger",
          "danger",
          messages.loginStatusGenericErrorTitle,
          messages.loginStatusGenericErrorBody,
          "assertive",
        ),
        messages,
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
      return withOperationalSupport(
        status(
          "danger",
          "config",
          messages.adminLoginStatusServerTitle,
          messages.adminLoginStatusServerBody,
          "assertive",
        ),
        messages,
      );
    case "AUTH_PROVIDER_MISCONFIGURED":
      return withOperationalSupport(
        status(
          "danger",
          "config",
          messages.adminLoginStatusConfigTitle,
          messages.adminLoginStatusConfigBody,
          "assertive",
        ),
        messages,
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
      return withOperationalSupport(
        status(
          "danger",
          "danger",
          messages.adminLoginStatusBootstrapErrorTitle,
          messages.adminLoginStatusBootstrapErrorBody,
          "assertive",
        ),
        messages,
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
      return withOperationalSupport(
        status(
          "danger",
          "danger",
          messages.adminLoginStatusRepositoryTitle,
          messages.adminLoginStatusRepositoryBody,
          "assertive",
        ),
        messages,
      );
    case "Configuration":
    case "CallbackRouteError":
      return withOperationalSupport(
        status(
          "danger",
          "config",
          messages.adminLoginStatusRuntimeConfigTitle,
          messages.adminLoginStatusRuntimeConfigBody,
          "assertive",
        ),
        messages,
      );
    case "SUPABASE_ADMIN_UNAVAILABLE":
    case "ADMIN_ALLOWLIST_UNCONFIGURED":
    case "ADMIN_LOGIN_PASSWORD_UNCONFIGURED":
      return withOperationalSupport(
        status(
          "danger",
          "config",
          messages.adminLoginStatusServerTitle,
          messages.adminLoginStatusServerBody,
          "assertive",
        ),
        messages,
      );
    case "auth/app-not-authorized":
    case "auth/invalid-api-key":
    case "auth/invalid-app-credential":
    case "auth/unauthorized-domain":
      return withOperationalSupport(
        status(
          "danger",
          "config",
          messages.adminLoginStatusConfigTitle,
          messages.adminLoginStatusConfigBody,
          "assertive",
        ),
        messages,
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
    case "ADMIN_LOGIN_PASSWORD_REQUIRED":
      return status(
        "warning",
        "warning",
        messages.adminLoginStatusGateRequiredTitle,
        messages.adminLoginStatusGateRequiredBody,
      );
    case "ADMIN_LOGIN_PASSWORD_INVALID":
      return status(
        "danger",
        "permission",
        messages.adminLoginStatusGateInvalidTitle,
        messages.adminLoginStatusGateInvalidBody,
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
      return withOperationalSupport(
        status(
          "danger",
          "danger",
          messages.adminLoginStatusGenericErrorTitle,
          messages.adminLoginStatusGenericErrorBody,
          "assertive",
        ),
        messages,
      );
  }
}
