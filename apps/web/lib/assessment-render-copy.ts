import type { AssessmentQuestionType, Locale } from "@zootopia/shared-types";

export function localizeAssessmentCopy(locale: Locale, en: string, ar: string) {
  return locale === "ar" ? ar : en;
}

export function getTypeAwareAnswerLabel(input: {
  locale: Locale;
  questionType: AssessmentQuestionType | null | undefined;
  fallback: string;
}) {
  switch (input.questionType) {
    case "essay":
      return localizeAssessmentCopy(
        input.locale,
        "Model answer / guidance",
        "إرشاد الإجابة المقالية",
      );
    case "short_answer":
      return localizeAssessmentCopy(
        input.locale,
        "Expected short answer",
        "الإجابة القصيرة المتوقعة",
      );
    case "matching":
      return localizeAssessmentCopy(
        input.locale,
        "Correct matching",
        "التوصيل الصحيح",
      );
    case "multiple_response":
      return localizeAssessmentCopy(
        input.locale,
        "Correct options",
        "الخيارات الصحيحة",
      );
    case "terminology":
      return localizeAssessmentCopy(
        input.locale,
        "Expected term",
        "المصطلح المتوقع",
      );
    case "definition":
      return localizeAssessmentCopy(
        input.locale,
        "Expected definition",
        "التعريف المتوقع",
      );
    case "comparison":
      return localizeAssessmentCopy(
        input.locale,
        "Comparison guidance",
        "إرشاد المقارنة",
      );
    case "labeling":
      return localizeAssessmentCopy(
        input.locale,
        "Labeling key",
        "مفتاح التسمية",
      );
    case "classification":
      return localizeAssessmentCopy(
        input.locale,
        "Classification key",
        "مفتاح التصنيف",
      );
    case "sequencing":
      return localizeAssessmentCopy(
        input.locale,
        "Expected sequence",
        "التسلسل المتوقع",
      );
    case "process_mechanism":
      return localizeAssessmentCopy(
        input.locale,
        "Mechanism guidance",
        "إرشاد الآلية",
      );
    case "cause_effect":
      return localizeAssessmentCopy(
        input.locale,
        "Cause-effect mapping",
        "خريطة السبب والنتيجة",
      );
    case "distinguish_between":
      return localizeAssessmentCopy(
        input.locale,
        "Distinguishing points",
        "نقاط التمييز",
      );
    case "identify_structure":
      return localizeAssessmentCopy(
        input.locale,
        "Structure identification",
        "تحديد البنية",
      );
    case "identify_compound":
      return localizeAssessmentCopy(
        input.locale,
        "Compound identification",
        "تحديد المركب",
      );
    default:
      return input.fallback;
  }
}

export function getAssessmentAnswerMissingPlaceholder(locale: Locale) {
  return localizeAssessmentCopy(
    locale,
    "Answer not provided",
    "الإجابة غير متوفرة",
  );
}

export function getAssessmentPromptMissingPlaceholder(locale: Locale) {
  return localizeAssessmentCopy(
    locale,
    "Question prompt unavailable",
    "نص السؤال غير متوفر",
  );
}
