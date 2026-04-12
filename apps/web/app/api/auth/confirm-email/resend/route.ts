import { APP_ROUTES } from "@zootopia/shared-config";

import { normalizeAuthFailure } from "@/lib/auth-failure";
import { apiError, apiSuccess, applyNoStore } from "@/lib/server/api";
import {
  classifyAuthEmailDeliveryFailure,
  type AuthEmailDeliveryDiagnosticClass,
  type AuthEmailDeliveryDiagnosticConfidence,
} from "@/lib/server/auth-email-delivery-diagnostics";
import { hasSupabaseAdminRuntime, getSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { getServerRuntimeOrigin } from "@/lib/server/runtime-base-url";
import {
  getVerificationResendGovernanceConfig,
  isValidVerificationResendEmail,
  markVerificationResendProviderAccepted,
  normalizeVerificationResendEmail,
  readVerificationResendGovernanceSnapshot,
  reserveVerificationResendAttempt,
  type VerificationResendGovernanceSnapshot,
} from "@/lib/server/verification-resend-governance";
import { hasZootopiaPostgresPersistence } from "@/lib/server/zootopia-postgres-adapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParamValue = string | string[] | undefined;

type ResendRequestBody = {
  email?: unknown;
  flow?: unknown;
  fromRoute?: unknown;
};

type ConfirmEmailFlow = "sign_in" | "sign_up" | "admin";

function getFirstSearchParamValue(value: SearchParamValue) {
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] ?? "" : "";
}

function resolveFlow(value: unknown): ConfirmEmailFlow {
  if (value === "admin" || value === "sign_up" || value === "sign_in") {
    return value;
  }

  return "sign_in";
}

function resolveFromRoute(value: unknown, flow: ConfirmEmailFlow) {
  const fromRoute = String(value ?? "").trim();

  if (fromRoute === APP_ROUTES.login || fromRoute === APP_ROUTES.adminLogin) {
    return fromRoute;
  }

  return flow === "admin" ? APP_ROUTES.adminLogin : APP_ROUTES.login;
}

function withGovernanceHeaders(
  response: Response,
  governance: VerificationResendGovernanceSnapshot,
) {
  response.headers.set("X-Verification-Governance-Code", governance.governanceCode);
  response.headers.set(
    "X-Verification-Cooldown-Remaining",
    String(governance.cooldownRemainingSeconds),
  );
  response.headers.set(
    "X-Verification-Account-Remaining",
    String(governance.account.remainingAttempts),
  );
  response.headers.set(
    "X-Verification-Ip-Remaining",
    String(governance.ip.remainingAttempts),
  );

  if (governance.retryAfterSeconds !== null) {
    response.headers.set("Retry-After", String(governance.retryAfterSeconds));
  }

  if (governance.nextAllowedAt) {
    const resetAtMs = Date.parse(governance.nextAllowedAt);
    if (Number.isFinite(resetAtMs)) {
      response.headers.set("X-RateLimit-Reset", String(Math.ceil(resetAtMs / 1000)));
    }
  }

  return response;
}

function mapGovernanceRejection(governance: VerificationResendGovernanceSnapshot) {
  switch (governance.governanceCode) {
    case "VERIFICATION_RESEND_COOLDOWN_ACTIVE":
      return {
        code: "VERIFICATION_RESEND_COOLDOWN_ACTIVE",
        message: "Please wait for the resend cooldown before requesting another verification email.",
        status: 429,
      };
    case "VERIFICATION_RESEND_ACCOUNT_WINDOW_EXHAUSTED":
      return {
        code: "VERIFICATION_RESEND_ACCOUNT_WINDOW_EXHAUSTED",
        message: "This account reached the resend limit for the current verification window.",
        status: 429,
      };
    case "VERIFICATION_RESEND_IP_WINDOW_EXHAUSTED":
      return {
        code: "VERIFICATION_RESEND_IP_WINDOW_EXHAUSTED",
        message: "This network reached the resend limit for the current verification window.",
        status: 429,
      };
    case "VERIFICATION_RESEND_UNAVAILABLE":
      return {
        code: "VERIFICATION_RESEND_UNAVAILABLE",
        message: "Verification resend is not available in this environment right now.",
        status: 503,
      };
    default:
      return null;
  }
}

type ProviderFailureApiError = {
  code: string;
  message: string;
  status: number;
  retryAfterSeconds: number | null;
  diagnosticClass: AuthEmailDeliveryDiagnosticClass;
  diagnosticConfidence: AuthEmailDeliveryDiagnosticConfidence;
  providerCode: string | null;
  providerStatus: number | null;
  safeProviderMessage: string | null;
};

