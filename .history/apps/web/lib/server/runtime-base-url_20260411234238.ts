import "server-only";

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

/**
 * Resolve the canonical server base URL used by admin server actions that call
 * internal API routes. This keeps Vercel deployments stable when NEXT_PUBLIC_BASE_URL
 * is unset by falling back to NEXTAUTH_URL or VERCEL_URL before localhost.
 */
export function getServerRuntimeBaseUrl() {
  const configuredBaseUrl = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (configuredBaseUrl) {
    return trimTrailingSlash(configuredBaseUrl);
  }

  const authBaseUrl = process.env.NEXTAUTH_URL?.trim();
  if (authBaseUrl) {
    return trimTrailingSlash(authBaseUrl);
  }

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) {
    const withProtocol = /^https?:\/\//i.test(vercelUrl)
      ? vercelUrl
      : `https://${vercelUrl}`;
    return trimTrailingSlash(withProtocol);
  }

  return "http://localhost:3000";
}
