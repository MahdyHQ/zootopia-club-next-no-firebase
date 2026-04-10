import "server-only";

const SESSION_TTL_ENV_KEY = "ZOOTOPIA_SESSION_TTL_SECONDS";
const DEFAULT_SESSION_TTL_SECONDS = 60 * 60;
const MIN_SESSION_TTL_SECONDS = 60;
const MAX_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function parsePositiveInteger(value: string | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/* Session TTL is centralized here so auth bootstrap, cookie lifetime, upload-workspace expiry,
   and cleanup behavior stay aligned between local development and App Hosting runtime.
   Future agents should not reintroduce scattered hardcoded TTL constants in route handlers. */
export function getSessionTtlSeconds() {
  const configured = parsePositiveInteger(process.env[SESSION_TTL_ENV_KEY]);
  if (!configured) {
    return DEFAULT_SESSION_TTL_SECONDS;
  }

  return Math.min(MAX_SESSION_TTL_SECONDS, Math.max(MIN_SESSION_TTL_SECONDS, configured));
}

export function getSessionTtlMilliseconds() {
  return getSessionTtlSeconds() * 1000;
}

export function getSessionExpiryTimestamp(startedAtMs = Date.now()) {
  return new Date(startedAtMs + getSessionTtlMilliseconds()).toISOString();
}