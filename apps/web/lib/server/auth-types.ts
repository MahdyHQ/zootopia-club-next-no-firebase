import "server-only";

/**
 * Local auth shapes that previously depended on `firebase-admin/auth` types.
 * Supabase-backed session verification maps into these contracts for the rest of the server.
 */

export type AuthUserInfo = {
  providerId: string;
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  phoneNumber: string | null;
};

export type AuthUserRecord = {
  uid: string;
  email?: string | null;
  emailVerified?: boolean;
  displayName: string | null;
  photoURL: string | null;
  phoneNumber?: string | null;
  disabled: boolean;
  customClaims?: Record<string, unknown>;
  metadata: {
    creationTime?: string;
    lastSignInTime?: string;
    lastRefreshTime?: string;
    toJSON?: () => Record<string, unknown>;
  };
  providerData: AuthUserInfo[];
  toJSON?: () => Record<string, unknown>;
};

export type DecodedAuthToken = {
  uid: string;
  email?: string | null;
  name?: string;
  picture?: string;
  admin?: unknown;
  role?: unknown;
  auth_time?: number;
  iat?: number;
  firebase?: { sign_in_provider?: string | null };
} & Record<string, unknown>;