function mapProviderFailureToApiError(input: {
  error: unknown;
  flow: ConfirmEmailFlow;
}): ProviderFailureApiError {
  const diagnostic = classifyAuthEmailDeliveryFailure(input.error);

  const withDiagnostics = <T extends {
    code: string;
    message: string;
    status: number;
    retryAfterSeconds: number | null;
  }>(base: T): ProviderFailureApiError => ({
    ...base,
    diagnosticClass: diagnostic.diagnosticClass,
    diagnosticConfidence: diagnostic.confidence,
    providerCode: diagnostic.providerCode,
    providerStatus: diagnostic.providerStatus,
    safeProviderMessage: diagnostic.safeProviderMessage,
  });

  if (diagnostic.diagnosticClass === "provider_daily_quota_likely") {
    return withDiagnostics({
      code: "VERIFICATION_RESEND_PROVIDER_DAILY_LIMIT_LIKELY",
      message: "Verification provider likely reached a daily email quota. Please retry after the provider quota resets.",
      status: 429,
      retryAfterSeconds: null,
    });
  }

  if (diagnostic.diagnosticClass === "provider_monthly_quota_likely") {
    return withDiagnostics({
      code: "VERIFICATION_RESEND_PROVIDER_MONTHLY_LIMIT_LIKELY",
      message: "Verification provider likely reached a monthly email quota for this account.",
      status: 429,
      retryAfterSeconds: null,
    });
  }

  if (diagnostic.diagnosticClass === "provider_rate_limited") {
    return withDiagnostics({
      code: "VERIFICATION_RESEND_PROVIDER_RATE_LIMITED",
      message: "Verification provider rate limited this resend request. Please retry shortly.",
      status: 429,
      retryAfterSeconds: 60,
    });
  }

  if (diagnostic.diagnosticClass === "provider_sender_identity_unverified") {
    return withDiagnostics({
      code: "VERIFICATION_RESEND_PROVIDER_IDENTITY_UNVERIFIED",
      message: "Verification resend sender identity is not fully verified with the email provider.",
      status: 503,
      retryAfterSeconds: null,
    });
  }

  if (diagnostic.diagnosticClass === "provider_configuration_or_auth") {
    return withDiagnostics({
      code: "VERIFICATION_RESEND_UNAVAILABLE",
      message: "Verification resend provider is not configured correctly.",
      status: 503,
      retryAfterSeconds: null,
    });
  }

  if (diagnostic.diagnosticClass === "provider_network_or_timeout") {
    return withDiagnostics({
      code: "VERIFICATION_RESEND_PROVIDER_NETWORK_FAILURE",
      message: "Verification resend failed due to an upstream network issue.",
      status: 502,
      retryAfterSeconds: null,
    });
  }

  const normalized = normalizeAuthFailure({
    error: input.error,
    flow: input.flow === "admin" ? "admin" : "user",
    stage: "AUTH_STAGE_C_PROVIDER_RESPONSE",
    routePath: APP_ROUTES.confirmEmail,
    sessionCreationAttempted: false,
  });

  if (normalized.normalizedCode === "AUTH_RATE_LIMITED") {
    return withDiagnostics({
      code: "VERIFICATION_RESEND_PROVIDER_RATE_LIMITED",
      message: "Verification provider rate limited this resend request. Please retry shortly.",
      status: 429,
      retryAfterSeconds: 60,
    });
  }

  if (normalized.normalizedCode === "AUTH_NETWORK_FAILURE") {
    return withDiagnostics({
      code: "VERIFICATION_RESEND_PROVIDER_NETWORK_FAILURE",
      message: "Verification resend failed due to an upstream network issue.",
      status: 502,
      retryAfterSeconds: null,
    });
  }

  if (
    normalized.normalizedCode === "AUTH_ENV_MISCONFIGURED"
    || normalized.normalizedCode === "AUTH_PROVIDER_MISCONFIGURED"
  ) {
    return withDiagnostics({
      code: "VERIFICATION_RESEND_UNAVAILABLE",
      message: "Verification resend provider is not configured correctly.",
      status: 503,
      retryAfterSeconds: null,
    });
  }

  return withDiagnostics({
    code: "VERIFICATION_RESEND_PROVIDER_REJECTED",
    message: "Verification provider rejected the resend request.",
    status: 502,
    retryAfterSeconds: null,
  });
}

function buildConfirmationRedirectUrl(input: {
  email: string;
  flow: ConfirmEmailFlow;
  fromRoute: string;
}) {
  /* Keep Supabase email callback links pinned to server-derived runtime origin instead of
     request-origin reconstruction, which can drift across proxies/previews and trigger
     provider-side "origin not allowed" rejections or host-header based open redirects. */
  const redirectUrl = new URL(APP_ROUTES.confirmEmail, getServerRuntimeOrigin());
  redirectUrl.searchParams.set("flow", input.flow);
  redirectUrl.searchParams.set("from", input.fromRoute);
  redirectUrl.searchParams.set("email", input.email);
  return redirectUrl.toString();
}

function ensureRuntimeOrModeDisabled() {
  const config = getVerificationResendGovernanceConfig();

  if (config.mode === "disabled") {
    return {
      ok: true,
      modeDisabled: true,
    } as const;
  }

  const runtimeReady = hasSupabaseAdminRuntime() && hasZootopiaPostgresPersistence();
  if (runtimeReady) {
    return {
      ok: true,
      modeDisabled: false,
    } as const;
  }

  return {
    ok: false,
    modeDisabled: false,
  } as const;
}

