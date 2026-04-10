import "server-only";

import type { AuthUserRecord, DecodedAuthToken } from "@/lib/server/auth-types";
import {
  getSupabaseAuthUser,
  listSupabaseAuthUsers,
  revokeSupabaseRefreshTokens,
  setSupabaseUserClaims,
  setSupabaseUserDisabled,
  verifySupabaseAccessToken,
} from "@/lib/server/supabase-admin";

type ServerAuthAdapter = {
  verifyIdToken: (idToken: string, checkRevoked?: boolean) => Promise<DecodedAuthToken>;
  listUsers: (
    maxResults: number,
    pageToken?: string,
  ) => Promise<{ users: AuthUserRecord[]; pageToken?: string }>;
  getUser: (uid: string) => Promise<AuthUserRecord>;
  setCustomUserClaims: (uid: string, claims: Record<string, unknown>) => Promise<void>;
  revokeRefreshTokens: (uid: string) => Promise<void>;
  updateUser: (uid: string, updates: { disabled?: boolean }) => Promise<void>;
};

let cachedAdapter: ServerAuthAdapter | null = null;

function buildAuthError(code: string, message: string) {
  return Object.assign(new Error(message), {
    code,
  });
}

export function getServerAuthAdmin() {
  if (cachedAdapter) {
    return cachedAdapter;
  }

  cachedAdapter = {
    async verifyIdToken(idToken: string) {
      let decodedToken: DecodedAuthToken | null = null;
      try {
        decodedToken = await verifySupabaseAccessToken(idToken);
      } catch (error) {
        const code =
          typeof error === "object" && error && "code" in error
            ? String((error as { code?: unknown }).code ?? "")
            : "";
        if (code === "auth/internal-error") {
          throw buildAuthError(
            "auth/internal-error",
            "Supabase token verification is temporarily unavailable.",
          );
        }
        throw error;
      }

      if (!decodedToken) {
        throw buildAuthError(
          "auth/invalid-id-token",
          "The provided Supabase access token is invalid or expired.",
        );
      }

      return decodedToken;
    },
    async listUsers(maxResults: number, pageToken?: string) {
      return listSupabaseAuthUsers({
        maxResults,
        pageToken,
      });
    },
    async getUser(uid: string) {
      const user = await getSupabaseAuthUser(uid);
      if (!user) {
        throw buildAuthError("auth/user-not-found", "The user was not found.");
      }

      return user;
    },
    async setCustomUserClaims(uid: string, claims: Record<string, unknown>) {
      await setSupabaseUserClaims(uid, claims);
    },
    async revokeRefreshTokens(uid: string) {
      await revokeSupabaseRefreshTokens(uid);
    },
    async updateUser(uid: string, updates: { disabled?: boolean }) {
      if (typeof updates.disabled === "boolean") {
        await setSupabaseUserDisabled(uid, updates.disabled);
      }
    },
  };

  return cachedAdapter;
}
