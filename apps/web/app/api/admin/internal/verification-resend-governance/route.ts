import { apiError, apiSuccess, applyNoStore } from "@/lib/server/api";
import { getAdminSessionUser } from "@/lib/server/session";
import {
  clearVerificationResendAccountGovernanceByEmail,
  isValidVerificationResendEmail,
  normalizeVerificationResendEmail,
  readVerificationResendAccountGovernanceByEmail,
} from "@/lib/server/verification-resend-governance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Admin-only operational endpoint for inspecting and clearing
 * verification resend governance state for a specific email.
 * This route must remain backend-only and admin-restricted.
 */
function readTargetEmailFromRequest(request: Request) {
  const url = new URL(request.url);

  const normalizedEmail =
    url.searchParams
      .getAll("email")
      .map((value) => normalizeVerificationResendEmail(value))
      .find((value): value is string => Boolean(value)) ?? null;

  if (!normalizedEmail || !isValidVerificationResendEmail(normalizedEmail)) {
    return null;
  }

  return normalizedEmail;
}

async function requireAdminAndTargetEmail(request: Request) {
  const user = await getAdminSessionUser();
  if (!user) {
    return {
      error: applyNoStore(apiError("FORBIDDEN", "Admin access is required.", 403)),
    };
  }

  const email = readTargetEmailFromRequest(request);
  if (!email) {
    return {
      error: applyNoStore(
        apiError(
          "VERIFICATION_RESEND_INVALID_EMAIL",
          "A valid account email query parameter is required.",
          400,
        ),
      ),
    };
  }

  return { user, email };
}

export async function GET(request: Request) {
  const context = await requireAdminAndTargetEmail(request);
  if ("error" in context) {
    return context.error;
  }

  const { user, email } = context;

  try {
    const snapshot = await readVerificationResendAccountGovernanceByEmail({ email });

    console.info("[admin-verification-resend-governance] read", {
      adminUid: user.uid,
      email,
      hasAccountRecord: Boolean(snapshot.accountRecord),
      mode: snapshot.mode,
    });

    return applyNoStore(
      apiSuccess({
        email,
        mode: snapshot.mode,
        accountKeyHash: snapshot.accountKeyHash,
        accountRecord: snapshot.accountRecord,
      }),
    );
  } catch (error) {
    console.error("[admin-verification-resend-governance] read failed", {
      adminUid: user.uid,
      email,
      error,
    });

    return applyNoStore(
      apiError(
        "VERIFICATION_RESEND_UNAVAILABLE",
        "Verification resend governance store is unavailable.",
        503,
      ),
    );
  }
}

export async function DELETE(request: Request) {
  const context = await requireAdminAndTargetEmail(request);
  if ("error" in context) {
    return context.error;
  }

  const { user, email } = context;

  try {
    const before = await readVerificationResendAccountGovernanceByEmail({ email });
    const clearResult = await clearVerificationResendAccountGovernanceByEmail({ email });
    const after = await readVerificationResendAccountGovernanceByEmail({ email });

    console.info("[admin-verification-resend-governance] cleared", {
      adminUid: user.uid,
      email,
      existedBefore: Boolean(before.accountRecord),
      cleared: clearResult.deleted,
      mode: clearResult.mode,
    });

    return applyNoStore(
      apiSuccess({
        email,
        mode: clearResult.mode,
        accountKeyHash: clearResult.accountKeyHash,
        existedBefore: Boolean(before.accountRecord),
        cleared: clearResult.deleted,
        accountRecord: after.accountRecord,
      }),
    );
  } catch (error) {
    console.error("[admin-verification-resend-governance] clear failed", {
      adminUid: user.uid,
      email,
      error,
    });

    return applyNoStore(
      apiError(
        "VERIFICATION_RESEND_UNAVAILABLE",
        "Verification resend governance store is unavailable.",
        503,
      ),
    );
  }
}