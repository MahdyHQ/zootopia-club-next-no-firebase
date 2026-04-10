import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import {
  buildAdminUsernameLookup,
} from "@zootopia/shared-config";
import type { AdminIdentifierResolution } from "@zootopia/shared-types";
import type { DecodedAuthToken } from "@/lib/server/auth-types";

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

function readConfiguredAdminLoginPasswordFromEnv() {
  return (process.env.ZOOTOPIA_ADMIN_LOGIN_PASSWORD ?? "").trim();
}

export function hasConfiguredAdminLoginPasswordGate() {
  return readConfiguredAdminLoginPasswordFromEnv().length > 0;
}

function hashAdminLoginPasswordGateValue(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

export function verifyAdminLoginPasswordGate(inputPassword: string | null | undefined):
  | { ok: true }
  | { ok: false; code: string; message: string; status: number } {
  const configuredPassword = readConfiguredAdminLoginPasswordFromEnv();
  if (!configuredPassword) {
    return {
      ok: false,
      code: "ADMIN_LOGIN_PASSWORD_UNCONFIGURED",
      message:
        "Admin access is temporarily unavailable because the runtime admin password gate is not configured.",
      status: 503,
    };
  }

  const providedPassword = String(inputPassword ?? "").trim();
  if (!providedPassword) {
    return {
      ok: false,
      code: "ADMIN_LOGIN_PASSWORD_REQUIRED",
      message: "Enter the environment admin access password to continue.",
      status: 400,
    };
  }

  /* Keep this gate constant-time by comparing fixed-size hashes instead of
     branching on raw string length/content. This avoids turning the additional
     admin password factor into an accidental timing side-channel. */
  const configuredHash = hashAdminLoginPasswordGateValue(configuredPassword);
  const providedHash = hashAdminLoginPasswordGateValue(providedPassword);
  if (!timingSafeEqual(configuredHash, providedHash)) {
    return {
      ok: false,
      code: "ADMIN_LOGIN_PASSWORD_INVALID",
      message: "The environment admin access password is invalid.",
      status: 403,
    };
  }

  return { ok: true };
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
  if (!hasConfiguredAdminAllowlist()) {
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
    return {
      ok: false,
      code: "IDENTIFIER_REQUIRED",
      message: "Enter your allowlisted admin email or approved username.",
      status: 400,
    };
  }

  if (normalized.includes("@")) {
    if (!isAllowlistedAdminEmail(normalized)) {
      return {
        ok: false,
        code: "ADMIN_ACCOUNT_UNAUTHORIZED",
        message: "This account is not authorized for admin access.",
        status: 403,
      };
    }

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
    return {
      ok: false,
      code: "ADMIN_USERNAME_NOT_FOUND",
      message: "This account is not authorized for admin access.",
      status: 403,
    };
  }

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
  },
): Promise<
  | { ok: true }
  | { ok: false; code: string; message: string; status: number }
> {
  if (
    hasAdminAccessFromClaims({
      email: input.email,
      admin: input.admin,
    })
  ) {
    return { ok: true };
  }

  const userRecord = await auth.getUser(input.uid);
  if (
    hasAdminAccessFromClaims({
      email: userRecord.email ?? input.email,
      admin: userRecord.customClaims?.admin,
    })
  ) {
    return {
      ok: false,
      code: "ADMIN_TOKEN_REFRESH_REQUIRED",
      message:
        "The `admin: true` claim is already assigned on this account, but this sign-in token has not refreshed yet. Sign out, wait a few seconds, and sign back in through /admin/login so a fresh token can pick up the claim.",
      status: 403,
    };
  }

  return {
    ok: false,
    code: "ADMIN_CLAIM_REQUIRED",
    message:
      "This allowlisted account does not yet have the required `admin: true` app metadata claim. Ask the owner to assign that claim in Supabase Auth, then sign out and sign back in through /admin/login.",
    status: 403,
  };
}
