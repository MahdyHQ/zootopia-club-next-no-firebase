import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { APP_ROUTES } from "@zootopia/shared-config";
import type {
  SessionUser,
  UserClientBestEffortSignInMetadata,
  UserRole,
  UserServerObservedSignInMetadata,
  UserStatus,
} from "@zootopia/shared-types";

import {
  getDecodedSignInProvider,
  hasConfiguredAdminAllowlist,
  hasRecentSignIn,
  isAllowlistedAdminEmail,
  verifyAdminClaimActivation,
} from "@/lib/server/admin-auth";
import {
  AUTH_STAGE_ADMIN_ALLOWLIST,
  AUTH_STAGE_ADMIN_CLAIM,
  AUTH_STAGE_JWT_CALLBACK,
  AUTH_STAGE_PROVIDER_CHECK,
  AUTH_STAGE_RECENT_SIGNIN,
  AUTH_STAGE_RUNTIME,
  AUTH_STAGE_SESSION_CALLBACK,
  AUTH_STAGE_SIGNIN_EVENT,
  AUTH_STAGE_STATUS_CHECK,
  AUTH_STAGE_TOKEN_REQUIRED,
  AUTH_STAGE_TOKEN_VERIFY,
  AUTH_STAGE_USER_UPSERT,
  classifyAuthError,
  createAuthTraceContext,
  logAuthStageFailure,
  logAuthStageStart,
  logAuthStageSuccess,
  type AuthTraceContext,
} from "@/lib/server/auth-tracing";
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
import { getZootopiaPersistenceRuntimeState } from "@/lib/server/zootopia-postgres-adapter";

type AuthProviderMode = "user" | "admin";

type AuthorizedUser = {
  id: string;
  uid: string;
  email: string | null;
  name: string | null;
  image: string | null;
  displayName: string | null;
  photoURL: string | null;
  deviceLabel: string | null;
  deviceLabelSource: string | null;
  deviceLabelConfidence: number | null;
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
  traceId?: string | null;
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
const DEVICE_LABEL_MAX_LENGTH = 120;
const DEVICE_LABEL_SOURCE_MAX_LENGTH = 80;
const CLIENT_BEST_EFFORT_METADATA_CREDENTIAL_MAX_LENGTH = 12_000;

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

function isAuthCredentialsError(error: unknown): error is AuthCredentialsError {
  return error instanceof AuthCredentialsError;
}

function isRepositoryInfrastructureError(error: unknown) {
  const adapterCode = getAuthAdapterErrorCode(error).toUpperCase();
  if (
    adapterCode === "ENOTFOUND"
    || adapterCode === "EAI_AGAIN"
    || adapterCode === "ECONNREFUSED"
    || adapterCode === "ECONNRESET"
    || adapterCode === "ETIMEDOUT"
    || adapterCode === "ECONNABORTED"
    || adapterCode === "ZOOTOPIA_DURABLE_PERSISTENCE_REQUIRED"
  ) {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalizedMessage = message.toUpperCase();
  return (
    normalizedMessage.includes("ENOTFOUND")
    || normalizedMessage.includes("GETADDRINFO")
    || normalizedMessage.includes("ECONNREFUSED")
    || normalizedMessage.includes("ECONNRESET")
    || normalizedMessage.includes("ETIMEDOUT")
    || normalizedMessage.includes("TIMEOUT")
    || normalizedMessage.includes("FETCH FAILED")
    || normalizedMessage.includes("ZOOTOPIA_DURABLE_PERSISTENCE_REQUIRED")
  );
}

function isRepositorySchemaError(error: unknown) {
  const adapterCode = getAuthAdapterErrorCode(error).toUpperCase();
  if (
    adapterCode === "42P01"
    || adapterCode === "42703"
    || adapterCode === "42P10"
  ) {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalizedMessage = message.toUpperCase();
  return (
    normalizedMessage.includes("RELATION")
    || normalizedMessage.includes("DOES NOT EXIST")
    || normalizedMessage.includes("COLUMN")
    || normalizedMessage.includes("ZC_ENTITIES")
  );
}

function handleUnexpectedAuthorizeError(
  error: unknown,
  mode: AuthProviderMode,
  traceContext: AuthTraceContext,
): never {
  if (isAuthCredentialsError(error)) {
    logAuthStageFailure(traceContext, AUTH_STAGE_RUNTIME, error, {
      outcome: "controlled_credentials_error",
      classification: classifyAuthError(error).kind,
    });
    throw error;
  }

  if (isRepositorySchemaError(error)) {
    logAuthStageFailure(traceContext, AUTH_STAGE_RUNTIME, error, {
      outcome: "repository_schema_failure",
    });
    throwAuthCode(
      "DB_REPOSITORY_SCHEMA_MISSING",
      mode === "admin"
        ? "Admin sign-in reached identity verification, but the profile schema is not ready."
        : "Sign-in reached identity verification, but the profile schema is not ready.",
    );
  }

  if (isRepositoryInfrastructureError(error)) {
    logAuthStageFailure(traceContext, AUTH_STAGE_RUNTIME, error, {
      outcome: "repository_infrastructure_failure",
    });
    throwAuthCode(
      "DB_REPOSITORY_UNAVAILABLE",
      mode === "admin"
        ? "Admin sign-in reached identity verification, but the profile store is currently unavailable."
        : "Sign-in reached identity verification, but the profile store is currently unavailable.",
    );
  }

  logAuthStageFailure(traceContext, AUTH_STAGE_RUNTIME, error, {
    outcome: "unexpected_runtime_failure",
    classification: classifyAuthError(error).kind,
  });

  throwAuthCode(
    mode === "admin" ? "ADMIN_BOOTSTRAP_FAILED" : "BOOTSTRAP_FAILED",
    mode === "admin"
      ? "Unexpected admin sign-in runtime failure."
      : "Unexpected sign-in runtime failure.",
  );
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

function normalizeOptionalCredentialString(value: string, maxLength: number) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, maxLength);
}

function normalizeDeviceLabelConfidence(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : Number.NaN;

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    return null;
  }

  return Math.round(parsed * 100) / 100;
}

function normalizeHeaderValue(value: string | null, maxLength = 512) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, maxLength);
}

