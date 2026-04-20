import { createClient } from "@supabase/supabase-js";
import { APP_ROUTES } from "@zootopia/shared-config";

import { normalizeAuthFailure } from "@/lib/auth-failure";
import { validateUserPasswordPolicy } from "@/lib/password-policy";
import { apiError, apiSuccess, applyNoStore } from "@/lib/server/api";
import {
  getAuthAdmissionConfig,
  rollbackAuthAdmissionAttempt,
  reserveAuthAdmissionAttempt,
  type AuthAdmissionSnapshot,
} from "@/lib/server/auth-admission-governance";
import { getServerRuntimeOrigin } from "@/lib/server/runtime-base-url";
import {
  findSupabaseAuthUserByEmail,
  hasSupabaseAdminRuntime,
} from "@/lib/server/supabase-admin";
import {
  getSupabasePublishableKey,
  getSupabaseUrl,
} from "@/lib/supabase/public-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type SignupRequestBody = {
  email?: unknown;
  password?: unknown;
};

type SignupSuccessPayload = {
  accepted: true;
  email: string;
  requiresEmailConfirmation: boolean;
  confirmRoute: string;
  accessToken: string | null;
  refreshToken: string | null;
};

const AUTH_ADMISSION_CONFIG = getAuthAdmissionConfig();

function buildAdmissionDelayMessage(windowSeconds: number) {
  const minutes = Math.max(1, Math.ceil(windowSeconds / 60));
  const minuteLabel = minutes === 1 ? "minute" : "minutes";
  return "We’re organizing sign-up requests to reduce pressure. "
    + `Please try again in about ${minutes} ${minuteLabel}.`;
}

