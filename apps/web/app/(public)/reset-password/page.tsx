import { redirect } from "next/navigation";

import { AuthTopControls } from "@/components/auth/auth-top-controls";
import {
  ResetPasswordPanel,
  type ResetPasswordInitialFinalizeParams,
} from "@/components/auth/reset-password-panel";
import { PublicAuthShell } from "@/components/auth/public-auth-shell";
import { getAuthenticatedUserRedirectPath } from "@/lib/return-to";
import { getRequestUiContext } from "@/lib/server/request-context";
import { getRuntimeFlags } from "@/lib/server/runtime";
import { getAuthenticatedSessionUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

type SearchParamValue = string | string[] | undefined;

type ResetPasswordPageProps = {
  searchParams: Promise<Record<string, SearchParamValue>>;
};

function buildLocalText(locale: "en" | "ar") {
  if (locale === "ar") {
    return {
      eyebrow: "إعادة تعيين كلمة المرور",
      title: "تعيين كلمة مرور جديدة بأمان",
      subtitle:
        "نتحقق من رابط الاستعادة أولاً، ثم نسمح لك بتحديث كلمة المرور عبر المسار الآمن.",
    };
  }

  return {
    eyebrow: "Password reset",
    title: "Set a new password securely",
    subtitle:
      "We validate your recovery callback first, then allow a policy-safe password update.",
  };
}

function getFirstSearchParamValue(value: SearchParamValue) {
  if (typeof value === "string") {
    return value;
  }

  if (!Array.isArray(value)) {
    return "";
  }

  for (const candidate of value) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate;
    }
  }

  return value[0] ?? "";
}

function resolveFinalizeParams(
  searchParams: Record<string, SearchParamValue>,
): ResetPasswordInitialFinalizeParams {
  return {
    authCode: getFirstSearchParamValue(searchParams.code).trim().slice(0, 1024),
    tokenHash: getFirstSearchParamValue(searchParams.token_hash).trim().slice(0, 1024),
    verificationType: getFirstSearchParamValue(searchParams.type).trim().slice(0, 128),
    errorCode:
      getFirstSearchParamValue(searchParams.error_code).trim().slice(0, 128)
      || getFirstSearchParamValue(searchParams.error).trim().slice(0, 128),
    errorDescription: getFirstSearchParamValue(searchParams.error_description).trim().slice(0, 640),
    accessToken: getFirstSearchParamValue(searchParams.access_token).trim().slice(0, 4096),
    refreshToken: getFirstSearchParamValue(searchParams.refresh_token).trim().slice(0, 4096),
  };
}

export default async function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps) {
  const [resolvedSearchParams, user, uiContext] = await Promise.all([
    searchParams,
    getAuthenticatedSessionUser(),
    getRequestUiContext(),
  ]);

  if (user) {
    redirect(getAuthenticatedUserRedirectPath(user));
  }

  const runtimeFlags = getRuntimeFlags();
  const localText = buildLocalText(uiContext.locale);
  const initialFinalize = resolveFinalizeParams(resolvedSearchParams);

  return (
    <PublicAuthShell
      eyebrow={localText.eyebrow}
      title={localText.title}
      subtitle={localText.subtitle}
      imageAlt={uiContext.messages.loginTitle}
      controls={
        <AuthTopControls
          themeMode={uiContext.themeMode}
          locale={uiContext.locale}
          themeLabel={uiContext.messages.themeLabel}
          themeLabels={{
            light: uiContext.messages.themeLight,
            dark: uiContext.messages.themeDark,
            system: uiContext.messages.themeSystem,
          }}
          localeLabel={uiContext.messages.localeLabel}
          localeLabels={{
            en: uiContext.messages.localeEnglish,
            ar: uiContext.messages.localeArabic,
          }}
        />
      }
    >
      <div className="flex min-w-0 items-center justify-center">
        <ResetPasswordPanel
          locale={uiContext.locale}
          supabaseAuthReady={runtimeFlags.supabaseAuth}
          initialFinalize={initialFinalize}
        />
      </div>
    </PublicAuthShell>
  );
}
