import type { SignInResponse } from "next-auth/react";

/**
 * Extracts the most specific credentials error code from an Auth.js `signIn`
 * result in `redirect: false` flows.
 *
 * Why this exists:
 * - Credentials providers may surface `code` directly.
 * - Some callback paths only encode error details on the `url` query string.
 * - Fallback to `error` keeps legacy behavior when no richer signal is present.
 */
export function readCredentialsSignInErrorCode(
  signInResult: SignInResponse,
): string | null {
  if (signInResult.code) {
    return signInResult.code;
  }

  if (typeof signInResult.url === "string") {
    try {
      const url = new URL(signInResult.url, window.location.origin);
      const callbackCode = url.searchParams.get("code") || url.searchParams.get("error");
      if (callbackCode) {
        return callbackCode;
      }
    } catch {
      // Ignore URL parsing issues and continue to the fallback error field.
    }
  }

  return signInResult.error || null;
}
