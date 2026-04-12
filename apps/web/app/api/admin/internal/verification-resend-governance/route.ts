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

function readTargetEmailFromRequest(request: Request) {
  const url = new URL(request.url);
  const normalizedEmail = normalizeVerificationResendEmail(url.searchParams.get("email") ?? "");

  if (!normalizedEmail || !isValidVerificationResendEmail(normalizedEmail)) {
    return null;
  }

  return normalizedEmail;
}

export async function GET(request: Request) {
  const user = await getAdminSessionUser();
  if (!user) {
    return applyNoStore(apiError("FORBIDDEN", "Admin access is required.", 403));
  }

  const email = readTargetEmailFromRequest(request);
  if (!email) {
    return applyNoStore(
      apiError(
        "VERIFICATION_RESEND_INVALID_EMAIL",
        "A valid account email query parameter is required.",
        400,
      ),
    );
  }

  try {
    const snapshot = await readVerificationResendAccountGovernanceByEmail({ email });

    /* Expose internal resend-governance state through an admin-only backend route so
       operational support can inspect throttling truth without relaxing browser table policies. */
    return applyNoStore(
      apiSuccess({
        email,
        mode: snapshot.mode,
        accountKeyHash: snapshot.accountKeyHash,
        accountRecord: snapshot.accountRecord,
      }),
    );
  } catch (error) {
    console.error("[admin-verification-resend-governance] read failed", error);
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
  const user = await getAdminSessionUser();
  if (!user) {
    return applyNoStore(apiError("FORBIDDEN", "Admin access is required.", 403));
  }

  const email = readTargetEmailFromRequest(request);
  if (!email) {
    return applyNoStore(
      apiError(
        "VERIFICATION_RESEND_INVALID_EMAIL",
        "A valid account email query parameter is required.",
        400,
      ),
    );
  }

  try {
    const before = await readVerificationResendAccountGovernanceByEmail({ email });
    const clearResult = await clearVerificationResendAccountGovernanceByEmail({ email });
    const after = await readVerificationResendAccountGovernanceByEmail({ email });

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
    console.error("[admin-verification-resend-governance] clear failed", error);
    return applyNoStore(
      apiError(
        "VERIFICATION_RESEND_UNAVAILABLE",
        "Verification resend governance store is unavailable.",
        503,
      ),
    );
  }
}