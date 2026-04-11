import "server-only";

import {
  buildAdminUsernameLookup,
} from "@zootopia/shared-config";
import type { AdminIdentifierResolution } from "@zootopia/shared-types";
import type { DecodedAuthToken } from "@/lib/server/auth-types";
import {
  AUTH_STAGE_ADMIN_ALLOWLIST,
  AUTH_STAGE_ADMIN_CLAIM,
  createAuthTraceContext,
  logAuthStageFailure,
  logAuthStageStart,
  logAuthStageSuccess,
  type AuthTraceContext,
} from "@/lib/server/auth-tracing";

function normalizeIdentifier(value: string) {
  return value.trim().toLowerCase();
}

function readConfiguredAdminEmailsFromEnv() {
  return (process.env.ZOOTOPIA_ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => normalizeIdentifier(value))
    .filter(Boolean);
}

export function getAllowlistedAdminEmails() {
  // Runtime auth policy is env-driven. Missing/blank config must fail closed.
  return [...new Set(readConfiguredAdminEmailsFromEnv())];
}

export function hasConfiguredAdminAllowlist() {
  return getAllowlistedAdminEmails().length > 0;
}

function getAdminEmailSet() {
  return new Set(getAllowlistedAdminEmails());
}

function getAdminUsernameLookup() {
  return buildAdminUsernameLookup(getAllowlistedAdminEmails());
}

export function isAllowlistedAdminEmail(email: string | null | undefined) {
  if (!email) {
    return false;
  }

  return getAdminEmailSet().has(normalizeIdentifier(email));
}

export function hasAdminAccessFromClaims(input: {
  email: string | null | undefined;
  admin: unknown;
}) {
  if (!isAllowlistedAdminEmail(input.email)) {
    return false;
  }

  // Supabase bootstrap keeps allowlisted admins enabled by default unless an explicit
  // `admin: false` claim is persisted for that account.
  return input.admin !== false;
}

export function resolveAdminIdentifier(
  identifier: string,
):
  | { ok: true; value: AdminIdentifierResolution }
  | { ok: false; code: string; message: string; status: number } {
  const traceContext = createAuthTraceContext({
    flow: "admin",
    provider: "admin-auth",
  });
  logAuthStageStart(traceContext, AUTH_STAGE_ADMIN_ALLOWLIST, {
    source: "resolveAdminIdentifier",
  });

  if (!hasConfiguredAdminAllowlist()) {
    logAuthStageFailure(
      traceContext,
      AUTH_STAGE_ADMIN_ALLOWLIST,
      new Error("ADMIN_ALLOWLIST_UNCONFIGURED"),
    );
    return {
      ok: false,
      code: "ADMIN_ALLOWLIST_UNCONFIGURED",
      message:
        "Admin access is temporarily unavailable because the allowlist is not configured.",
      status: 503,
    };
  }

  const normalized = normalizeIdentifier(identifier);

  if (!normalized) {
    logAuthStageFailure(
      traceContext,
      AUTH_STAGE_ADMIN_ALLOWLIST,
      new Error("IDENTIFIER_REQUIRED"),
    );
    return {
      ok: false,
      code: "IDENTIFIER_REQUIRED",
      message: "Enter your allowlisted admin email or approved username.",
      status: 400,
    };
  }

  if (normalized.includes("@")) {
    if (!isAllowlistedAdminEmail(normalized)) {
      logAuthStageFailure(
        traceContext,
        AUTH_STAGE_ADMIN_ALLOWLIST,
        new Error("ADMIN_ACCOUNT_UNAUTHORIZED"),
      );
      return {
        ok: false,
        code: "ADMIN_ACCOUNT_UNAUTHORIZED",
        message: "This account is not authorized for admin access.",
        status: 403,
      };
    }

    logAuthStageSuccess(traceContext, AUTH_STAGE_ADMIN_ALLOWLIST, {
      identifierType: "email",
      resolutionSource: "allowlisted_email",
    });

    return {
      ok: true,
      value: {
        email: normalized,
        identifierType: "email",
        resolutionSource: "allowlisted_email",
      },
    };
  }

  const mappedEmail = getAdminUsernameLookup()[normalized];

  /* Keep unknown usernames on the same authorization failure surface as non-allowlisted
     identifiers so the resolver does not leak a stronger account-existence signal. */
  if (!mappedEmail) {
    logAuthStageFailure(
      traceContext,
      AUTH_STAGE_ADMIN_ALLOWLIST,
      new Error("ADMIN_USERNAME_NOT_FOUND"),
    );
    return {
      ok: false,
      code: "ADMIN_USERNAME_NOT_FOUND",
      message: "This account is not authorized for admin access.",
      status: 403,
    };
  }

  logAuthStageSuccess(traceContext, AUTH_STAGE_ADMIN_ALLOWLIST, {
    identifierType: "username",
    resolutionSource: "username_alias",
  });

  return {
    ok: true,
    value: {
      email: mappedEmail,
      identifierType: "username",
      resolutionSource: "username_alias",
    },
  };
}

