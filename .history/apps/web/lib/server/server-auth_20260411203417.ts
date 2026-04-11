import "server-only";

import type { AuthUserRecord, DecodedAuthToken } from "@/lib/server/auth-types";
import {
  AUTH_STAGE_TOKEN_VERIFY,
  AUTH_STAGE_USER_LOOKUP,
  createAuthTraceContext,
  logAuthStageFailure,
  logAuthStageStart,
  logAuthStageSuccess,
  type AuthTraceContext,
} from "@/lib/server/auth-tracing";
import {
  deleteSupabaseAuthUser,
  getSupabaseAuthUser,
  listSupabaseAuthUsers,
  revokeSupabaseRefreshTokens,
  setSupabaseUserClaims,
  setSupabaseUserDisabled,
  verifySupabaseAccessToken,
} from "@/lib/server/supabase-admin";

type ServerAuthAdapter = {
  verifyIdToken: (
    idToken: string,
    options?: {
      traceContext?: AuthTraceContext;
      checkRevoked?: boolean;
    },
  ) => Promise<DecodedAuthToken>;
  listUsers: (
    maxResults: number,
    pageToken?: string,
  ) => Promise<{ users: AuthUserRecord[]; pageToken?: string }>;
  getUser: (uid: string) => Promise<AuthUserRecord>;
  setCustomUserClaims: (uid: string, claims: Record<string, unknown>) => Promise<void>;
  revokeRefreshTokens: (uid: string) => Promise<void>;
  updateUser: (uid: string, updates: { disabled?: boolean }) => Promise<void>;
  deleteUser: (uid: string) => Promise<void>;
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
    async verifyIdToken(idToken: string, options) {
      const traceContext = options?.traceContext ?? createAuthTraceContext({
        flow: "system",
        provider: "server-auth",
      });

      logAuthStageStart(traceContext, AUTH_STAGE_TOKEN_VERIFY, {
        source: "getServerAuthAdmin.verifyIdToken",
      });

      try {
        const decodedToken = await verifySupabaseAccessToken(idToken);
        if (!decodedToken) {
          throw buildAuthError(
            "auth/invalid-id-token",
            "The provided Supabase access token is invalid or expired.",
          );
        }

        logAuthStageSuccess(traceContext, AUTH_STAGE_TOKEN_VERIFY, {
          uid: decodedToken.uid,
        });

        return decodedToken;
      } catch (error) {
        logAuthStageFailure(traceContext, AUTH_STAGE_TOKEN_VERIFY, error, {
          source: "getServerAuthAdmin.verifyIdToken",
        });
        throw error;
      }
    },
    async listUsers(maxResults: number, pageToken?: string) {
      return listSupabaseAuthUsers({
        maxResults,
        pageToken,
      });
    },
    async getUser(uid: string) {
      const traceContext = createAuthTraceContext({
        flow: "system",
        provider: "server-auth",
        uid,
      });
      logAuthStageStart(traceContext, AUTH_STAGE_USER_LOOKUP, {
        source: "getServerAuthAdmin.getUser",
      });

      try {
        const user = await getSupabaseAuthUser(uid);
        if (!user) {
          throw buildAuthError("auth/user-not-found", "The user was not found.");
        }

        logAuthStageSuccess(traceContext, AUTH_STAGE_USER_LOOKUP, {
          uid,
        });

        return user;
      } catch (error) {
        logAuthStageFailure(traceContext, AUTH_STAGE_USER_LOOKUP, error, {
          source: "getServerAuthAdmin.getUser",
        });
        throw error;
      }
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
    async deleteUser(uid: string) {
      await deleteSupabaseAuthUser(uid);
    },
  };

  return cachedAdapter;
}
