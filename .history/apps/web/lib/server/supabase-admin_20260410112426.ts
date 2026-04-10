import "server-only";

import { createClient, type User, type SupabaseClient } from "@supabase/supabase-js";

import type { AuthUserInfo, AuthUserRecord, DecodedAuthToken } from "@/lib/server/auth-types";
import {
  getSupabaseUrl,
  hasSupabasePublicRuntime,
} from "@/lib/supabase/public-config";

let cachedSupabaseAdminClient: SupabaseClient | null = null;

function readEnv(value: string | undefined) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getSupabaseServiceRoleKey() {
  return readEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function hasSupabaseAdminRuntime() {
  return Boolean(hasSupabasePublicRuntime() && getSupabaseServiceRoleKey());
}

export function getSupabaseAdminClient() {
  if (cachedSupabaseAdminClient) {
    return cachedSupabaseAdminClient;
  }

  const supabaseUrl = getSupabaseUrl();
  const serviceRoleKey = getSupabaseServiceRoleKey();

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_ADMIN_RUNTIME_MISSING");
  }

  cachedSupabaseAdminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return cachedSupabaseAdminClient;
}

function decodeJwtPayload(token: string) {
  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }

  const payloadPart = parts[1];
  if (!payloadPart) {
    return null;
  }

  try {
    const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const json = Buffer.from(padded, "base64").toString("utf8");
    const parsed = JSON.parse(json) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function readProviderFromTokenPayload(payload: Record<string, unknown>) {
  const payloadAppMetadata =
    payload.app_metadata && typeof payload.app_metadata === "object"
      ? (payload.app_metadata as Record<string, unknown>)
      : null;

  const metadataProvider =
    typeof payloadAppMetadata?.provider === "string"
      ? payloadAppMetadata.provider
      : null;
  if (metadataProvider) {
    return metadataProvider;
  }

  const amr = Array.isArray(payload.amr) ? payload.amr : [];
  for (const entry of amr) {
    if (typeof entry === "object" && entry !== null) {
      const method =
        "method" in entry && typeof (entry as { method?: unknown }).method === "string"
          ? ((entry as { method?: string }).method ?? "")
          : "";

      if (method === "password") {
        // Supabase AMR method "password" maps to the email/password provider shape.
        return "email";
      }
    }

    if (typeof entry === "string" && entry === "password") {
      return "email";
    }
  }

  return null;
}

function readSupabaseProvider(user: User) {
  const appMetadata =
    user.app_metadata && typeof user.app_metadata === "object"
      ? (user.app_metadata as Record<string, unknown>)
      : null;

  const directProvider =
    typeof appMetadata?.provider === "string" ? appMetadata.provider : null;

  if (directProvider) {
    return directProvider;
  }

  if (Array.isArray(user.identities)) {
    const firstProvider = user.identities.find(
      (identity: { provider?: unknown } | null) =>
        typeof identity?.provider === "string",
    )?.provider;
    if (firstProvider) {
      return firstProvider;
    }
  }

  return null;
}

function mapProviderToFirebaseProvider(provider: string | null) {
  if (!provider) {
    return null;
  }

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

function toLooseUserRecord(user: User) {
  return user as unknown as Record<string, unknown>;
}

function isSupabaseUserBanned(user: User) {
  const bannedUntil = toLooseUserRecord(user).banned_until;
  if (typeof bannedUntil !== "string" || !bannedUntil) {
    return false;
  }

  const bannedUntilMs = Date.parse(bannedUntil);
  return Number.isFinite(bannedUntilMs) && bannedUntilMs > Date.now();
}

function normalizeSupabaseTimestamp(value: unknown) {
  if (typeof value !== "string" || !value) {
    return undefined;
  }

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return new Date(parsed).toISOString();
}

function mapSupabaseUserToAuthRecord(user: User): AuthUserRecord {
  const userRecord = toLooseUserRecord(user);
  const provider = mapProviderToFirebaseProvider(readSupabaseProvider(user));
  const providerData: AuthUserInfo[] = provider
    ? [
        {
          providerId: provider,
          uid: user.id,
          displayName:
            typeof user.user_metadata?.display_name === "string"
              ? user.user_metadata.display_name
              : typeof user.user_metadata?.name === "string"
                ? user.user_metadata.name
                : null,
          email: user.email ?? null,
          photoURL:
            typeof user.user_metadata?.avatar_url === "string"
              ? user.user_metadata.avatar_url
              : typeof user.user_metadata?.picture === "string"
                ? user.user_metadata.picture
                : null,
          phoneNumber: null,
        },
      ]
    : [];

  const createdAt = normalizeSupabaseTimestamp(userRecord.created_at);
  const lastSignInAt = normalizeSupabaseTimestamp(
    userRecord.last_sign_in_at,
  );
  const updatedAt = normalizeSupabaseTimestamp(userRecord.updated_at);

  return {
    uid: user.id,
    email: user.email ?? undefined,
    emailVerified: Boolean(userRecord.email_confirmed_at),
    displayName:
      typeof user.user_metadata?.display_name === "string"
        ? user.user_metadata.display_name
        : typeof user.user_metadata?.name === "string"
          ? user.user_metadata.name
          : null,
    photoURL:
      typeof user.user_metadata?.avatar_url === "string"
        ? user.user_metadata.avatar_url
        : typeof user.user_metadata?.picture === "string"
          ? user.user_metadata.picture
          : null,
    phoneNumber:
      typeof user.phone === "string" && user.phone.trim().length > 0
        ? user.phone
        : undefined,
    disabled: isSupabaseUserBanned(user),
    customClaims:
      user.app_metadata && typeof user.app_metadata === "object"
        ? (user.app_metadata as Record<string, unknown>)
        : undefined,
    metadata: {
      creationTime: createdAt,
      lastSignInTime: lastSignInAt,
      lastRefreshTime: updatedAt ?? lastSignInAt ?? createdAt,
      toJSON() {
        return {
          creationTime: createdAt,
          lastSignInTime: lastSignInAt,
          lastRefreshTime: updatedAt ?? lastSignInAt ?? createdAt,
        };
      },
    },
    providerData,
    toJSON() {
      return {
        uid: user.id,
        email: user.email ?? null,
      };
    },
  } as AuthUserRecord;
}

function buildSupabaseDecodedToken(input: {
  token: string;
  user: User;
}) {
  const payload = decodeJwtPayload(input.token) ?? {};
  /* Provider is resolved from the current JWT payload first so admin password-only
     checks reflect this sign-in token, not only account-level identity metadata. */
  const provider = mapProviderToFirebaseProvider(
    readProviderFromTokenPayload(payload) || readSupabaseProvider(input.user),
  );
  const appMetadata =
    input.user.app_metadata && typeof input.user.app_metadata === "object"
      ? (input.user.app_metadata as Record<string, unknown>)
      : null;

  const adminClaim =
    appMetadata?.admin === true ||
    appMetadata?.role === "admin" ||
    (payload.admin === true || payload.role === "admin");

  const decodedToken = {
    ...payload,
    uid: input.user.id,
    email: input.user.email ?? undefined,
    name:
      typeof input.user.user_metadata?.name === "string"
        ? input.user.user_metadata.name
        : typeof input.user.user_metadata?.display_name === "string"
          ? input.user.user_metadata.display_name
          : undefined,
    picture:
      typeof input.user.user_metadata?.picture === "string"
        ? input.user.user_metadata.picture
        : typeof input.user.user_metadata?.avatar_url === "string"
          ? input.user.user_metadata.avatar_url
          : undefined,
    admin: adminClaim,
    role: adminClaim ? "admin" : "user",
    auth_time:
      typeof payload.auth_time === "number"
        ? payload.auth_time
        : typeof payload.iat === "number"
          ? payload.iat
          : undefined,
    firebase: {
      sign_in_provider: provider,
    },
  };

  return decodedToken as DecodedAuthToken;
}

export async function verifySupabaseAccessToken(token: string) {
  const trimmedToken = String(token || "").trim();
  if (!trimmedToken || !hasSupabaseAdminRuntime()) {
    return null;
  }

  try {
    const { data, error } = await getSupabaseAdminClient().auth.getUser(trimmedToken);

    if (error || !data.user) {
      return null;
    }

    return buildSupabaseDecodedToken({
      token: trimmedToken,
      user: data.user,
    });
  } catch {
    return null;
  }
}

export async function listSupabaseAuthUsers(input: {
  maxResults: number;
  pageToken?: string;
}) {
  if (!hasSupabaseAdminRuntime()) {
    return {
      users: [] as AuthUserRecord[],
      pageToken: undefined,
    };
  }

  const maxResults = Math.max(1, Math.min(1000, Math.trunc(input.maxResults || 1000)));
  const currentPage = Math.max(1, Number.parseInt(String(input.pageToken || "1"), 10) || 1);

  const { data, error } = await getSupabaseAdminClient().auth.admin.listUsers({
    page: currentPage,
    perPage: maxResults,
  });

  if (error) {
    throw Object.assign(new Error(error.message), {
      code: "auth/internal-error",
    });
  }

  const users = (data.users ?? []).map((user: User) => mapSupabaseUserToAuthRecord(user));
  const nextPageToken = users.length === maxResults ? String(currentPage + 1) : undefined;

  return {
    users,
    pageToken: nextPageToken,
  };
}

export async function getSupabaseAuthUser(uid: string) {
  if (!hasSupabaseAdminRuntime()) {
    return null;
  }

  const { data, error } = await getSupabaseAdminClient().auth.admin.getUserById(uid);
  if (error || !data.user) {
    return null;
  }

  return mapSupabaseUserToAuthRecord(data.user);
}

export async function setSupabaseUserClaims(
  uid: string,
  claims: Record<string, unknown>,
) {
  if (!hasSupabaseAdminRuntime()) {
    return;
  }

  const adminClient = getSupabaseAdminClient();
  const currentUser = await adminClient.auth.admin.getUserById(uid);
  if (currentUser.error || !currentUser.data.user) {
    throw Object.assign(new Error("User not found"), {
      code: "auth/user-not-found",
    });
  }

  const existingAppMetadata =
    currentUser.data.user.app_metadata &&
    typeof currentUser.data.user.app_metadata === "object"
      ? (currentUser.data.user.app_metadata as Record<string, unknown>)
      : {};

  const { error } = await adminClient.auth.admin.updateUserById(uid, {
    app_metadata: {
      ...existingAppMetadata,
      ...claims,
    },
  });

  if (error) {
    throw Object.assign(new Error(error.message), {
      code: "auth/internal-error",
    });
  }
}

export async function setSupabaseUserDisabled(uid: string, disabled: boolean) {
  if (!hasSupabaseAdminRuntime()) {
    return;
  }

  const adminClient = getSupabaseAdminClient();

  const updatePayload: Record<string, unknown> = {
    ban_duration: disabled ? "876000h" : "none",
  };

  const { error } = await adminClient.auth.admin.updateUserById(
    uid,
    updatePayload as never,
  );

  if (error) {
    throw Object.assign(new Error(error.message), {
      code: "auth/internal-error",
    });
  }
}

export async function revokeSupabaseRefreshTokens(uid: string) {
  if (!hasSupabaseAdminRuntime()) {
    return;
  }

  const adminClient = getSupabaseAdminClient();
  const authAdmin = adminClient.auth.admin as unknown as {
    signOut?: (userId: string) => Promise<{ error: { message?: string } | null }>;
    signOutUser?: (userId: string) => Promise<{ error: { message?: string } | null }>;
  };

  if (typeof authAdmin.signOut === "function") {
    const { error } = await authAdmin.signOut(uid);
    if (error) {
      throw Object.assign(new Error(error.message || "Unable to revoke sessions"), {
        code: "auth/internal-error",
      });
    }
    return;
  }

  if (typeof authAdmin.signOutUser === "function") {
    const { error } = await authAdmin.signOutUser(uid);
    if (error) {
      throw Object.assign(new Error(error.message || "Unable to revoke sessions"), {
        code: "auth/internal-error",
      });
    }
  }
}
