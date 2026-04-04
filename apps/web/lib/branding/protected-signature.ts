import type { Locale } from "@zootopia/shared-types";

export const PROTECTED_SIGNATURE_TEXT =
  "تم برمجة وتطوير وتمويل هذه المنصة بواسطة ابن عبدالله يوسف دفعة 2022 قسم كيمياء حيوان";

export const PROTECTED_SIGNATURE_LAPTOP = "💻";
export const PROTECTED_SIGNATURE_HEART = "❤️";

export function getProtectedSignatureCopy(locale: Locale) {
  return {
    label: locale === "ar" ? "ختم المنصة" : "Platform Seal",
    text: PROTECTED_SIGNATURE_TEXT,
    composedLine: `${PROTECTED_SIGNATURE_LAPTOP} ${PROTECTED_SIGNATURE_TEXT} ${PROTECTED_SIGNATURE_HEART}`,
  };
}
