import { randomUUID } from "node:crypto";

export const AUTH_STAGE_RUNTIME = "AUTH_STAGE_RUNTIME" as const;
export const AUTH_STAGE_TOKEN_REQUIRED = "AUTH_STAGE_TOKEN_REQUIRED" as const;
export const AUTH_STAGE_TOKEN_VERIFY = "AUTH_STAGE_TOKEN_VERIFY" as const;
export const AUTH_STAGE_RECENT_SIGNIN = "AUTH_STAGE_RECENT_SIGNIN" as const;
export const AUTH_STAGE_PROVIDER_CHECK = "AUTH_STAGE_PROVIDER_CHECK" as const;
export const AUTH_STAGE_ADMIN_ALLOWLIST = "AUTH_STAGE_ADMIN_ALLOWLIST" as const;
export const AUTH_STAGE_ADMIN_CLAIM = "AUTH_STAGE_ADMIN_CLAIM" as const;
export const AUTH_STAGE_USER_LOOKUP = "AUTH_STAGE_USER_LOOKUP" as const;
export const AUTH_STAGE_USER_UPSERT = "AUTH_STAGE_USER_UPSERT" as const;
export const AUTH_STAGE_STATUS_CHECK = "AUTH_STAGE_STATUS_CHECK" as const;
export const AUTH_STAGE_JWT_CALLBACK = "AUTH_STAGE_JWT_CALLBACK" as const;
export const AUTH_STAGE_SESSION_CALLBACK = "AUTH_STAGE_SESSION_CALLBACK" as const;
export const AUTH_STAGE_SIGNIN_EVENT = "AUTH_STAGE_SIGNIN_EVENT" as const;
export const AUTH_STAGE_REPOSITORY_READ = "AUTH_STAGE_REPOSITORY_READ" as const;
export const AUTH_STAGE_REPOSITORY_WRITE = "AUTH_STAGE_REPOSITORY_WRITE" as const;

export type AuthTraceStage =
  | typeof AUTH_STAGE_RUNTIME
  | typeof AUTH_STAGE_TOKEN_REQUIRED
  | typeof AUTH_STAGE_TOKEN_VERIFY
  | typeof AUTH_STAGE_RECENT_SIGNIN
  | typeof AUTH_STAGE_PROVIDER_CHECK
  | typeof AUTH_STAGE_ADMIN_ALLOWLIST
  | typeof AUTH_STAGE_ADMIN_CLAIM
  | typeof AUTH_STAGE_USER_LOOKUP
  | typeof AUTH_STAGE_USER_UPSERT
  | typeof AUTH_STAGE_STATUS_CHECK
  | typeof AUTH_STAGE_JWT_CALLBACK
  | typeof AUTH_STAGE_SESSION_CALLBACK
  | typeof AUTH_STAGE_SIGNIN_EVENT
  | typeof AUTH_STAGE_REPOSITORY_READ
  | typeof AUTH_STAGE_REPOSITORY_WRITE;

export type AuthTraceFlow = "user" | "admin" | "system";

export type AuthTraceProvider =
  | "user-credentials"
  | "admin-credentials"
  | "repository"
  | "server-auth"
  | "admin-auth"
  | "session";

export type AuthTraceContext = {
  traceId: string;
  flow: AuthTraceFlow;
  provider: AuthTraceProvider;
  requestPath: string | null;
  uidHint: string | null;
  emailHint: string | null;
};

export type ClassifiedAuthError = {
  code: string | null;
  name: string;
  message: string;
  kind: "auth" | "database" | "network" | "runtime";
};

function maskUid(value: string | null | undefined) {
  const uid = String(value || "").trim();
  if (!uid) {
    return null;
  }

  if (uid.length <= 10) {
    return uid;
  }

  return `${uid.slice(0, 5)}...${uid.slice(-4)}`;
}

function maskEmail(value: string | null | undefined) {
  const email = String(value || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return null;
  }

  const [local, domain] = email.split("@");
  if (!local || !domain) {
    return null;
  }

  const localMask = local.length <= 2
    ? `${local[0] || "*"}*`
    : `${local.slice(0, 2)}***`;

  return `${localMask}@${domain}`;
}

function truncateMessage(value: string, maxLength = 240) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
}

