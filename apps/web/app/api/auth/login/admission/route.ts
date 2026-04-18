import { APP_ROUTES } from "@zootopia/shared-config";

import { apiError, apiSuccess, applyNoStore } from "@/lib/server/api";
import {
  buildActiveNormalUserCapacityFullMessage,
  evaluateActiveNormalUserAdmissionByEmail,
  readActiveNormalUserCapacitySnapshot,
  type ActiveNormalUserCapacitySnapshot,
} from "@/lib/server/active-normal-user-session-governance";
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
const LOGIN_CAPACITY_UNAVAILABLE_MESSAGE =
  "Secure login admission is temporarily unavailable. Please wait a moment and try again.";
const CAPACITY_RETRY_AFTER_SECONDS = 15;

const ACTIVE_NORMAL_USERS_HEADER = "X-Zootopia-Active-Normal-Users";
const ACTIVE_NORMAL_USERS_LIMIT_HEADER = "X-Zootopia-Active-Normal-User-Limit";
const ACTIVE_NORMAL_USERS_SESSION_MINUTES_HEADER = "X-Zootopia-Active-Normal-User-Session-Minutes";
const ACTIVE_NORMAL_USERS_AVAILABLE_SLOTS_HEADER = "X-Zootopia-Active-Normal-User-Available-Slots";

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

function withCapacityHeaders(response: Response, snapshot: ActiveNormalUserCapacitySnapshot) {
  response.headers.set(ACTIVE_NORMAL_USERS_HEADER, String(snapshot.activeNormalUsers));
  response.headers.set(ACTIVE_NORMAL_USERS_LIMIT_HEADER, String(snapshot.maxActiveNormalUsers));
  response.headers.set(ACTIVE_NORMAL_USERS_SESSION_MINUTES_HEADER, String(snapshot.sessionMinutes));
  response.headers.set(ACTIVE_NORMAL_USERS_AVAILABLE_SLOTS_HEADER, String(snapshot.availableSlots));
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawEmail = url.searchParams.get("email");
  const email = normalizeEmail(rawEmail);

  if (rawEmail !== null && (!email || !isValidEmail(email))) {
    return applyNoStore(
      apiError(
        "LOGIN_EMAIL_INVALID",
        "A valid account email is required when requesting email-scoped capacity status.",
        400,
      ),
    );
  }

  try {
    if (email) {
      const capacity = await evaluateActiveNormalUserAdmissionByEmail({ email });
      return withCapacityHeaders(
        applyNoStore(
          apiSuccess({
            allowed: capacity.allowed,
            exempt: capacity.exempt,
            reason: capacity.reason,
            capacity: capacity.snapshot,
          }),
        ),
        capacity.snapshot,
      );
    }

    const snapshot = await readActiveNormalUserCapacitySnapshot();
    return withCapacityHeaders(
      applyNoStore(
        apiSuccess({
          allowed: !snapshot.isFull,
          exempt: false,
          reason: snapshot.isFull ? "CAPACITY_FULL" : "CAPACITY_AVAILABLE",
          capacity: snapshot,
        }),
      ),
      snapshot,
    );
  } catch (error) {
    console.error("[auth-login-admission] failed to read active-user capacity status", {
      routePath: APP_ROUTES.login,
      error,
    });

    const failure = applyNoStore(
      apiError(
        "AUTH_ACTIVE_USER_ADMISSION_UNAVAILABLE",
        LOGIN_CAPACITY_UNAVAILABLE_MESSAGE,
        503,
      ),
    );
    failure.headers.set("Retry-After", String(CAPACITY_RETRY_AFTER_SECONDS));
    return failure;
  }
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
    const capacityDecision = await evaluateActiveNormalUserAdmissionByEmail({
      email,
    });

    if (!capacityDecision.allowed) {
      const failure = withCapacityHeaders(
        applyNoStore(
          apiError(
            "AUTH_ACTIVE_USER_CAPACITY_FULL",
            buildActiveNormalUserCapacityFullMessage(capacityDecision.snapshot),
            429,
          ),
        ),
        capacityDecision.snapshot,
      );
      failure.headers.set("Retry-After", String(CAPACITY_RETRY_AFTER_SECONDS));
      return failure;
    }

    /* Login admission owns the public pacing/throttle edge, but exempt/admin identities must
       bypass that generic admission store before any blocking result is returned for `/login`.
       Keep this early return here so temporary auth-admission degradation never re-gates
       identities that the decisive Auth.js/session capacity layer already treats as exempt. */
    if (capacityDecision.exempt) {
      return withCapacityHeaders(
        applyNoStore(
          apiSuccess({
            accepted: true,
            capacity: capacityDecision,
          }),
        ),
        capacityDecision.snapshot,
      );
    }

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
      withCapacityHeaders(
        applyNoStore(
          apiSuccess({
            accepted: true,
            admission,
            capacity: capacityDecision,
          }),
        ),
        capacityDecision.snapshot,
      ),
      admission,
    );
  } catch (error) {
    console.error("[auth-login-admission] failed to reserve admission capacity", {
      routePath: APP_ROUTES.login,
      error,
    });

    const failure = applyNoStore(
      apiError(
        "AUTH_ACTIVE_USER_ADMISSION_UNAVAILABLE",
        LOGIN_CAPACITY_UNAVAILABLE_MESSAGE,
        503,
      ),
    );
    failure.headers.set("Retry-After", String(CAPACITY_RETRY_AFTER_SECONDS));
    return failure;
  }
}
