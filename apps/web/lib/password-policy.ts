import type { Locale } from "@zootopia/shared-types";
import type { UserPasswordPolicyFailureCode } from "@zootopia/shared-utils";

type PasswordPolicyCopy = {
  hint: string;
  errors: Record<UserPasswordPolicyFailureCode, string>;
};

const PASSWORD_POLICY_COPY: Record<"en" | "ar", PasswordPolicyCopy> = {
  en: {
    hint: "Use at least 12 characters. Longer passphrases are allowed.",
    errors: {
      PASSWORD_TOO_SHORT: "Password must be at least 12 characters long.",
      PASSWORD_EDGE_WHITESPACE: "Password cannot start or end with spaces.",
      PASSWORD_MISSING_LETTER: "Password must include at least one letter.",
      PASSWORD_COMPLEXITY_TOO_LOW:
        "Use a longer passphrase or add numbers, symbols, mixed case, or spaces between words.",
      PASSWORD_COMMON_PATTERN: "Password contains a common pattern. Choose a less predictable phrase.",
      PASSWORD_REPEATED_CHARACTERS: "Password cannot contain long repeated character runs.",
      PASSWORD_SEQUENTIAL_PATTERN: "Password cannot contain obvious alphabetical or numeric sequences.",
      PASSWORD_MATCHES_EMAIL: "Password must not match your email name.",
      PASSWORD_MATCHES_FULL_NAME: "Password must not match your full name.",
    },
  },
  ar: {
    hint: "استخدم 12 حرفاً على الأقل. العبارات الطويلة مسموح بها.",
    errors: {
      PASSWORD_TOO_SHORT: "يجب أن تكون كلمة المرور 12 حرفاً على الأقل.",
      PASSWORD_EDGE_WHITESPACE: "لا يمكن أن تبدأ كلمة المرور أو تنتهي بمسافات.",
      PASSWORD_MISSING_LETTER: "يجب أن تحتوي كلمة المرور على حرف واحد على الأقل.",
      PASSWORD_COMPLEXITY_TOO_LOW:
        "استخدم عبارة أطول أو أضف أرقاماً أو رموزاً أو أحرفاً كبيرة/صغيرة أو مسافات بين الكلمات.",
      PASSWORD_COMMON_PATTERN: "تتضمن كلمة المرور نمطاً شائعاً. اختر عبارة أقل توقعاً.",
      PASSWORD_REPEATED_CHARACTERS: "لا يمكن أن تحتوي كلمة المرور على تكرار طويل لنفس الحرف.",
      PASSWORD_SEQUENTIAL_PATTERN: "لا يمكن أن تحتوي كلمة المرور على تسلسلات واضحة للأحرف أو الأرقام.",
      PASSWORD_MATCHES_EMAIL: "يجب ألا تطابق كلمة المرور اسم بريدك الإلكتروني.",
      PASSWORD_MATCHES_FULL_NAME: "يجب ألا تطابق كلمة المرور اسمك الكامل.",
    },
  },
};

function resolvePolicyLocale(locale: Locale | "en" | "ar") {
  return locale === "ar" ? "ar" : "en";
}

export function getPasswordPolicyHint(locale: Locale | "en" | "ar") {
  return PASSWORD_POLICY_COPY[resolvePolicyLocale(locale)].hint;
}

export function getPasswordPolicyErrorMessage(input: {
  locale: Locale | "en" | "ar";
  code: UserPasswordPolicyFailureCode;
  fallback?: string;
}) {
  return PASSWORD_POLICY_COPY[resolvePolicyLocale(input.locale)].errors[input.code] || input.fallback || "Password policy validation failed.";
}