function readErrorCode(error: unknown) {
  if (typeof error !== "object" || !error || !("code" in error)) {
    return null;
  }

  const value = (error as { code?: unknown }).code;
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

export function classifyAuthError(error: unknown): ClassifiedAuthError {
  const code = readErrorCode(error);
  const name = error instanceof Error
    ? error.name
    : typeof error;
  const message = truncateMessage(
    error instanceof Error ? error.message : String(error ?? "Unknown auth error"),
  );
  const normalized = `${String(code || "").toUpperCase()} ${message.toUpperCase()}`;

  if (
    normalized.includes("AUTH/")
    || normalized.includes("CREDENTIAL")
    || normalized.includes("TOKEN")
    || normalized.includes("SESSION")
  ) {
    return { code, name, message, kind: "auth" };
  }

  if (
    normalized.includes("42P")
    || normalized.includes("POSTGRES")
    || normalized.includes("SQL")
    || normalized.includes("RELATION")
    || normalized.includes("COLUMN")
  ) {
    return { code, name, message, kind: "database" };
  }

  if (
    normalized.includes("ENOTFOUND")
    || normalized.includes("EAI_AGAIN")
    || normalized.includes("ECONN")
    || normalized.includes("ETIMEDOUT")
    || normalized.includes("TIMEOUT")
    || normalized.includes("FETCH FAILED")
  ) {
    return { code, name, message, kind: "network" };
  }

  return { code, name, message, kind: "runtime" };
}

function toRequestPath(request: Request | null | undefined) {
  if (!request?.url) {
    return null;
  }

  try {
    return new URL(request.url).pathname;
  } catch {
    return null;
  }
}

export function createAuthTraceContext(input: {
  flow: AuthTraceFlow;
  provider: AuthTraceProvider;
  request?: Request | null;
  traceId?: string | null;
  uid?: string | null;
  email?: string | null;
}): AuthTraceContext {
  /* A stable trace id allows cross-file callback diagnostics (auth.ts -> server-auth.ts
     -> admin-auth.ts -> repository.ts) without ever logging secrets or raw tokens. */
  const traceId = String(input.traceId || "").trim() || randomUUID();

  return {
    traceId,
    flow: input.flow,
    provider: input.provider,
    requestPath: toRequestPath(input.request),
    uidHint: maskUid(input.uid),
    emailHint: maskEmail(input.email),
  };
}

function sanitizeKeyValue(key: string, value: unknown): unknown {
  const normalizedKey = key.toLowerCase();

  if (
    normalizedKey.includes("token")
    || normalizedKey.includes("password")
    || normalizedKey.includes("secret")
    || normalizedKey.includes("authorization")
  ) {
    return "[redacted]";
  }

  if (normalizedKey.includes("email") && typeof value === "string") {
    return maskEmail(value) ?? "[redacted]";
  }

  if (normalizedKey.includes("uid") && typeof value === "string") {
    return maskUid(value) ?? "[redacted]";
  }

  if (typeof value === "string") {
    return truncateMessage(value, 120);
  }

  return value;
}

function sanitizeDetails(details: Record<string, unknown> | undefined) {
  if (!details) {
    return undefined;
  }

  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    next[key] = sanitizeKeyValue(key, value);
  }

  return next;
}

function buildTracePayload(input: {
  event: "stage_start" | "stage_success" | "stage_failure";
  context: AuthTraceContext;
  stage: AuthTraceStage;
  details?: Record<string, unknown>;
  error?: ClassifiedAuthError;
}) {
  return {
    event: input.event,
    traceId: input.context.traceId,
    flow: input.context.flow,
    provider: input.context.provider,
    stage: input.stage,
    requestPath: input.context.requestPath,
    uidHint: input.context.uidHint,
    emailHint: input.context.emailHint,
    details: sanitizeDetails(input.details),
    error: input.error,
    timestamp: new Date().toISOString(),
  };
}

export function logAuthStageStart(
  context: AuthTraceContext,
  stage: AuthTraceStage,
  details?: Record<string, unknown>,
) {
  console.info("[auth-trace]", buildTracePayload({
    event: "stage_start",
    context,
    stage,
    details,
  }));
}

export function logAuthStageSuccess(
  context: AuthTraceContext,
  stage: AuthTraceStage,
  details?: Record<string, unknown>,
) {
  console.info("[auth-trace]", buildTracePayload({
    event: "stage_success",
    context,
    stage,
    details,
  }));
}

export function logAuthStageFailure(
  context: AuthTraceContext,
  stage: AuthTraceStage,
  error: unknown,
  details?: Record<string, unknown>,
) {
  console.error("[auth-trace]", buildTracePayload({
    event: "stage_failure",
    context,
    stage,
    details,
    error: classifyAuthError(error),
  }));
}