const SIGNUP_ADMISSION_DELAY_MESSAGE = buildAdmissionDelayMessage(
  AUTH_ADMISSION_CONFIG.windowSeconds,
);

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizePassword(value: unknown) {
  return typeof value === "string" ? value : "";
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function createSignupSupabaseClient() {
  const supabaseUrl = getSupabaseUrl();
  const supabasePublishableKey = getSupabasePublishableKey();

  if (!supabaseUrl || !supabasePublishableKey) {
    return null;
  }

  return createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function isSupabaseEmailConfirmed(user: unknown) {
  if (!user || typeof user !== "object") {
    return false;
  }

  const userRecord = user as Record<string, unknown>;
  return typeof userRecord.email_confirmed_at === "string" && userRecord.email_confirmed_at.length > 0;
}

function isDuplicateSignupFailure(error: { code?: string | null; message?: string | null }) {
  const code = String(error.code ?? "").trim().toLowerCase();
  const message = String(error.message ?? "").trim().toLowerCase();

  return (
    code.includes("already")
    || code.includes("exists")
    || message.includes("already registered")
    || message.includes("already exists")
    || message.includes("already been registered")
  );
}

function buildConfirmEmailRoute(email: string) {
  const params = new URLSearchParams();
  params.set("email", email);
  params.set("flow", "sign_up");
  params.set("from", APP_ROUTES.login);
  return `${APP_ROUTES.confirmEmail}?${params.toString()}`;
}

function isSupabaseObfuscatedExistingSignupResult(user: unknown) {
  if (!user || typeof user !== "object") {
    return false;
  }

  const userRecord = user as Record<string, unknown>;
  const identities = Array.isArray(userRecord.identities) ? userRecord.identities : [];
  if (identities.length > 0) {
    return false;
  }

  /* Supabase docs note that `signUp()` may return an obfuscated/fake user object
     for existing confirmed accounts (anti-enumeration behavior). Those payloads do
     not include real linked identities, so treat them as duplicate-account truth. */
  return true;
}

function buildExistingEmailSignupFailure(input: {
  emailVerified: boolean;
}) {
  if (!input.emailVerified) {
    return apiError(
      "AUTH_EMAIL_NOT_CONFIRMED",
      "This email is already registered, but confirmation is still pending. Open the confirmation page to verify the account before signing in.",
      409,
    );
  }

  return apiError(
    "AUTH_ACCOUNT_ALREADY_EXISTS",
    "An account with this email already exists. Sign in instead, or finish email confirmation if it is still pending.",
    409,
  );
}

function buildConfirmationRedirectUrl(email: string) {
  /* Signup email links must stay server-owned so host-header drift cannot move
     verification callbacks onto the wrong origin or preview hostname. */
  const redirectUrl = new URL(APP_ROUTES.confirmEmail, getServerRuntimeOrigin());
  redirectUrl.searchParams.set("flow", "sign_up");
  redirectUrl.searchParams.set("from", APP_ROUTES.login);
  redirectUrl.searchParams.set("email", email);
  return redirectUrl.toString();
}

function withAdmissionHeaders(response: Response, snapshot: AuthAdmissionSnapshot) {
  response.headers.set("X-Auth-Admission-Code", snapshot.governanceCode);
  response.headers.set("X-Auth-Admission-Account-Remaining", String(snapshot.account.remainingAttempts));
  response.headers.set("X-Auth-Admission-Ip-Remaining", String(snapshot.ip.remainingAttempts));

  if (snapshot.retryAfterSeconds !== null) {
    response.headers.set("Retry-After", String(snapshot.retryAfterSeconds));
  }

  if (snapshot.nextAllowedAt) {
    const resetAtMs = Date.parse(snapshot.nextAllowedAt);
    if (Number.isFinite(resetAtMs)) {
      response.headers.set("X-RateLimit-Reset", String(Math.ceil(resetAtMs / 1000)));
    }
  }

  return response;
}

async function rollbackSignupAdmissionReservation(input: {
  request: Request;
  email: string;
  admission: AuthAdmissionSnapshot;
}) {
  if (input.admission.reservationAccepted !== true) {
    return input.admission;
  }

  try {
    return await rollbackAuthAdmissionAttempt({
      request: input.request,
      email: input.email,
      kind: "sign_up",
    });
  } catch (error) {
    console.warn("[auth-signup] failed to roll back admission reservation", {
      routePath: APP_ROUTES.login,
      error,
    });
    return input.admission;
  }
}

export async function POST(request: Request) {
  let body: SignupRequestBody;

  try {
    body = (await request.json()) as SignupRequestBody;
  } catch {
    return applyNoStore(
      apiError("INVALID_JSON", "Request body must be valid JSON.", 400),
    );
  }

  const email = normalizeEmail(body.email);
  const password = normalizePassword(body.password);

  if (!email || !isValidEmail(email)) {
    return applyNoStore(
      apiError("SIGNUP_EMAIL_INVALID", "A valid account email is required to create an account.", 400),
    );
  }

  if (!password) {
    return applyNoStore(
      apiError("SIGNUP_PASSWORD_REQUIRED", "A password is required to create an account.", 400),
    );
  }

  const passwordPolicy = validateUserPasswordPolicy({
    password,
    email,
  });
  if (!passwordPolicy.ok) {
    return applyNoStore(
      apiError("PASSWORD_POLICY_FAILED", passwordPolicy.error, 400, {
        password: passwordPolicy.error,
      }),
    );
  }

  let admission: AuthAdmissionSnapshot;
  try {
    admission = await reserveAuthAdmissionAttempt({
      request,
      email,
      kind: "sign_up",
    });
  } catch (error) {
    console.error("[auth-signup] failed to reserve admission capacity", {
      routePath: APP_ROUTES.login,
      error,
    });

    const failure = applyNoStore(
      apiError("AUTH_RATE_LIMITED", SIGNUP_ADMISSION_DELAY_MESSAGE, 503),
    );
    failure.headers.set("Retry-After", String(AUTH_ADMISSION_CONFIG.windowSeconds));
    return failure;
  }

  if (!admission.allowed && admission.reservationAccepted !== true) {
    return withAdmissionHeaders(
      applyNoStore(
        apiError("AUTH_RATE_LIMITED", SIGNUP_ADMISSION_DELAY_MESSAGE, 429),
      ),
      admission,
    );
  }

  const supabase = createSignupSupabaseClient();
  if (!supabase) {
    const rolledBackAdmission = await rollbackSignupAdmissionReservation({
      request,
      email,
      admission,
    });

    return withAdmissionHeaders(
      applyNoStore(
        apiError(
          "AUTH_ENV_MISCONFIGURED",
          "Secure sign-up is not available in this environment right now.",
          503,
        ),
      ),
      rolledBackAdmission,
    );
  }

  if (hasSupabaseAdminRuntime()) {
    try {
      /* Duplicate-email prevention must be backend/provider authoritative.
         Check current provider truth before signUp so existing addresses fail fast
         with clear UX rather than ambiguous anti-enumeration success payloads. */
      const existingAuthUser = await findSupabaseAuthUserByEmail(email);
      if (existingAuthUser) {
        const rolledBackAdmission = await rollbackSignupAdmissionReservation({
          request,
          email,
          admission,
        });

        return withAdmissionHeaders(
          applyNoStore(
            buildExistingEmailSignupFailure({
              emailVerified: Boolean(existingAuthUser.emailVerified),
            }),
          ),
          rolledBackAdmission,
        );
      }
    } catch (error) {
      const rolledBackAdmission = await rollbackSignupAdmissionReservation({
        request,
        email,
        admission,
      });

      console.error("[auth-signup] duplicate-email provider preflight failed", {
        routePath: APP_ROUTES.login,
        error,
      });

      return withAdmissionHeaders(
        applyNoStore(
          apiError(
            "AUTH_PROVIDER_MISCONFIGURED",
            "Secure sign-up could not be completed right now.",
            503,
          ),
        ),
        rolledBackAdmission,
      );
    }
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: buildConfirmationRedirectUrl(email),
    },
  });

  if (error) {
    const rolledBackAdmission = await rollbackSignupAdmissionReservation({
      request,
      email,
      admission,
    });

    if (isDuplicateSignupFailure(error)) {
      return withAdmissionHeaders(
        applyNoStore(
          buildExistingEmailSignupFailure({
            emailVerified: true,
          }),
        ),
        rolledBackAdmission,
      );
    }

    const failure = normalizeAuthFailure({
      error,
      flow: "user",
      stage: "AUTH_STAGE_C_PROVIDER_RESPONSE",
      routePath: APP_ROUTES.login,
      sessionCreationAttempted: false,
    });

    const status =
      failure.normalizedCode === "AUTH_RATE_LIMITED"
        ? 429
        : failure.normalizedCode === "AUTH_NETWORK_FAILURE"
          ? 502
          : failure.normalizedCode === "AUTH_ENV_MISCONFIGURED"
            || failure.normalizedCode === "AUTH_PROVIDER_MISCONFIGURED"
            ? 503
            : 502;

    const message =
      failure.normalizedCode === "AUTH_RATE_LIMITED"
        ? SIGNUP_ADMISSION_DELAY_MESSAGE
        : failure.safeProviderMessage
          ?? "Secure sign-up could not be completed right now.";

    return withAdmissionHeaders(
      applyNoStore(
        apiError(failure.normalizedCode, message, status),
      ),
      rolledBackAdmission,
    );
  }

  if (isSupabaseObfuscatedExistingSignupResult(data.user)) {
    const rolledBackAdmission = await rollbackSignupAdmissionReservation({
      request,
      email,
      admission,
    });

    return withAdmissionHeaders(
      applyNoStore(
        buildExistingEmailSignupFailure({
          emailVerified: true,
        }),
      ),
      rolledBackAdmission,
    );
  }

  const accessToken = data.session?.access_token?.trim() || null;
  const refreshToken = data.session?.refresh_token?.trim() || null;
  const requiresEmailConfirmation = !isSupabaseEmailConfirmed(data.user) || !accessToken || !refreshToken;

  const payload: SignupSuccessPayload = {
    accepted: true,
    email,
    requiresEmailConfirmation,
    confirmRoute: buildConfirmEmailRoute(email),
    accessToken,
    refreshToken,
  };

  return withAdmissionHeaders(
    applyNoStore(apiSuccess(payload)),
    admission,
  );
}