function normalizeIpToken(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, 120);
}

function parseForwardedIpChain(value: string | null) {
  if (!value) {
    return null;
  }

  const chain = value
    .split(",")
    .map((entry) => normalizeIpToken(entry))
    .filter((entry): entry is string => entry !== null)
    .slice(0, 12);

  return chain.length > 0 ? chain : null;
}

function normalizeGeoCoordinate(value: string | null, min: number, max: number) {
  if (!value) {
    return null;
  }

  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return null;
  }

  return Number(parsed.toFixed(6));
}

function buildServerObservedSignInMetadata(request: Request): UserServerObservedSignInMetadata {
  const observedAt = new Date().toISOString();

  try {
    const headers = request.headers;
    const forwardedHeader = normalizeHeaderValue(headers.get("x-forwarded-for"), 1024);
    const forwardedIpChain = parseForwardedIpChain(forwardedHeader);
    const publicIp =
      forwardedIpChain?.[0]
      ?? normalizeIpToken(headers.get("x-real-ip"))
      ?? normalizeIpToken(headers.get("cf-connecting-ip"))
      ?? normalizeIpToken(headers.get("x-vercel-forwarded-for"));

    const vercelCountry = normalizeHeaderValue(headers.get("x-vercel-ip-country"), 16);
    const vercelRegion = normalizeHeaderValue(headers.get("x-vercel-ip-country-region"), 32);
    const vercelCity = normalizeHeaderValue(headers.get("x-vercel-ip-city"), 128);
    const vercelLatitude = normalizeGeoCoordinate(
      normalizeHeaderValue(headers.get("x-vercel-ip-latitude"), 32),
      -90,
      90,
    );
    const vercelLongitude = normalizeGeoCoordinate(
      normalizeHeaderValue(headers.get("x-vercel-ip-longitude"), 32),
      -180,
      180,
    );

    const cloudflareCountry = normalizeHeaderValue(headers.get("cf-ipcountry"), 16);
    const geoSource =
      vercelCountry || vercelRegion || vercelCity || vercelLatitude !== null || vercelLongitude !== null
        ? "vercel_edge_headers"
        : cloudflareCountry
          ? "cloudflare_headers"
          : null;

    const requestGeo = geoSource
      ? {
          source: geoSource,
          countryCode: vercelCountry ?? cloudflareCountry,
          region: vercelRegion,
          city: vercelCity,
          latitude: vercelLatitude,
          longitude: vercelLongitude,
        }
      : null;

    return {
      nonAuthoritative: true,
      observedAt,
      publicIp: publicIp ?? null,
      forwardedIpChain,
      acceptLanguage: normalizeHeaderValue(headers.get("accept-language"), 256),
      requestGeo,
    };
  } catch {
    return {
      nonAuthoritative: true,
      observedAt,
      publicIp: null,
      forwardedIpChain: null,
      acceptLanguage: null,
      requestGeo: null,
    };
  }
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
    deviceLabel: user.deviceLabel,
    deviceLabelSource: user.deviceLabelSource,
    deviceLabelConfidence: user.deviceLabelConfidence,
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

function readCredentialClientBestEffortSignInMetadata(
  credentials: Partial<Record<string, unknown>>,
) {
  const metadataPayload =
    readCredentialInput(credentials, "clientBestEffortSignInMetadata")
    || readCredentialInput(credentials, "client_best_effort_sign_in_metadata")
    || readCredentialInput(credentials, "clientBestEffortMetadata")
    || readCredentialInput(credentials, "client_best_effort_metadata");

  if (
    !metadataPayload
    || metadataPayload.length > CLIENT_BEST_EFFORT_METADATA_CREDENTIAL_MAX_LENGTH
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(metadataPayload) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    return parsed as UserClientBestEffortSignInMetadata;
  } catch {
    return null;
  }
}

function readCredentialDeviceMetadata(
  credentials: Partial<Record<string, unknown>>,
) {
  /* Device metadata is non-authoritative and only for admin observability.
     Keep parsing strictly bounded so auth/session security decisions never depend on it. */
  const clientBestEffortSignInMetadata =
    readCredentialClientBestEffortSignInMetadata(credentials);

  const deviceLabel =
    normalizeOptionalCredentialString(
      readCredentialInput(credentials, "deviceLabel"),
      DEVICE_LABEL_MAX_LENGTH,
    )
    ?? normalizeOptionalCredentialString(
      readCredentialInput(credentials, "device_label"),
      DEVICE_LABEL_MAX_LENGTH,
    );

  const deviceLabelSource =
    deviceLabel
      ? normalizeOptionalCredentialString(
        readCredentialInput(credentials, "deviceLabelSource"),
        DEVICE_LABEL_SOURCE_MAX_LENGTH,
      )
      ?? normalizeOptionalCredentialString(
        readCredentialInput(credentials, "device_label_source"),
        DEVICE_LABEL_SOURCE_MAX_LENGTH,
      )
      ?? "credentials_metadata"
      : null;

  const rawConfidence =
    readCredentialInput(credentials, "deviceLabelConfidence")
    || readCredentialInput(credentials, "device_label_confidence");

  return {
    deviceLabel,
    deviceLabelSource,
    deviceLabelConfidence: deviceLabel
      ? normalizeDeviceLabelConfidence(rawConfidence)
      : null,
    clientBestEffortSignInMetadata,
  };
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

  /* Keep auth bootstrap fail-closed in production when durable persistence is required.
     This prevents creating sessions that would immediately fail on protected data routes. */
  const persistenceRuntime = getZootopiaPersistenceRuntimeState();
  if (
    persistenceRuntime.requiresDurablePersistence
    && !persistenceRuntime.usingPostgres
  ) {
    throwAuthCode(
      "DB_REPOSITORY_UNAVAILABLE",
      "Sign-in reached identity verification, but durable profile storage is unavailable.",
    );
  }
}

async function verifySessionToken(
  idToken: string,
  mode: AuthProviderMode,
  traceContext: AuthTraceContext,
) {

  logAuthStageStart(traceContext, AUTH_STAGE_TOKEN_REQUIRED);
  if (!idToken) {
    logAuthStageFailure(traceContext, AUTH_STAGE_TOKEN_REQUIRED, new Error("ID_TOKEN_REQUIRED"));
    throwAuthCode("ID_TOKEN_REQUIRED", "A Supabase access token is required.");
  }
  logAuthStageSuccess(traceContext, AUTH_STAGE_TOKEN_REQUIRED);

  logAuthStageStart(traceContext, AUTH_STAGE_TOKEN_VERIFY);
  try {
    const decoded = await getServerAuthAdmin().verifyIdToken(idToken, {
      traceContext,
    });
    logAuthStageSuccess(traceContext, AUTH_STAGE_TOKEN_VERIFY, {
      uid: decoded.uid,
    });
    return decoded;
  } catch (verifyError) {
    logAuthStageFailure(traceContext, AUTH_STAGE_TOKEN_VERIFY, verifyError);
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
  const traceContext = createAuthTraceContext({
    flow: "user",
    provider: "user-credentials",
    request,
  });

  try {
    logAuthStageStart(traceContext, AUTH_STAGE_RUNTIME);
    assertAuthRuntime();
    logAuthStageSuccess(traceContext, AUTH_STAGE_RUNTIME);

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
    const deviceMetadata = readCredentialDeviceMetadata(credentials);
    const serverObservedSignInMetadata = buildServerObservedSignInMetadata(request);
    logAuthStageStart(traceContext, AUTH_STAGE_TOKEN_REQUIRED);
    if (!idToken) {
      logAuthStageFailure(traceContext, AUTH_STAGE_TOKEN_REQUIRED, new Error("ID_TOKEN_REQUIRED"));
    }
    const decodedToken = await verifySessionToken(idToken, "user", traceContext);
    traceContext.uidHint = decodedToken.uid;
    traceContext.emailHint = decodedToken.email ?? null;
    logAuthStageSuccess(traceContext, AUTH_STAGE_TOKEN_REQUIRED);

    logAuthStageStart(traceContext, AUTH_STAGE_RECENT_SIGNIN);
    if (!hasRecentSignIn(decodedToken)) {
      logAuthStageFailure(
        traceContext,
        AUTH_STAGE_RECENT_SIGNIN,
        new Error("RECENT_SIGN_IN_REQUIRED"),
      );
      throwAuthCode(
        "RECENT_SIGN_IN_REQUIRED",
        "Please complete a fresh sign-in before creating a session.",
      );
    }
    logAuthStageSuccess(traceContext, AUTH_STAGE_RECENT_SIGNIN);

    logAuthStageStart(traceContext, AUTH_STAGE_ADMIN_ALLOWLIST);
    if (isAllowlistedAdminEmail(decodedToken.email ?? null)) {
      logAuthStageFailure(
        traceContext,
        AUTH_STAGE_ADMIN_ALLOWLIST,
        new Error("ADMIN_LOGIN_REQUIRED"),
      );
      throwAuthCode(
        "ADMIN_LOGIN_REQUIRED",
        "Admin accounts must use the dedicated admin login page.",
      );
    }
    logAuthStageSuccess(traceContext, AUTH_STAGE_ADMIN_ALLOWLIST);

    logAuthStageStart(traceContext, AUTH_STAGE_PROVIDER_CHECK);
    const signInProvider = getDecodedSignInProvider(decodedToken);
    if (signInProvider !== "password") {
      logAuthStageFailure(
        traceContext,
        AUTH_STAGE_PROVIDER_CHECK,
        new Error("EMAIL_PASSWORD_REQUIRED"),
        {
          provider: signInProvider,
        },
      );
      throwAuthCode(
        "EMAIL_PASSWORD_REQUIRED",
        "Use an email/password sign-in flow from the regular user login page.",
      );
    }
    logAuthStageSuccess(traceContext, AUTH_STAGE_PROVIDER_CHECK, {
      provider: signInProvider,
    });

    const tokenClaims = decodedToken as Record<string, unknown>;
    logAuthStageStart(traceContext, AUTH_STAGE_USER_UPSERT);
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
      deviceLabel: deviceMetadata.deviceLabel,
      deviceLabelSource: deviceMetadata.deviceLabelSource,
      deviceLabelConfidence: deviceMetadata.deviceLabelConfidence,
      clientBestEffortSignInMetadata: deviceMetadata.clientBestEffortSignInMetadata,
      serverObservedSignInMetadata,
      traceContext,
    });
    logAuthStageSuccess(traceContext, AUTH_STAGE_USER_UPSERT, {
      role: user.role,
      status: user.status,
    });

    logAuthStageStart(traceContext, AUTH_STAGE_STATUS_CHECK);
    if (user.status !== "active") {
      logAuthStageFailure(traceContext, AUTH_STAGE_STATUS_CHECK, new Error("USER_SUSPENDED"));
      throwAuthCode(
        "USER_SUSPENDED",
        "This account is suspended and cannot start a session.",
      );
    }
    logAuthStageSuccess(traceContext, AUTH_STAGE_STATUS_CHECK);

    const normalizedProfileCompleted = normalizeSignedInProfileState({
      role: user.role,
      profileCompleted: !isProfileCompletionRequired(user),
    });

    return {
      ...toAuthorizedUser(user),
      profileCompleted: normalizedProfileCompleted,
      traceId: traceContext.traceId,
    };
  } catch (error) {
    handleUnexpectedAuthorizeError(error, "user", traceContext);
  }
}

