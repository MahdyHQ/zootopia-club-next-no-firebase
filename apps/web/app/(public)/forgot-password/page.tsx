import { redirect } from "next/navigation";

import { AuthTopControls } from "@/components/auth/auth-top-controls";
import { ForgotPasswordPanel } from "@/components/auth/forgot-password-panel";
import { PublicAuthShell } from "@/components/auth/public-auth-shell";
import { getAuthenticatedUserRedirectPath } from "@/lib/return-to";
import { getRequestUiContext } from "@/lib/server/request-context";
import { getRuntimeFlags } from "@/lib/server/runtime";
import { getAuthenticatedSessionUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

type SearchParamValue = string | string[] | undefined;

type ForgotPasswordPageProps = {
  searchParams: Promise<Record<string, SearchParamValue>>;
};

function buildLocalText(locale: "en" | "ar") {
  if (locale === "ar") {
    return {
      eyebrow: "استعادة كلمة المرور",
      title: "إرسال رابط إعادة تعيين كلمة المرور",
      subtitle:
        "استخدم نفس البريد المسجل في حسابك. سنرسل رابط إعادة التعيين إذا كان الحساب مؤهلاً.",
    };
  }

  return {
    eyebrow: "Password recovery",
    title: "Send a secure password reset link",
    subtitle:
      "Use the same email tied to your account. We will issue a reset email if the account is eligible.",
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

export default async function ForgotPasswordPage({
  searchParams,
}: ForgotPasswordPageProps) {
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
  const initialEmail = getFirstSearchParamValue(resolvedSearchParams.email).trim().slice(0, 320);

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
        <ForgotPasswordPanel
          locale={uiContext.locale}
          supabaseAuthReady={runtimeFlags.supabaseAuth}
          initialEmail={initialEmail}
        />
      </div>
    </PublicAuthShell>
  );
}