export async function GET(request: Request) {
  const runtimeState = ensureRuntimeOrModeDisabled();

  const url = new URL(request.url);
  const email = normalizeVerificationResendEmail(
    getFirstSearchParamValue(url.searchParams.getAll("email")[0]),
  );

  if (!email || !isValidVerificationResendEmail(email)) {
    return applyNoStore(
      apiError(
        "VERIFICATION_RESEND_INVALID_EMAIL",
        "A valid account email is required for verification resend status.",
        400,
      ),
    );
  }

  if (!runtimeState.ok) {
    return applyNoStore(
      apiError(
        "VERIFICATION_RESEND_UNAVAILABLE",
        "Verification resend governance runtime is unavailable.",
        503,
      ),
    );
  }

  try {
    const governance = await readVerificationResendGovernanceSnapshot({
      request,
      email,
    });

    return withGovernanceHeaders(
      applyNoStore(
        apiSuccess({
          governance,
        }),
      ),
      governance,
    );
  } catch (error) {
    console.error("[confirm-email-resend] failed to read governance snapshot", error);
    return applyNoStore(
      apiError(
        "VERIFICATION_RESEND_UNAVAILABLE",
        "Verification resend governance store is unavailable.",
        503,
      ),
    );
  }
}

export async function POST(request: Request) {
  const runtimeState = ensureRuntimeOrModeDisabled();
  if (!runtimeState.ok) {
    return applyNoStore(
      apiError(
        "VERIFICATION_RESEND_UNAVAILABLE",
        "Verification resend runtime is unavailable.",
        503,
      ),
    );
  }

  let body: ResendRequestBody;

  try {
    body = (await request.json()) as ResendRequestBody;
  } catch {
    return applyNoStore(apiError("INVALID_JSON", "Request body must be valid JSON.", 400));
  }

  const email = normalizeVerificationResendEmail(String(body.email ?? ""));
  if (!email || !isValidVerificationResendEmail(email)) {
    return applyNoStore(
      apiError(
        "VERIFICATION_RESEND_INVALID_EMAIL",
        "A valid account email is required to resend verification.",
        400,
      ),
    );
  }

  const flow = resolveFlow(body.flow);
  const fromRoute = resolveFromRoute(body.fromRoute, flow);

  let governance: VerificationResendGovernanceSnapshot;

  try {
    governance = await reserveVerificationResendAttempt({
      request,
      email,
    });
  } catch (error) {
    console.error("[confirm-email-resend] failed to reserve governance attempt", error);
    return applyNoStore(
      apiError(
        "VERIFICATION_RESEND_UNAVAILABLE",
        "Verification resend governance store is unavailable.",
        503,
      ),
    );
  }

  const governanceRejection = mapGovernanceRejection(governance);
  if (governanceRejection) {
    return withGovernanceHeaders(
      applyNoStore(
        apiError(
          governanceRejection.code,
          governanceRejection.message,
          governanceRejection.status,
        ),
      ),
      governance,
    );
  }

  const emailRedirectTo = buildConfirmationRedirectUrl({
    email,
    flow,
    fromRoute,
  });

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: {
      emailRedirectTo,
    },
  });

  if (error) {
    const providerFailure = mapProviderFailureToApiError({
      error,
      flow,
    });

    console.warn("[confirm-email-resend] provider rejected resend", {
      flow,
      code: providerFailure.code,
      status: providerFailure.status,
      diagnosticClass: providerFailure.diagnosticClass,
      diagnosticConfidence: providerFailure.diagnosticConfidence,
      providerCode: providerFailure.providerCode,
      providerStatus: providerFailure.providerStatus,
      providerMessage: providerFailure.safeProviderMessage,
    });

    const failure = applyNoStore(
      apiError(providerFailure.code, providerFailure.message, providerFailure.status),
    );

    // These response headers expose only safe, coarse diagnostics so frontend QA can
    // differentiate quota/config/network classes without leaking provider credentials.
    failure.headers.set("X-Verification-Provider-Diagnostic", providerFailure.diagnosticClass);
    failure.headers.set(
      "X-Verification-Provider-Diagnostic-Confidence",
      providerFailure.diagnosticConfidence,
    );

    if (providerFailure.retryAfterSeconds !== null) {
      failure.headers.set("Retry-After", String(providerFailure.retryAfterSeconds));
    }

    return withGovernanceHeaders(failure, governance);
  }

  await markVerificationResendProviderAccepted({ email }).catch((markError) => {
    console.warn("[confirm-email-resend] failed to mark provider-accepted resend", markError);
  });

  const refreshedGovernance = await readVerificationResendGovernanceSnapshot({
    request,
    email,
  }).catch(() => governance);

  return withGovernanceHeaders(
    applyNoStore(
      apiSuccess({
        accepted: true,
        providerAccepted: true,
        governance: refreshedGovernance,
      }),
    ),
    refreshedGovernance,
  );
}