async function authorizeAdminCredentials(
  credentials: Partial<Record<string, unknown>>,
  request: Request,
): Promise<AuthorizedUser> {
  const traceContext = createAuthTraceContext({
    flow: "admin",
    provider: "admin-credentials",
    request,
  });

  try {
    logAuthStageStart(traceContext, AUTH_STAGE_RUNTIME);
    assertAuthRuntime();
    logAuthStageSuccess(traceContext, AUTH_STAGE_RUNTIME);

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
    const deviceMetadata = readCredentialDeviceMetadata(credentials);
    const serverObservedSignInMetadata = buildServerObservedSignInMetadata(request);
    logAuthStageStart(traceContext, AUTH_STAGE_TOKEN_REQUIRED);
    if (!idToken) {
      logAuthStageFailure(traceContext, AUTH_STAGE_TOKEN_REQUIRED, new Error("ID_TOKEN_REQUIRED"));
    }
    const decodedToken = await verifySessionToken(idToken, "admin", traceContext);
    const auth = getServerAuthAdmin();
    traceContext.uidHint = decodedToken.uid;
    traceContext.emailHint = decodedToken.email ?? null;
    logAuthStageSuccess(traceContext, AUTH_STAGE_TOKEN_REQUIRED);

    logAuthStageStart(traceContext, AUTH_STAGE_RECENT_SIGNIN);
    if (!hasRecentSignIn(decodedToken)) {
      logAuthStageFailure(
        traceContext,
        AUTH_STAGE_RECENT_SIGNIN,
        new Error("RECENT_SIGN_IN_REQUIRED"),
      );
      throwAuthCode(
        "RECENT_SIGN_IN_REQUIRED",
        "Please complete a fresh admin sign-in before creating a session.",
      );
    }
    logAuthStageSuccess(traceContext, AUTH_STAGE_RECENT_SIGNIN);

    logAuthStageStart(traceContext, AUTH_STAGE_PROVIDER_CHECK);
    const signInProvider = getDecodedSignInProvider(decodedToken);
    if (signInProvider !== "password") {
      logAuthStageFailure(
        traceContext,
        AUTH_STAGE_PROVIDER_CHECK,
        new Error("EMAIL_PASSWORD_REQUIRED"),
        {
          provider: signInProvider,
        },
      );
      throwAuthCode(
        "EMAIL_PASSWORD_REQUIRED",
        "Admin access requires email/password authentication.",
      );
    }
    logAuthStageSuccess(traceContext, AUTH_STAGE_PROVIDER_CHECK, {
      provider: signInProvider,
    });

    logAuthStageStart(traceContext, AUTH_STAGE_ADMIN_ALLOWLIST);
    const isAllowlisted = isAllowlistedAdminEmail(decodedToken.email ?? null);
    if (!isAllowlisted) {
      logAuthStageFailure(
        traceContext,
        AUTH_STAGE_ADMIN_ALLOWLIST,
        new Error("ADMIN_ACCOUNT_UNAUTHORIZED"),
      );
      throwAuthCode(
        "ADMIN_ACCOUNT_UNAUTHORIZED",
        "This account is not authorized for admin access.",
      );
    }
    logAuthStageSuccess(traceContext, AUTH_STAGE_ADMIN_ALLOWLIST);

    const tokenClaims = decodedToken as Record<string, unknown>;
    logAuthStageStart(traceContext, AUTH_STAGE_ADMIN_CLAIM);
    const claimVerification = await verifyAdminClaimActivation(auth, {
      uid: decodedToken.uid,
      email: decodedToken.email ?? null,
      admin: tokenClaims.admin,
      traceContext,
    });

    if (!claimVerification.ok) {
      logAuthStageFailure(
        traceContext,
        AUTH_STAGE_ADMIN_CLAIM,
        new Error(claimVerification.code),
      );
      throwAuthCode(claimVerification.code, claimVerification.message);
    }
    logAuthStageSuccess(traceContext, AUTH_STAGE_ADMIN_CLAIM);

    logAuthStageStart(traceContext, AUTH_STAGE_USER_UPSERT);
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
      deviceLabel: deviceMetadata.deviceLabel,
      deviceLabelSource: deviceMetadata.deviceLabelSource,
      deviceLabelConfidence: deviceMetadata.deviceLabelConfidence,
      clientBestEffortSignInMetadata: deviceMetadata.clientBestEffortSignInMetadata,
      serverObservedSignInMetadata,
      traceContext,
    });
    logAuthStageSuccess(traceContext, AUTH_STAGE_USER_UPSERT, {
      role: user.role,
      status: user.status,
    });

    logAuthStageStart(traceContext, AUTH_STAGE_STATUS_CHECK);
    if (user.status !== "active") {
      logAuthStageFailure(traceContext, AUTH_STAGE_STATUS_CHECK, new Error("USER_SUSPENDED"));
      throwAuthCode(
        "USER_SUSPENDED",
        "This admin account is suspended and cannot start a session.",
      );
    }
    logAuthStageSuccess(traceContext, AUTH_STAGE_STATUS_CHECK);

    const normalizedProfileCompleted = normalizeSignedInProfileState({
      role: user.role,
      profileCompleted: !isProfileCompletionRequired(user),
    });

    return {
      ...toAuthorizedUser(user),
      profileCompleted: normalizedProfileCompleted,
      traceId: traceContext.traceId,
    };
  } catch (error) {
    handleUnexpectedAuthorizeError(error, "admin", traceContext);
  }
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
        deviceLabel: { label: "Device label", type: "text" },
        deviceLabelSource: { label: "Device label source", type: "text" },
        deviceLabelConfidence: { label: "Device label confidence", type: "text" },
        clientBestEffortSignInMetadata: {
          label: "Client best-effort sign-in metadata",
          type: "text",
        },
      },
      authorize: authorizeUserCredentials,
    }),
    Credentials({
      id: "admin-credentials",
      name: "Admin credentials",
      credentials: {
        idToken: { label: "ID token", type: "text" },
        deviceLabel: { label: "Device label", type: "text" },
        deviceLabelSource: { label: "Device label source", type: "text" },
        deviceLabelConfidence: { label: "Device label confidence", type: "text" },
        clientBestEffortSignInMetadata: {
          label: "Client best-effort sign-in metadata",
          type: "text",
        },
      },
      authorize: authorizeAdminCredentials,
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      const authUser = (user as Partial<AuthorizedUser> | undefined) ?? {};
      const tokenClaims = token as Record<string, unknown>;
      const userUid = normalizeString(authUser.uid ?? authUser.id);
      const tokenUid = normalizeString(tokenClaims.uid);
      const userEmail = normalizeString(authUser.email);
      const tokenEmail = normalizeString(tokenClaims.email);
      const resolvedRole = user
        ? normalizeRole(authUser.role)
        : normalizeRole(tokenClaims.role);
      const resolvedProvider =
        resolvedRole === "admin" ? "admin-credentials" : "user-credentials";
      const traceContext = createAuthTraceContext({
        flow: resolvedRole === "admin" ? "admin" : "user",
        provider: resolvedProvider,
        traceId: typeof authUser.traceId === "string" ? authUser.traceId : null,
        uid: userUid ?? tokenUid,
        email: userEmail ?? tokenEmail,
      });
      logAuthStageStart(traceContext, AUTH_STAGE_JWT_CALLBACK);

      if (user) {
        const claims = tokenClaims;

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
        claims.deviceLabel = normalizeString(authUser.deviceLabel);
        claims.deviceLabelSource = normalizeString(authUser.deviceLabelSource);
        claims.deviceLabelConfidence = normalizeDeviceLabelConfidence(authUser.deviceLabelConfidence);
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
        claims.authTraceId = traceContext.traceId;
      }

      logAuthStageSuccess(traceContext, AUTH_STAGE_JWT_CALLBACK);

      return token;
    },
    async session({ session, token }) {
      const claims = token as Record<string, unknown>;
      const uid = normalizeString(claims.uid);
      const traceContext = createAuthTraceContext({
        flow: normalizeRole(claims.role) === "admin" ? "admin" : "user",
        provider: "session",
        traceId:
          typeof claims.authTraceId === "string"
            ? claims.authTraceId
            : null,
        uid,
        email: normalizeString(claims.email),
      });
      logAuthStageStart(traceContext, AUTH_STAGE_SESSION_CALLBACK);

      if (!uid) {
        logAuthStageFailure(traceContext, AUTH_STAGE_SESSION_CALLBACK, new Error("SESSION_UID_MISSING"));
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
        deviceLabel: normalizeString(claims.deviceLabel),
        deviceLabelSource: normalizeString(claims.deviceLabelSource),
        deviceLabelConfidence: normalizeDeviceLabelConfidence(claims.deviceLabelConfidence),
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

      logAuthStageSuccess(traceContext, AUTH_STAGE_SESSION_CALLBACK, {
        role: normalizeRole(claims.role),
        status: normalizeStatus(claims.status),
      });

      return session;
    },
  },
  events: {
    async signIn({ user, account }) {
      const authUser = user as Partial<AuthorizedUser>;
      const uid = normalizeString(authUser.uid ?? authUser.id);
      const role = normalizeRole(authUser.role);
      const traceContext = createAuthTraceContext({
        flow: role === "admin" ? "admin" : "user",
        provider: account?.provider === "admin-credentials"
          ? "admin-credentials"
          : "user-credentials",
        traceId: typeof authUser.traceId === "string" ? authUser.traceId : null,
        uid,
        email: normalizeString(authUser.email),
      });
      logAuthStageStart(traceContext, AUTH_STAGE_SIGNIN_EVENT);

      if (!uid) {
        logAuthStageFailure(traceContext, AUTH_STAGE_SIGNIN_EVENT, new Error("SIGNIN_UID_MISSING"));
        return;
      }

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

      logAuthStageSuccess(traceContext, AUTH_STAGE_SIGNIN_EVENT, {
        action,
      });
    },
  },
});
