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
  verifySessionCookie: (
    sessionCookie: string,
    checkRevoked?: boolean,
  ) => Promise<DecodedAuthToken>;
  createSessionCookie: (
    idToken: string,
    options?: { expiresIn?: number },
  ) => Promise<string>;
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
      const decodedToken = await verifySupabaseAccessToken(idToken);
      if (!decodedToken) {
        throw buildAuthError(
          "auth/invalid-id-token",
          "The provided Supabase access token is invalid or expired.",
        );
      }

      return decodedToken;
    },
    async verifySessionCookie(sessionCookie: string) {
      const decodedToken = await verifySupabaseAccessToken(sessionCookie);
      if (!decodedToken) {
        throw buildAuthError(
          "auth/invalid-session-cookie",
          "The secure session cookie is invalid or expired.",
        );
      }

      return decodedToken;
    },
    async createSessionCookie(idToken: string) {
      const token = String(idToken || "").trim();
      if (!token) {
        throw buildAuthError("auth/invalid-id-token", "Session token is required.");
      }

      return token;
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
