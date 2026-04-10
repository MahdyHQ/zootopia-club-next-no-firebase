import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { APP_ROUTES } from "@zootopia/shared-config";
import type { SessionUser, UserRole, UserStatus } from "@zootopia/shared-types";

import {
  getDecodedSignInProvider,
  hasConfiguredAdminAllowlist,
  hasRecentSignIn,
  isAllowlistedAdminEmail,
  verifyAdminClaimActivation,
} from "@/lib/server/admin-auth";
import {
  appendAdminLog,
  getRoleFromAuthClaims,
  upsertUserFromAuth,
} from "@/lib/server/repository";
import { isProfileCompletionRequired } from "@/lib/return-to";
import { checkRequestRateLimit } from "@/lib/server/request-rate-limit";
import { getServerAuthAdmin } from "@/lib/server/server-auth";
import { getSessionTtlSeconds } from "@/lib/server/session-config";
import { hasSupabaseAdminRuntime } from "@/lib/server/supabase-admin";

type AuthProviderMode = "user" | "admin";

type AuthorizedUser = {
  id: string;
  uid: string;
  email: string | null;
  name: string | null;
  image: string | null;
  displayName: string | null;
  photoURL: string | null;
  fullName: string | null;
  universityCode: string | null;
  phoneNumber: string | null;
  phoneCountryIso2: string | null;
  phoneCountryCallingCode: string | null;
  nationality: string | null;
  profileCompleted: boolean;
  profileCompletedAt: string | null;
  role: UserRole;
  status: UserStatus;
};

const AUTH_TOKEN_ERROR_CODES = new Set([
  "auth/id-token-expired",
  "auth/id-token-revoked",
  "auth/invalid-id-token",
  "auth/argument-error",
  "auth/invalid-argument",
  "auth/user-disabled",
  "auth/user-not-found",
]);

const USER_BOOTSTRAP_RATE_LIMIT_MAX_REQUESTS = 20;
const USER_BOOTSTRAP_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const ADMIN_BOOTSTRAP_RATE_LIMIT_MAX_REQUESTS = 10;
const ADMIN_BOOTSTRAP_RATE_LIMIT_WINDOW_MS = 60 * 1000;

class AuthCredentialsError extends CredentialsSignin {
  code: string;

  constructor(code: string, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

function throwAuthCode(code: string, message?: string): never {
  throw new AuthCredentialsError(code, message);
}

function getAuthAdapterErrorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    return String((error as { code: unknown }).code ?? "");
  }

  return "";
}

function normalizeRole(value: unknown): UserRole {
  return value === "admin" ? "admin" : "user";
}

function normalizeStatus(value: unknown): UserStatus {
  return value === "suspended" ? "suspended" : "active";
}

function normalizeString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function toAuthorizedUser(user: SessionUser): AuthorizedUser {
  return {
    id: user.uid,
    uid: user.uid,
    email: user.email,
    name: user.displayName,
    image: user.photoURL,
    displayName: user.displayName,
    photoURL: user.photoURL,
    fullName: user.fullName,
    universityCode: user.universityCode,
    phoneNumber: user.phoneNumber,
    phoneCountryIso2: user.phoneCountryIso2,
    phoneCountryCallingCode: user.phoneCountryCallingCode,
    nationality: user.nationality,
    profileCompleted: user.profileCompleted,
    profileCompletedAt: user.profileCompletedAt,
    role: user.role,
    status: user.status,
  };
}

function normalizeSignedInProfileState(input: {
  role: UserRole;
  profileCompleted: boolean;
}) {
  if (input.role === "admin") {
    return true;
  }

  return input.profileCompleted;
}