function normalizeSupabaseProviderForAuthChecks(provider: string) {
  if (provider === "email") {
    return "password";
  }

  if (provider === "google") {
    return "google.com";
  }

  if (provider === "github") {
    return "github.com";
  }

  if (provider === "apple") {
    return "apple.com";
  }

  return provider;
}

export function getDecodedSignInProvider(
  decodedToken: Pick<DecodedAuthToken, "app_metadata" | "firebase">,
) {
  const metadataProvider = decodedToken.app_metadata?.provider;
  if (typeof metadataProvider === "string" && metadataProvider.trim().length > 0) {
    return normalizeSupabaseProviderForAuthChecks(metadataProvider.trim());
  }

  const legacyProviderClaims = decodedToken.firebase as
    | { sign_in_provider?: unknown }
    | undefined;

  return typeof legacyProviderClaims?.sign_in_provider === "string"
    ? legacyProviderClaims.sign_in_provider
    : null;
}

export function hasRecentSignIn(decodedToken: Pick<DecodedAuthToken, "auth_time">) {
  const tokenRecord = decodedToken as Record<string, unknown>;
  const authTimeSeconds =
    typeof decodedToken.auth_time === "number"
      ? decodedToken.auth_time
      : typeof tokenRecord.iat === "number"
        ? tokenRecord.iat
        : 0;
  const authTimeMs = authTimeSeconds > 0 ? authTimeSeconds * 1000 : 0;

  return authTimeMs > 0 && Date.now() - authTimeMs <= 5 * 60 * 1000;
}

export async function verifyAdminClaimActivation(
  auth: {
    getUser: (uid: string) => Promise<{
      email?: string | null;
      customClaims?: Record<string, unknown> | null;
    }>;
  },
  input: {
    uid: string;
    email: string | null | undefined;
    admin: unknown;
    traceContext?: AuthTraceContext;
  },
): Promise<
  | { ok: true }
  | { ok: false; code: string; message: string; status: number }
> {
  const traceContext = input.traceContext ?? createAuthTraceContext({
    flow: "admin",
    provider: "admin-auth",
    uid: input.uid,
    email: input.email ?? null,
  });
  logAuthStageStart(traceContext, AUTH_STAGE_ADMIN_CLAIM);

  /* Admin identity remains server-authoritative by allowlist.
     Claims are optional at this stage: allow claims can continue to permit access, while
     an explicit `admin: false` deny claim blocks access for an allowlisted account. */
  if (
    hasAdminAccessFromClaims({
      email: input.email,
      admin: input.admin,
    })
  ) {
    logAuthStageSuccess(traceContext, AUTH_STAGE_ADMIN_CLAIM, {
      claimSource: "token",
      result: "allow",
    });
    return { ok: true };
  }

  let userRecord: {
    email?: string | null;
    customClaims?: Record<string, unknown> | null;
  };
  try {
    userRecord = await auth.getUser(input.uid);
  } catch (error) {
    logAuthStageFailure(traceContext, AUTH_STAGE_ADMIN_CLAIM, error, {
      claimSource: "auth-user-record",
    });
    throw error;
  }

  if (
    hasAdminAccessFromClaims({
      email: userRecord.email ?? input.email,
      admin: userRecord.customClaims?.admin,
    })
  ) {
    logAuthStageSuccess(traceContext, AUTH_STAGE_ADMIN_CLAIM, {
      claimSource: "auth-user-record",
      result: "allow",
    });
    return { ok: true };
  }

  logAuthStageFailure(
    traceContext,
    AUTH_STAGE_ADMIN_CLAIM,
    new Error("ADMIN_CLAIM_DENIED"),
    {
      claimSource: "auth-user-record",
      result: "deny",
    },
  );

  return {
    ok: false,
    code: "ADMIN_CLAIM_DENIED",
    message:
      "This allowlisted account is explicitly denied by admin claim policy (`admin: false`).",
    status: 403,
  };
}
