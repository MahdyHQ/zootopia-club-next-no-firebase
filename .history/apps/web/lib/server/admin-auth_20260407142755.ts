import "server-only";

import {
  DEFAULT_ALLOWLISTED_ADMIN_EMAILS,
  buildAdminUsernameLookup,
} from "@zootopia/shared-config";
import type { AdminIdentifierResolution } from "@zootopia/shared-types";
import type { Auth, DecodedIdToken } from "firebase-admin/auth";

function normalizeIdentifier(value: string) {
  return value.trim().toLowerCase();
}

export function getAllowlistedAdminEmails() {
  const configured = process.env.ZOOTOPIA_ADMIN_EMAILS?.split(",")
    .map((value) => normalizeIdentifier(value))
    .filter(Boolean);

  return configured && configured.length > 0
    ? [...new Set(configured)]
    : [...DEFAULT_ALLOWLISTED_ADMIN_EMAILS];
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
  return isAllowlistedAdminEmail(input.email) && input.admin === true;
}

export function resolveAdminIdentifier(
  identifier: string,
):
  | { ok: true; value: AdminIdentifierResolution }
  | { ok: false; code: string; message: string; status: number } {
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

export function getDecodedSignInProvider(decodedToken: Pick<DecodedIdToken, "firebase">) {
  const firebaseClaims = decodedToken.firebase as
    | { sign_in_provider?: unknown }
    | undefined;

  return typeof firebaseClaims?.sign_in_provider === "string"
    ? firebaseClaims.sign_in_provider
    : null;
}

export function hasRecentSignIn(decodedToken: Pick<DecodedIdToken, "auth_time">) {
  const authTimeMs =
    typeof decodedToken.auth_time === "number" ? decodedToken.auth_time * 1000 : 0;

  return authTimeMs > 0 && Date.now() - authTimeMs <= 5 * 60 * 1000;
}

export async function verifyAdminClaimActivation(
  auth: Auth,
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
      "This allowlisted account does not yet have the required `admin: true` Firebase custom claim. Have the owner run `npm run firebase:admin:set-claims` after the account exists in Firebase Auth, then sign out and sign back in through /admin/login.",
    status: 403,
  };
}