function readCredentialInput(
  credentials: Partial<Record<string, unknown>>,
  key: string,
) {
  const value = credentials[key];
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function assertAuthRuntime() {
  if (!hasSupabaseAdminRuntime()) {
    throwAuthCode(
      "SUPABASE_ADMIN_UNAVAILABLE",
      "Supabase auth runtime is not configured yet.",
    );
  }

  if (!hasConfiguredAdminAllowlist()) {
    throwAuthCode(
      "ADMIN_ALLOWLIST_UNCONFIGURED",
      "Admin allowlist is not configured for this runtime.",
    );
  }
}

async function verifySessionToken(idToken: string, mode: AuthProviderMode) {
  if (!idToken) {
    throwAuthCode("ID_TOKEN_REQUIRED", "A Supabase access token is required.");
  }

  try {
    return await getServerAuthAdmin().verifyIdToken(idToken);
  } catch (verifyError) {
    const code = getAuthAdapterErrorCode(verifyError);

    if (code === "auth/id-token-revoked") {
      throwAuthCode(
        "ID_TOKEN_REVOKED",
        "This session token has been revoked. Please sign in again.",
      );
    }

    if (code === "auth/user-disabled") {
      throwAuthCode(
        "USER_SUSPENDED",
        mode === "admin"
          ? "This admin account is suspended and cannot start a session."
          : "This account is suspended and cannot start a session.",
      );
    }

    if (AUTH_TOKEN_ERROR_CODES.has(code)) {
      throwAuthCode(
        "ID_TOKEN_INVALID",
        "The provided ID token is invalid or has expired.",
      );
    }

    throwAuthCode(
      mode === "admin" ? "ADMIN_BOOTSTRAP_FAILED" : "BOOTSTRAP_FAILED",
      mode === "admin"
        ? "Unable to verify the admin session token."
        : "Unable to verify the session token.",
    );
  }
}

async function authorizeUserCredentials(
  credentials: Partial<Record<string, unknown>>,
  request: Request,
): Promise<AuthorizedUser> {
  assertAuthRuntime();

  const rateLimit = checkRequestRateLimit({
    request,
    scope: "user-auth-bootstrap",
    maxRequests: USER_BOOTSTRAP_RATE_LIMIT_MAX_REQUESTS,
    windowMs: USER_BOOTSTRAP_RATE_LIMIT_WINDOW_MS,
  });
  if (!rateLimit.allowed) {
    throwAuthCode(
      "AUTH_RATE_LIMITED",
      "Too many user session attempts. Please retry shortly.",
    );
  }

  const idToken = readCredentialInput(credentials, "idToken");
  const decodedToken = await verifySessionToken(idToken, "user");

  if (!hasRecentSignIn(decodedToken)) {
    throwAuthCode(
      "RECENT_SIGN_IN_REQUIRED",
      "Please complete a fresh sign-in before creating a session.",
    );
  }

  if (isAllowlistedAdminEmail(decodedToken.email ?? null)) {
    throwAuthCode(
      "ADMIN_LOGIN_REQUIRED",
      "Admin accounts must use the dedicated admin login page.",
    );
  }

  const signInProvider = getDecodedSignInProvider(decodedToken);
  if (signInProvider !== "password") {
    throwAuthCode(
      "EMAIL_PASSWORD_REQUIRED",
      "Use an email/password sign-in flow from the regular user login page.",
    );
  }

  const tokenClaims = decodedToken as Record<string, unknown>;
  const user = await upsertUserFromAuth({
    uid: decodedToken.uid,
    email: decodedToken.email ?? null,
    displayName: typeof decodedToken.name === "string" ? decodedToken.name : null,
    photoURL:
      typeof decodedToken.picture === "string" ? decodedToken.picture : null,
    role: getRoleFromAuthClaims({
      email: decodedToken.email ?? null,
      admin: tokenClaims.admin,
    }),
  });

  if (user.status !== "active") {
    throwAuthCode(
      "USER_SUSPENDED",
      "This account is suspended and cannot start a session.",
    );
  }

  const normalizedProfileCompleted = normalizeSignedInProfileState({
    role: user.role,
    profileCompleted: !isProfileCompletionRequired(user),
  });

  return {
    ...toAuthorizedUser(user),
    profileCompleted: normalizedProfileCompleted,
  };
}

async function authorizeAdminCredentials(
  credentials: Partial<Record<string, unknown>>,
  request: Request,
): Promise<AuthorizedUser> {
  assertAuthRuntime("admin");

  const rateLimit = checkRequestRateLimit({
    request,
    scope: "admin-auth-bootstrap",
    maxRequests: ADMIN_BOOTSTRAP_RATE_LIMIT_MAX_REQUESTS,
    windowMs: ADMIN_BOOTSTRAP_RATE_LIMIT_WINDOW_MS,
  });
  if (!rateLimit.allowed) {
    throwAuthCode(
      "AUTH_RATE_LIMITED",
      "Too many admin session attempts. Please retry shortly.",
    );
  }

  const idToken = readCredentialInput(credentials, "idToken");
  const decodedToken = await verifySessionToken(idToken, "admin");
  const auth = getServerAuthAdmin();

  if (!hasRecentSignIn(decodedToken)) {
    throwAuthCode(
      "RECENT_SIGN_IN_REQUIRED",
      "Please complete a fresh admin sign-in before creating a session.",
    );
  }

  const signInProvider = getDecodedSignInProvider(decodedToken);
  if (signInProvider !== "password") {
    throwAuthCode(
      "EMAIL_PASSWORD_REQUIRED",
      "Admin access requires email/password authentication.",
    );
  }

  const isAllowlisted = isAllowlistedAdminEmail(decodedToken.email ?? null);
  if (!isAllowlisted) {
    throwAuthCode(
      "ADMIN_ACCOUNT_UNAUTHORIZED",
      "This account is not authorized for admin access.",
    );
  }

  const tokenClaims = decodedToken as Record<string, unknown>;
  const claimVerification = await verifyAdminClaimActivation(auth, {
    uid: decodedToken.uid,
    email: decodedToken.email ?? null,
    admin: tokenClaims.admin,
  });

  if (!claimVerification.ok) {
    throwAuthCode(claimVerification.code, claimVerification.message);
  }

  const user = await upsertUserFromAuth({
    uid: decodedToken.uid,
    email: decodedToken.email ?? null,
    displayName: typeof decodedToken.name === "string" ? decodedToken.name : null,
    photoURL:
      typeof decodedToken.picture === "string" ? decodedToken.picture : null,
    role: getRoleFromAuthClaims({
      email: decodedToken.email ?? null,
      admin: tokenClaims.admin,
    }),
  });

  if (user.status !== "active") {
    throwAuthCode(
      "USER_SUSPENDED",
      "This admin account is suspended and cannot start a session.",
    );
  }

  const normalizedProfileCompleted = normalizeSignedInProfileState({
    role: user.role,
    profileCompleted: !isProfileCompletionRequired(user),
  });

  return {
    ...toAuthorizedUser(user),
    profileCompleted: normalizedProfileCompleted,
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  pages: {
    signIn: APP_ROUTES.login,
  },
  session: {
    strategy: "jwt",
    maxAge: getSessionTtlSeconds(),
  },
  providers: [
    Credentials({
      id: "user-credentials",
      name: "User credentials",
      credentials: {
        idToken: { label: "ID token", type: "text" },
      },
      authorize: authorizeUserCredentials,
    }),
    Credentials({
      id: "admin-credentials",
      name: "Admin credentials",
      credentials: {
        idToken: { label: "ID token", type: "text" },
        adminLoginPassword: { label: "Admin password gate", type: "password" },
      },
      authorize: authorizeAdminCredentials,
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const claims = token as Record<string, unknown>;
        const authUser = user as Partial<AuthorizedUser>;

        /* SESSION OWNERSHIP BINDING (Auth.js JWT Callback):
           
           This callback populates the JWT token with all fields needed for storage ownership validation.
           The `uid` field is the PRIMARY key for all subsequent owner checks.
           
           Ownership Chain:
           1. Auth.js strategy: "jwt" (stateless, not database sessions)
           2. JWT payload contains: uid, role, status, profileCompleted
           3. Session TTL enforced: maxAge = ZOOTOPIA_SESSION_TTL_SECONDS (default 1 hour)
           4. Cookie is HTTP-only, secure, signed with AUTH_SECRET
           5. Every Route Handler reads session via auth() and extracts uid
           6. Storage access validated: if (request.path.includes(session.uid)) → allowed
           
           Why this matters:
           - Client cannot modify uid in transit (JWT is signed)
           - Client cannot specify ownership in request body (ignored)
           - Server-side session verification ALWAYS happens before storage access
           - Even if uid is leaked, attackers still cannot access storage without valid session
           
           Future agents: Preserve the uid field here; it's the security critical invariant.
        */

        claims.uid = authUser.uid ?? authUser.id ?? null;
        claims.displayName = normalizeString(authUser.displayName ?? authUser.name);
        claims.photoURL = normalizeString(authUser.photoURL ?? authUser.image);
        claims.fullName = normalizeString(authUser.fullName);
        claims.universityCode = normalizeString(authUser.universityCode);
        claims.phoneNumber = normalizeString(authUser.phoneNumber);
        claims.phoneCountryIso2 = normalizeString(authUser.phoneCountryIso2);
        claims.phoneCountryCallingCode = normalizeString(
          authUser.phoneCountryCallingCode,
        );
        claims.nationality = normalizeString(authUser.nationality);
        claims.profileCompleted = Boolean(authUser.profileCompleted);
        claims.profileCompletedAt = normalizeString(authUser.profileCompletedAt);
        claims.role = normalizeRole(authUser.role);
        claims.status = normalizeStatus(authUser.status);
      }

      return token;
    },
    async session({ session, token }) {
      const claims = token as Record<string, unknown>;
      const uid = normalizeString(claims.uid);

      if (!uid) {
        return session;
      }

      session.user = {
        ...session.user,
        id: uid,
        uid,
        email: normalizeString(claims.email) ?? session.user?.email ?? null,
        name: normalizeString(claims.displayName) ?? session.user?.name ?? null,
        image: normalizeString(claims.photoURL) ?? session.user?.image ?? null,
        displayName: normalizeString(claims.displayName),
        photoURL: normalizeString(claims.photoURL),
        fullName: normalizeString(claims.fullName),
        universityCode: normalizeString(claims.universityCode),
        phoneNumber: normalizeString(claims.phoneNumber),
        phoneCountryIso2: normalizeString(claims.phoneCountryIso2),
        phoneCountryCallingCode: normalizeString(claims.phoneCountryCallingCode),
        nationality: normalizeString(claims.nationality),
        profileCompleted: Boolean(claims.profileCompleted),
        profileCompletedAt: normalizeString(claims.profileCompletedAt),
        role: normalizeRole(claims.role),
        status: normalizeStatus(claims.status),
        emailVerified: null,
      } as typeof session.user;

      return session;
    },
  },
  events: {
    async signIn({ user, account }) {
      const authUser = user as Partial<AuthorizedUser>;
      const uid = normalizeString(authUser.uid ?? authUser.id);
      if (!uid) {
        return;
      }

      const role = normalizeRole(authUser.role);
      const action = account?.provider === "admin-credentials"
        ? "admin-session-created"
        : "user-session-created";

      await appendAdminLog({
        actorUid: uid,
        actorRole: role,
        ownerUid: uid,
        ownerRole: role,
        action,
        resourceType: "session",
        resourceId: uid,
        route: account?.provider === "admin-credentials"
          ? "/api/auth/callback/admin-credentials"
          : "/api/auth/callback/user-credentials",
      });
    },
  },
});