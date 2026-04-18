import { APP_ROUTES } from "@zootopia/shared-config";

import { apiError, apiSuccess, applyNoStore } from "@/lib/server/api";
import {
  reserveAuthAdmissionAttempt,
  type AuthAdmissionSnapshot,
} from "@/lib/server/auth-admission-governance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type LoginAdmissionRequestBody = {
  email?: unknown;
};

const LOGIN_ADMISSION_DELAY_MESSAGE =
  "We’re organizing login requests to reduce pressure. Please try again in about 15 minutes.";

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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

export async function POST(request: Request) {
  let body: LoginAdmissionRequestBody;

  try {
    body = (await request.json()) as LoginAdmissionRequestBody;
  } catch {
    return applyNoStore(
      apiError("INVALID_JSON", "Request body must be valid JSON.", 400),
    );
  }

  const email = normalizeEmail(body.email);
  if (!email || !isValidEmail(email)) {
    return applyNoStore(
      apiError(
        "LOGIN_EMAIL_INVALID",
        "A valid account email is required before login can continue.",
        400,
      ),
    );
  }

  try {
    const admission = await reserveAuthAdmissionAttempt({
      request,
      email,
      kind: "sign_in",
    });

    if (!admission.allowed && admission.reservationAccepted !== true) {
      return withAdmissionHeaders(
        applyNoStore(
          apiError("AUTH_RATE_LIMITED", LOGIN_ADMISSION_DELAY_MESSAGE, 429),
        ),
        admission,
      );
    }

    return withAdmissionHeaders(
      applyNoStore(
        apiSuccess({
          accepted: true,
          admission,
        }),
      ),
      admission,
    );
  } catch (error) {
    console.error("[auth-login-admission] failed to reserve admission capacity", {
      routePath: APP_ROUTES.login,
      error,
    });

    const failure = applyNoStore(
      apiError("AUTH_RATE_LIMITED", LOGIN_ADMISSION_DELAY_MESSAGE, 503),
    );
    failure.headers.set("Retry-After", "900");
    return failure;
  }
}
