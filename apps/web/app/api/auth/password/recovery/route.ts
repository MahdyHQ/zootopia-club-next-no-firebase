import { apiError, apiSuccess, applyNoStore } from "@/lib/server/api";
import { isAllowlistedAdminEmail } from "@/lib/server/admin-auth";
import { appendAdminLog, getUserByUid } from "@/lib/server/repository";
import { recordUserPasswordSecurityEvent } from "@/lib/server/password-security-events";
import { getServerAuthAdmin } from "@/lib/server/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type RecoveryAction = "validate" | "complete";

type RecoveryRequestBody = {
  action?: unknown;
  idToken?: unknown;
  sessionHardeningSucceeded?: unknown;
};

type VerifyIdToken = ReturnType<typeof getServerAuthAdmin>["verifyIdToken"];

function resolveAction(value: unknown): RecoveryAction | null {
  if (value === "validate" || value === "complete") {
    return value;
  }

  return null;
}

function normalizeToken(value: unknown) {
  return String(value ?? "").trim();
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : false;
}

export async function POST(request: Request) {
  let body: RecoveryRequestBody;

  try {
    body = (await request.json()) as RecoveryRequestBody;
  } catch {
    return applyNoStore(
      apiError("INVALID_JSON", "Request body must be valid JSON.", 400),
    );
  }

  const action = resolveAction(body.action);
  if (!action) {
    return applyNoStore(
      apiError("PASSWORD_RECOVERY_ACTION_REQUIRED", "Recovery action is required.", 400),
    );
  }

  const idToken = normalizeToken(body.idToken);
  if (!idToken) {
    return applyNoStore(
      apiError("PASSWORD_RECOVERY_ID_TOKEN_REQUIRED", "A Supabase access token is required.", 400),
    );
  }

  let decodedToken: Awaited<ReturnType<VerifyIdToken>>;

  try {
    decodedToken = await getServerAuthAdmin().verifyIdToken(idToken);
  } catch {
    return applyNoStore(
      apiError("PASSWORD_RECOVERY_INVALID_TOKEN", "Unable to verify this recovery session token.", 401),
    );
  }

  const email = typeof decodedToken.email === "string" ? decodedToken.email : null;
  const tokenRole = typeof decodedToken.role === "string" ? decodedToken.role : null;

  if (isAllowlistedAdminEmail(email) || tokenRole === "admin" || decodedToken.admin === true) {
    return applyNoStore(
      apiError(
        "ADMIN_PASSWORD_FLOW_UNSUPPORTED",
        "Admin accounts must use the dedicated admin authentication lane.",
        403,
      ),
    );
  }

  const persistedUser = await getUserByUid(decodedToken.uid).catch(() => null);
  if (persistedUser?.role === "admin") {
    return applyNoStore(
      apiError(
        "ADMIN_PASSWORD_FLOW_UNSUPPORTED",
        "Admin accounts must use the dedicated admin authentication lane.",
        403,
      ),
    );
  }

  const resolvedEmail = persistedUser?.email ?? email;
  if (!resolvedEmail) {
    return applyNoStore(
      apiError(
        "PASSWORD_RECOVERY_EMAIL_UNAVAILABLE",
        "Recovery token does not include an account email identity.",
        400,
      ),
    );
  }

  if (action === "validate") {
    return applyNoStore(
      apiSuccess({
        validated: true,
        user: {
          uid: decodedToken.uid,
          email: resolvedEmail,
        },
      }),
    );
  }

  const sessionHardeningSucceeded = readBoolean(body.sessionHardeningSucceeded);

  try {
    await recordUserPasswordSecurityEvent({
      request,
      uid: decodedToken.uid,
      eventType: "recovery_reset",
      eventSource: "recovery",
      sessionHardeningAttempted: true,
      sessionHardeningSucceeded,
    });

    await appendAdminLog({
      actorUid: decodedToken.uid,
      actorRole: "user",
      ownerUid: decodedToken.uid,
      ownerRole: "user",
      action: "user-password-reset-recovery-completed",
      resourceType: "session",
      resourceId: decodedToken.uid,
      route: "/api/auth/password/recovery",
      metadata: {
        sessionHardeningSucceeded,
      },
    });
  } catch {
    return applyNoStore(
      apiError(
        "PASSWORD_RECOVERY_COMPLETE_FAILED",
        "Password recovery metadata could not be persisted.",
        502,
      ),
    );
  }

  return applyNoStore(
    apiSuccess({
      completed: true,
      sessionHardeningSucceeded,
    }),
  );
}
