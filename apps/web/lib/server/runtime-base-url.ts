import "server-only";

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

const LOCALHOST_PATTERN =
  /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i;

/**
 * Parse and normalize runtime base URL candidates from environment variables.
 * Accepts raw hostnames with or without protocol, applies secure defaults
 * (https except localhost-family hosts), and returns a trimmed absolute URL.
 */
function parseRuntimeBaseUrl(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return null;
  }

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : LOCALHOST_PATTERN.test(trimmed)
      ? `http://${trimmed}`
      : `https://${trimmed}`;

  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    return trimTrailingSlash(parsed.toString());
  } catch {
    return null;
  }
}

/**
 * Resolve the canonical server base URL used by admin server actions that call
 * internal API routes. This keeps Vercel deployments stable when NEXT_PUBLIC_BASE_URL
 * is unset by falling back to NEXTAUTH_URL or VERCEL_URL before localhost.
 */
export function getServerRuntimeBaseUrl() {
  const configuredBaseUrl = parseRuntimeBaseUrl(process.env.NEXT_PUBLIC_BASE_URL);
  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  const authBaseUrl = parseRuntimeBaseUrl(process.env.NEXTAUTH_URL);
  if (authBaseUrl) {
    return authBaseUrl;
  }

  const vercelUrl = parseRuntimeBaseUrl(process.env.VERCEL_URL);
  if (vercelUrl) {
    return vercelUrl;
  }

  return "http://localhost:3000";
}

/**
 * Canonical runtime origin used by server-only redirects and internal callbacks.
 * Keep this origin server-derived so untrusted request host headers never become
 * the authority for admin actions or verification-link callback construction.
 */
export function getServerRuntimeOrigin() {
  return new URL(getServerRuntimeBaseUrl()).origin;
}

/**
 * Best-effort request URL parsing that survives relative request.url values in
 * certain server/runtime execution paths by anchoring parsing to the canonical
 * server runtime base URL.
 */
export function resolveRequestUrlWithServerBase(request: Pick<Request, "url">) {
  const baseUrl = getServerRuntimeBaseUrl();

  try {
    return new URL(request.url, baseUrl);
  } catch {
    return new URL(baseUrl);
  }
}
