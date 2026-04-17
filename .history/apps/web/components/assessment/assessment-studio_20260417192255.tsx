"use client";

import { APP_ROUTES } from "@zootopia/shared-config";
import {
  ASSESSMENT_ACTIVE_QUESTION_TYPES,
  ASSESSMENT_MODES,
  type AiModelDescriptor,
  type ApiFailure,
  type ApiResult,
  type AssessmentCreateResponse,
  type AssessmentDailyCreditsSummary,
  type AssessmentDifficulty,
  type AssessmentGeneration,
  type AssessmentMode,
  type AssessmentPromptEntitlement,
  type AssessmentQuestionType,
  type AssessmentQuestionTypeDistribution,
  type AssessmentRequest,
  type DocumentRecord,
  type Locale,
} from "@zootopia/shared-types";
import {
  useQueryClient,
} from "@tanstack/react-query";
import {
  BrainCircuit,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  ExternalLink,
  FileText,
  Gauge,
  HandHeart,
  History,
  Languages,
  Layers3,
  LockKeyhole,
  Percent,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Timer,
} from "lucide-react";
import Link from "next/link";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";

import type { AppMessages } from "@/lib/messages";
import type { AssessmentUiLockConfig } from "@/lib/assessment-ui-lock-config";
import {
  buildAssessmentCreditClientSummarySnapshot,
  logAssessmentCreditClientDiagnostic,
} from "@/lib/assessment-credit-diagnostics";
import {
  formatAssessmentCreditCount,
  resolveAssessmentCreditDisplayModel,
  type AssessmentCreditDisplayModel,
} from "@/lib/assessment-credit-display";
import {
  invalidateAssessmentCreditSummaryQuery,
  useAssessmentCreditSummaryQuery,
} from "@/lib/assessment-credit-query";
import {
  createOperationalUiError,
  getOperationalSupportNotes,
  type OperationalUiError,
} from "@/lib/operational-support";

import { AssessmentFieldSelect } from "@/components/assessment/assessment-field-select";
import { AuthSupportDetails } from "@/components/auth/auth-status";
import { DocumentContextCard } from "@/components/document/document-context-card";

type AssessmentStudioProps = {
  locale: Locale;
  messages: AppMessages;
  uiLockConfig: AssessmentUiLockConfig;
  initialPromptAccess: AssessmentPromptAccess;
  defaultModelId: string;
  models: AiModelDescriptor[];
  initialDocuments: DocumentRecord[];
  initialGenerations: AssessmentGeneration[];
  initialActiveDocumentId: string | null;
};

type AssessmentPromptAccess = {
  lockEnabled: boolean;
  unlocked: boolean;
  isAdmin: boolean;
  entitlement: AssessmentPromptEntitlement;
};

type AssessmentPromptUnlockResponse = Pick<
  AssessmentPromptAccess,
  "lockEnabled" | "unlocked"
>;

const QUESTION_COUNT_OPTIONS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const ASSESSMENT_OUTPUT_LANGUAGE_OPTIONS: Locale[] = ["en", "ar"];
const ASSESSMENT_MODE_OPTIONS = [...ASSESSMENT_MODES];
const QUESTION_TYPE_OPTIONS = [...ASSESSMENT_ACTIVE_QUESTION_TYPES];
const ACTIVE_QUESTION_TYPE_SET = new Set<AssessmentQuestionType>(QUESTION_TYPE_OPTIONS);
const RETENTION_NOTICE_AUTO_DISMISS_MS = 60_000;
const ASSESSMENT_PROMPT_UNLOCK_ROUTE = "/api/assessment/prompt-unlock";
const ASSESSMENT_LOCKED_QUESTION_TYPES_NOTE_AR =
  "⏳ باقي الأنواع سوف يتيحها المطور قريبًا بعد الانتهاء من برمجتها";
const ASSESSMENT_PROMPT_LOCK_COPY = {
  title: "ميزة طلب التقييم مخصصة حالياً للطلاب المختارين",
  body:
    "هذه الميزة متاحة لطلاب محددين فقط. إذا رغبت في الوصول إليها أو الحصول على كلمة المرور، يرجى التواصل مع المشرف/المطور ابن عبدالله.",
  entitlementTitle: "ميزة طلب التقييم غير مفعّلة لهذا الحساب حالياً",
  entitlementBody:
    "هذا الحساب لا يملك صلاحية استخدام طلب التقييم حالياً. إذا كان من المفترض أن تكون الميزة متاحة لك، يرجى التواصل مع الإدارة أو المطوّر ابن عبدالله لتفعيلها.",
  passwordLabel: "كلمة المرور",
  showPasswordAction: "إظهار كلمة المرور",
  hidePasswordAction: "إخفاء كلمة المرور",
  passwordPlaceholder: "أدخل كلمة المرور لفتح الميزة",
  unlockAction: "فتح الميزة",
  unlockActionPending: "جارٍ التحقق...",
  passwordRequired: "يرجى إدخال كلمة المرور أولاً.",
  unlockInvalidPassword:
    "تعذر فتح الميزة لأن كلمة المرور غير صحيحة. تأكد من إدخالها كما زُوّدت بها ثم أعد المحاولة.",
  unlockEntitlementRequired:
    "تعذر فتح الميزة لأن هذه الصلاحية غير مفعّلة لهذا الحساب حالياً. يرجى التواصل مع الإدارة أو المطوّر ابن عبدالله لتفعيلها.",
  unlockMisconfigured:
    "تعذر فتح الميزة حالياً بسبب إعداد داخلي في الخادم. يرجى المحاولة لاحقاً، وإن استمرت المشكلة فتواصل مع الدعم.",
  unlockFailed:
    "تعذر فتح الميزة حالياً بسبب مشكلة مؤقتة. يرجى إعادة المحاولة بعد قليل.",
  lockedFieldError:
    "ميزة طلب التقييم ما زالت مقفلة لهذا الحساب. يرجى إتمام فتح الميزة أولاً.",
  entitlementFieldError:
    "ميزة طلب التقييم غير مفعّلة لهذا الحساب حالياً، لذلك لا يمكن استخدام هذا الحقل.",
  lockedPlaceholder: "هذا الحقل مقفل حالياً حتى يتم التحقق من كلمة المرور",
  entitlementPlaceholder:
    "هذا الحقل غير متاح لهذا الحساب حالياً حتى يتم تفعيل الصلاحية من الإدارة",
  successTitle: "🎉✨ تم فتح الميزة بنجاح",
  successBody:
    "🎉✨ تم التحقق من كلمة المرور وتفعيل طلب التقييم لهذا الحساب بنجاح - من قبل المطوّر ابن عبدالله. يمكنك الآن متابعة إنشاء التقييم.",
};

const ASSESSMENT_MODEL_VISIBILITY_COPY = {
  rightsLine: "جميع حقوق المنصة والتصاميم والافكار محفوظة للمطور ابن عبدالله © 2026",
  supportHint: "تبرع لتطوير أنظمة الذكاء الاصطناعي",
};

type AssessmentRequestError = Error & {
  code?: string;
};

type AssessmentSubmitAttemptSnapshot = {
  idempotencyKey: string;
  requestFingerprint: string;
  createdAt: number;
};

type AssessmentModelTone = "accent" | "gold" | "muted";

const ASSESSMENT_SUBMIT_ATTEMPT_STORAGE_KEY =
  "zootopia:assessment-submit-attempt";
const ASSESSMENT_SUBMIT_ATTEMPT_TTL_MS = 30 * 60 * 1000;

function buildBalancedQuestionTypeDistribution(
  questionTypes: AssessmentQuestionType[],
): AssessmentQuestionTypeDistribution[] {
  const base = Math.floor(100 / questionTypes.length);
  let remainder = 100 - base * questionTypes.length;

  return questionTypes.map((type) => {
    const percentage = base + (remainder > 0 ? 1 : 0);
    remainder = Math.max(0, remainder - 1);

    return {
      type,
      percentage,
    };
  });
}

function sanitizeAssessmentQuestionTypes(
  questionTypes: AssessmentQuestionType[],
): AssessmentQuestionType[] {
  const normalized = questionTypes.filter((type, index, types) => {
    if (!ACTIVE_QUESTION_TYPE_SET.has(type)) {
      return false;
    }

    return types.indexOf(type) === index;
  });

  return normalized.length > 0 ? normalized : (["mcq"] as AssessmentQuestionType[]);
}

function sanitizeAssessmentQuestionTypeDistribution(
  distribution: AssessmentQuestionTypeDistribution[],
  questionTypes: AssessmentQuestionType[],
) {
  if (!Array.isArray(distribution) || distribution.length === 0) {
    return buildBalancedQuestionTypeDistribution(questionTypes);
  }

  const normalized = questionTypes.map((type) => {
    const entry = distribution.find((item) => item.type === type);
    return {
      type,
      percentage:
        typeof entry?.percentage === "number" && Number.isFinite(entry.percentage)
          ? Math.trunc(entry.percentage)
          : NaN,
    } satisfies AssessmentQuestionTypeDistribution;
  });
  const hasInvalidPercentages = normalized.some(
    (entry) =>
      !Number.isInteger(entry.percentage) ||
      entry.percentage < 0 ||
      entry.percentage > 100,
  );
  const total = normalized.reduce((sum, entry) => sum + entry.percentage, 0);

  return hasInvalidPercentages || total !== 100
    ? buildBalancedQuestionTypeDistribution(questionTypes)
    : normalized;
}

/* Assessment Studio only exposes the temporary active type catalog above, but stale client
   state can still survive hot reloads or future local persistence. Keep this sanitizer on the
   client boundary so removed types never leak back into the request payload invisibly. */
function sanitizeAssessmentRequestQuestionTypes(request: AssessmentRequest): AssessmentRequest {
  const questionTypes = sanitizeAssessmentQuestionTypes(request.options.questionTypes);
  const questionTypeDistribution = sanitizeAssessmentQuestionTypeDistribution(
    request.options.questionTypeDistribution,
    questionTypes,
  );

  return {
    ...request,
    options: {
      ...request.options,
      questionTypes,
      questionTypeDistribution,
    },
  };
}

function applyAssessmentUiLockToRequest(input: {
  request: AssessmentRequest;
  lockEnabledForCurrentUser: boolean;
  maxQuestionCountForCurrentUser: number;
  allowedQuestionTypesForCurrentUser: AssessmentQuestionType[];
  allowedOutputLanguagesForCurrentUser: Locale[];
}) {
  if (!input.lockEnabledForCurrentUser) {
    return input.request;
  }

  const minimumQuestionCount = QUESTION_COUNT_OPTIONS[0] ?? 10;
  const nextQuestionCount = Math.min(
    input.request.options.questionCount,
    Math.max(input.maxQuestionCountForCurrentUser, minimumQuestionCount),
  );

  const allowedQuestionTypeSet = new Set(input.allowedQuestionTypesForCurrentUser);
  const filteredQuestionTypes = input.request.options.questionTypes.filter((type) =>
    allowedQuestionTypeSet.has(type),
  );
  const nextQuestionTypes = filteredQuestionTypes.length > 0
    ? sanitizeAssessmentQuestionTypes(filteredQuestionTypes)
    : [input.allowedQuestionTypesForCurrentUser[0] ?? "mcq"];

  const nextQuestionTypeDistribution = sanitizeAssessmentQuestionTypeDistribution(
    input.request.options.questionTypeDistribution.filter((entry) =>
      nextQuestionTypes.includes(entry.type),
    ),
    nextQuestionTypes,
  );

  const allowedOutputLanguageSet = new Set(input.allowedOutputLanguagesForCurrentUser);
  const nextLanguage = allowedOutputLanguageSet.has(input.request.options.language)
    ? input.request.options.language
    : (input.allowedOutputLanguagesForCurrentUser[0] ?? "en");

  const nextRequest: AssessmentRequest = {
    ...input.request,
    options: {
      ...input.request.options,
      questionCount: nextQuestionCount,
      questionTypes: nextQuestionTypes,
      questionTypeDistribution: nextQuestionTypeDistribution,
      language: nextLanguage,
    },
  };

  const hasSameQuestionCount =
    input.request.options.questionCount === nextQuestionCount;
  const hasSameLanguage = input.request.options.language === nextLanguage;
  const hasSameQuestionTypes = hasSameQuestionTypeSelection(
    input.request,
    nextRequest,
  );

  return hasSameQuestionCount && hasSameLanguage && hasSameQuestionTypes
    ? input.request
    : nextRequest;
}

function hasSameQuestionTypeSelection(left: AssessmentRequest, right: AssessmentRequest) {
  const leftTypes = left.options.questionTypes;
  const rightTypes = right.options.questionTypes;
  const leftDistribution = left.options.questionTypeDistribution;
  const rightDistribution = right.options.questionTypeDistribution;

  return (
    leftTypes.length === rightTypes.length &&
    leftTypes.every((type, index) => type === rightTypes[index]) &&
    leftDistribution.length === rightDistribution.length &&
    leftDistribution.every(
      (entry, index) =>
        entry.type === rightDistribution[index]?.type &&
        entry.percentage === rightDistribution[index]?.percentage,
    )
  );
}

function buildQuestionTypeCountMap(
  questionCount: number,
  distribution: AssessmentQuestionTypeDistribution[],
) {
  const plan = distribution.map((entry, index) => {
    const rawCount = (questionCount * entry.percentage) / 100;
    return {
      type: entry.type,
      count: Math.floor(rawCount),
      remainder: rawCount - Math.floor(rawCount),
      index,
    };
  });

  let remaining = questionCount - plan.reduce((total, entry) => total + entry.count, 0);
  const ordered = [...plan].sort((left, right) => {
    if (right.remainder === left.remainder) {
      return left.index - right.index;
    }

    return right.remainder - left.remainder;
  });

  for (const entry of ordered) {
    if (remaining <= 0) {
      break;
    }

    entry.count += 1;
    remaining -= 1;
  }

  return Object.fromEntries(plan.map((entry) => [entry.type, entry.count])) as Record<
    AssessmentQuestionType,
    number
  >;
}

function createInitialRequest(
  locale: Locale,
  defaultModelId: string,
  initialDocumentId: string | null,
): AssessmentRequest {
  const questionTypes: AssessmentQuestionType[] = ["mcq"];
  return {
    prompt: "",
    modelId: defaultModelId,
    documentId: initialDocumentId ?? undefined,
    options: {
      mode: "question_generation",
      questionCount: 10,
      difficulty: "medium",
      language: locale,
      questionTypes,
      questionTypeDistribution: buildBalancedQuestionTypeDistribution(questionTypes),
    },
  };
}

function replaceGeneration(list: AssessmentGeneration[], nextItem: AssessmentGeneration) {
  return [nextItem, ...list.filter((item) => item.id !== nextItem.id)];
}

function formatAssessmentDate(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getDifficultyLabel(value: AssessmentDifficulty, messages: AppMessages) {
  switch (value) {
    case "easy":
      return messages.difficultyEasy;
    case "hard":
      return messages.difficultyHard;
    default:
      return messages.difficultyMedium;
  }
}

function getLanguageLabel(value: Locale, messages: AppMessages) {
  return value === "ar" ? messages.localeArabic : messages.localeEnglish;
}

function getAssessmentModeLabel(value: AssessmentMode, messages: AppMessages) {
  return value === "exam_generation"
    ? messages.assessmentModeExamGeneration
    : messages.assessmentModeQuestionGeneration;
}

function getQuestionTypeLabel(value: AssessmentQuestionType, messages: AppMessages) {
  switch (value) {
    case "true_false":
      return messages.assessmentTypeTrueFalse;
    case "scientific_term":
      return messages.assessmentTypeScientificTerm;
    case "essay":
      return messages.assessmentTypeEssay;
    case "fill_blanks":
      return messages.assessmentTypeFillBlanks;
    case "short_answer":
      return messages.assessmentTypeShortAnswer;
    case "matching":
      return messages.assessmentTypeMatching;
    case "multiple_response":
      return messages.assessmentTypeMultipleResponse;
    case "terminology":
      return messages.assessmentTypeTerminology;
    case "definition":
      return messages.assessmentTypeDefinition;
    case "comparison":
      return messages.assessmentTypeComparison;
    case "labeling":
      return messages.assessmentTypeLabeling;
    case "classification":
      return messages.assessmentTypeClassification;
    case "sequencing":
      return messages.assessmentTypeSequencing;
    case "process_mechanism":
      return messages.assessmentTypeProcessMechanism;
    case "cause_effect":
      return messages.assessmentTypeCauseEffect;
    case "distinguish_between":
      return messages.assessmentTypeDistinguishBetween;
    case "identify_structure":
      return messages.assessmentTypeIdentifyStructure;
    case "identify_compound":
      return messages.assessmentTypeIdentifyCompound;
    default:
      return messages.assessmentTypeMcq;
  }
}

function getModelChipClasses(tone: AssessmentModelTone) {
  switch (tone) {
    case "gold":
      return "bg-gold/10 text-gold";
    case "muted":
      return "border border-border-strong bg-background-strong text-foreground-muted";
    default:
      return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-200";
  }
}

function getAssessmentModelMeta(modelId: string, messages: AppMessages) {
  switch (modelId) {
    case "gemini-3.1-flash-lite-preview":
      return [
        { label: messages.modelTagFast, tone: "muted" as const },
        { label: messages.modelProviderGoogle, tone: "muted" as const },
      ];
    case "gemini-2.5-flash-lite":
      return [
        { label: messages.modelTagFast, tone: "accent" as const },
        { label: messages.modelProviderGoogle, tone: "muted" as const },
      ];
    case "gemini-2.5-pro":
      return [
        {
          label: messages.modelTagAdvancedReasoning,
          tone: "gold" as const,
        },
        { label: messages.modelProviderGoogle, tone: "muted" as const },
      ];
    case "gemini-2.5-flash":
      return [
        { label: messages.modelTagBalanced, tone: "accent" as const },
        { label: messages.modelProviderGoogle, tone: "muted" as const },
      ];
    case "qwen3.5-flash":
      return [
        { label: messages.modelTagDefault, tone: "accent" as const },
        { label: messages.modelTagBalanced, tone: "muted" as const },
        { label: messages.modelProviderQwen, tone: "muted" as const },
      ];
    case "qwen-flash-us":
      return [
        { label: messages.modelTagBalanced, tone: "accent" as const },
        { label: messages.modelProviderQwen, tone: "muted" as const },
      ];
    default:
      return [];
  }
}

function getDocumentStatusLabel(value: DocumentRecord["status"], messages: AppMessages) {
  switch (value) {
    case "received":
      return messages.documentStatusReceived;
    case "processing":
      return messages.documentStatusProcessing;
    case "failed":
      return messages.documentStatusFailed;
    default:
      return messages.documentStatusReady;
  }
}

function areCreditSummariesEqual(
  left: AssessmentDailyCreditsSummary | null,
  right: AssessmentDailyCreditsSummary | null,
) {
  if (!left || !right) {
    return left === right;
  }

  return (
    left.dayKey === right.dayKey &&
    left.assessmentAccess === right.assessmentAccess &&
    left.isAdminExempt === right.isAdminExempt &&
    left.dailyLimit === right.dailyLimit &&
    left.dailyLimitSource === right.dailyLimitSource &&
    left.dailyRemainingCount === right.dailyRemainingCount &&
    left.extraCreditsAvailable === right.extraCreditsAvailable &&
    left.activeGrantCount === right.activeGrantCount &&
    left.remainingCount === right.remainingCount &&
    left.totalRemainingCount === right.totalRemainingCount &&
    left.manualCreditsAvailable === right.manualCreditsAvailable &&
    left.grantCreditsAvailable === right.grantCreditsAvailable &&
    left.usedCount === right.usedCount &&
    left.resetsAt === right.resetsAt
  );
}

function resolveAssessmentResponseFallbackMessage(
  response: Response,
  rawBody: string,
  fallbackMessage: string,
) {
  const trimmedBody = rawBody.trim();

  if (trimmedBody && !/^<!doctype html|^<html/i.test(trimmedBody)) {
    return trimmedBody;
  }

  if (response.statusText.trim()) {
    return response.statusText;
  }

  return fallbackMessage;
}

async function readAssessmentApiResult<T>(
  response: Response,
  fallbackMessage: string,
): Promise<ApiResult<T>> {
  const rawBody = await response.text();

  if (!rawBody.trim()) {
    return {
      ok: false,
      error: {
        code: "EMPTY_RESPONSE",
        message: response.ok ? fallbackMessage : response.statusText || fallbackMessage,
      },
    };
  }

  try {
    return JSON.parse(rawBody) as ApiResult<T>;
  } catch {
    return {
      ok: false,
      error: {
        code: "INVALID_RESPONSE",
        message: resolveAssessmentResponseFallbackMessage(
          response,
          rawBody,
          fallbackMessage,
        ),
      },
    };
  }
}

function createAssessmentRequestError(message: string, code?: string) {
  return Object.assign(new Error(message), { code }) as AssessmentRequestError;
}

function resolveAssessmentPromptUnlockErrorMessage(error: ApiFailure["error"] | null) {
  switch (error?.code) {
    case "ASSESSMENT_PROMPT_UNLOCK_INVALID_PASSWORD":
      return ASSESSMENT_PROMPT_LOCK_COPY.unlockInvalidPassword;
    case "ASSESSMENT_PROMPT_ENTITLEMENT_REQUIRED":
      return ASSESSMENT_PROMPT_LOCK_COPY.unlockEntitlementRequired;
    case "ASSESSMENT_PROMPT_LOCK_MISCONFIGURED":
      return ASSESSMENT_PROMPT_LOCK_COPY.unlockMisconfigured;
    case "ASSESSMENT_PROMPT_UNLOCK_PASSWORD_REQUIRED":
      return ASSESSMENT_PROMPT_LOCK_COPY.passwordRequired;
    case "PROFILE_INCOMPLETE":
      return "يرجى إكمال بيانات الحساب من صفحة الإعدادات قبل استخدام هذه الميزة.";
    case "UNAUTHENTICATED":
      return "يلزم تسجيل الدخول قبل استخدام هذه الميزة.";
    default:
      return error?.message?.trim() || ASSESSMENT_PROMPT_LOCK_COPY.unlockFailed;
  }
}

/* Assessment Studio owns the client-side logical-attempt key for `/api/assessment`.
   Persisting it per tab for a short TTL keeps double-clicks, refresh retries, and resend flows
   on the same server idempotency lane so one human attempt cannot fan out into multiple charges.
   Future agents: keep this fingerprint/key flow aligned with the route contract before changing
   submit behavior, or the credit system can drift back into duplicate-deduction risk. */
function stableSerializeAssessmentSubmitValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerializeAssessmentSubmitValue(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([entryKey, entryValue]) =>
          `${JSON.stringify(entryKey)}:${stableSerializeAssessmentSubmitValue(entryValue)}`,
      )
      .join(",")}}`;
  }

  return JSON.stringify(value) ?? "null";
}

function buildAssessmentSubmitFingerprint(request: AssessmentRequest) {
  return stableSerializeAssessmentSubmitValue(request);
}

function createAssessmentSubmitIdempotencyKey() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }

  return `assessment-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function isAssessmentSubmitAttemptSnapshot(
  value: unknown,
): value is AssessmentSubmitAttemptSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }

  const snapshot = value as Partial<AssessmentSubmitAttemptSnapshot>;
  return (
    typeof snapshot.idempotencyKey === "string" &&
    snapshot.idempotencyKey.trim().length > 0 &&
    typeof snapshot.requestFingerprint === "string" &&
    snapshot.requestFingerprint.trim().length > 0 &&
    typeof snapshot.createdAt === "number" &&
    Number.isFinite(snapshot.createdAt)
  );
}

function clearStoredAssessmentSubmitAttempt() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.removeItem(ASSESSMENT_SUBMIT_ATTEMPT_STORAGE_KEY);
  } catch {
    // Storage access is best-effort only; missing storage must not block submit safety.
  }
}

function readStoredAssessmentSubmitAttempt(nowMs = Date.now()) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(ASSESSMENT_SUBMIT_ATTEMPT_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!isAssessmentSubmitAttemptSnapshot(parsed)) {
      clearStoredAssessmentSubmitAttempt();
      return null;
    }

    if (
      parsed.createdAt > nowMs ||
      nowMs - parsed.createdAt > ASSESSMENT_SUBMIT_ATTEMPT_TTL_MS
    ) {
      clearStoredAssessmentSubmitAttempt();
      return null;
    }

    return parsed;
  } catch {
    clearStoredAssessmentSubmitAttempt();
    return null;
  }
}

function writeStoredAssessmentSubmitAttempt(snapshot: AssessmentSubmitAttemptSnapshot) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      ASSESSMENT_SUBMIT_ATTEMPT_STORAGE_KEY,
      JSON.stringify(snapshot),
    );
  } catch {
    // Storage access is best-effort only; missing storage must not block submit safety.
  }
}

function shouldShowAssessmentOperationalSupport(code?: string) {
  if (!code) {
    return true;
  }

  return ![
    "INVALID_ASSESSMENT_REQUEST",
    "ASSESSMENT_MODEL_UNSUPPORTED",
    "DOCUMENT_NOT_FOUND",
    "DOCUMENT_NOT_READY",
    "DOCUMENT_CONTEXT_UNAVAILABLE",
    "ASSESSMENT_DAILY_CREDITS_EXHAUSTED",
    "ASSESSMENT_ACCESS_DISABLED",
    "ASSESSMENT_PROMPT_LOCKED",
    "ASSESSMENT_PROMPT_ENTITLEMENT_REQUIRED",
    "ASSESSMENT_IDEMPOTENCY_KEY_REQUIRED",
    "ASSESSMENT_REQUEST_IN_PROGRESS",
    "ASSESSMENT_IDEMPOTENCY_KEY_REUSED",
    "ASSESSMENT_USER_LANE_REQUIRED",
    "PROFILE_INCOMPLETE",
    "UNAUTHENTICATED",
  ].includes(code);
}

function resolveAssessmentErrorMessage(
  error: ApiFailure["error"] | null,
  messages: AppMessages,
) {
  if (!error) {
    return messages.assessmentFieldGenericError;
  }

  switch (error.code) {
    case "INVALID_ASSESSMENT_REQUEST":
    case "ASSESSMENT_MODEL_UNSUPPORTED":
      return messages.assessmentFieldSettingsInvalid;
    case "DOCUMENT_NOT_FOUND":
      return messages.assessmentFieldDocumentMissing;
    case "DOCUMENT_NOT_READY":
      return messages.assessmentFieldDocumentNotReady;
    case "DOCUMENT_CONTEXT_UNAVAILABLE":
      return messages.assessmentFieldDocumentUnavailable;
    case "ASSESSMENT_PROVIDER_NOT_CONFIGURED":
    case "ASSESSMENT_PROVIDER_MISCONFIGURED":
    case "ASSESSMENT_PROVIDER_API_KEY_MISSING":
    case "ASSESSMENT_PROVIDER_BASE_URL_MISSING":
    case "ASSESSMENT_PROVIDER_MODEL_UNAVAILABLE":
    case "ASSESSMENT_PROVIDER_ROUTE_MISMATCH":
    case "ASSESSMENT_PROVIDER_AUTH_FAILED":
    case "ASSESSMENT_PROVIDER_UPSTREAM_UNAVAILABLE":
      return messages.assessmentFieldProviderUnavailable;
    case "ASSESSMENT_PROVIDER_BILLING_ARREARS":
    case "ASSESSMENT_PROVIDER_QUOTA_EXHAUSTED":
    case "ASSESSMENT_PROVIDER_RATE_LIMITED":
      return messages.assessmentFieldProviderRateLimited;
    case "ASSESSMENT_PROVIDER_TIMEOUT":
      return messages.assessmentFieldProviderTimeout;
    case "ASSESSMENT_PROVIDER_EXECUTION_FAILED":
      return messages.assessmentFieldProviderExecutionFailed;
    case "ASSESSMENT_PROVIDER_RESPONSE_INVALID":
      return messages.assessmentFieldProviderResponseInvalid;
    case "ASSESSMENT_DAILY_CREDITS_EXHAUSTED":
      return messages.assessmentDailyCreditsExhaustedBody;
    case "ASSESSMENT_ACCESS_DISABLED":
    case "ASSESSMENT_USER_LANE_REQUIRED":
      return messages.assessmentAccessDisabledBody;
    case "ASSESSMENT_PROMPT_ENTITLEMENT_REQUIRED":
      return ASSESSMENT_PROMPT_LOCK_COPY.entitlementFieldError;
    case "ASSESSMENT_PROMPT_LOCKED":
      return ASSESSMENT_PROMPT_LOCK_COPY.lockedFieldError;
    case "ASSESSMENT_REQUEST_IN_PROGRESS":
      return messages.assessmentGenerateWorking;
    case "ASSESSMENT_FINALIZATION_FAILED":
      return messages.assessmentFinalizationFailed;
    case "PROFILE_INCOMPLETE":
      return messages.profileCompletionRequiredNotice;
    case "UNAUTHENTICATED":
      return messages.supabaseAuthUnavailable;
    default:
      return messages.assessmentFieldGenericError;
  }
}

function isAssessmentDailyCreditsExhausted(credits: AssessmentDailyCreditsSummary) {
  return (
    credits.applies &&
    credits.assessmentAccess !== "disabled" &&
    credits.remainingCount === 0
  );
}

function buildAssessmentCreditSourceLabels(
  locale: Locale,
  creditDisplay: AssessmentCreditDisplayModel,
) {
  if (creditDisplay.extraAvailable <= 0) {
    return [];
  }

  return [
    creditDisplay.hasManualCredits
      ? locale === "ar"
        ? "إضافة إدارية"
        : "Admin-added"
      : null,
    creditDisplay.hasGrantCredits
      ? locale === "ar"
        ? "منح"
        : "Grant"
      : null,
  ].filter((value): value is string => Boolean(value));
}

function buildAssessmentCreditPanelHeading(input: {
  locale: Locale;
  creditDisplay: AssessmentCreditDisplayModel;
  messages: AppMessages;
}) {
  const { creditDisplay, locale, messages } = input;
  if (creditDisplay.state === "admin_exempt") {
    return messages.assessmentDailyCreditsAdminExemptTitle;
  }

  if (creditDisplay.state === "access_disabled") {
    return locale === "ar"
      ? "وصول التقييم موقوف حالياً"
      : "Assessment access is currently disabled.";
  }

  if (creditDisplay.state === "none") {
    return locale === "ar"
      ? "لا توجد اعتمادات متاحة حالياً"
      : "No credits available right now.";
  }

  return locale === "ar"
    ? `المتاح الآن: ${formatAssessmentCreditCount(creditDisplay.totalAvailable ?? 0, locale)}`
    : `Available now: ${formatAssessmentCreditCount(creditDisplay.totalAvailable ?? 0, locale)}`;
}

function buildAssessmentCreditPanelBody(input: {
  locale: Locale;
  creditDisplay: AssessmentCreditDisplayModel;
  messages: AppMessages;
}) {
  const { creditDisplay, locale, messages } = input;
  const extraSourceLabels = buildAssessmentCreditSourceLabels(locale, creditDisplay);
  const extraSourcePhrase = extraSourceLabels.length === 0
    ? locale === "ar"
      ? "الاعتمادات الإضافية"
      : "extra credits"
    : extraSourceLabels.join(locale === "ar" ? " و" : " and ");

  switch (creditDisplay.state) {
    case "admin_exempt":
      return messages.assessmentDailyCreditsAdminExemptBody;
    case "access_disabled":
      return messages.assessmentAccessDisabledBody;
    case "daily_only":
      return locale === "ar"
        ? "الرصيد المتاح حالياً يأتي بالكامل من الحصة اليومية، وسيُعاد ضبطه تلقائياً عند نافذة التجديد التالية."
        : "Your current balance comes entirely from today's daily allowance and will renew automatically at the next reset window.";
    case "mixed":
      return locale === "ar"
        ? `لديك حالياً رصيد يومي متاح بالإضافة إلى اعتمادات إضافية من ${extraSourcePhrase}.`
        : `You currently have daily credits available plus extra credits from ${extraSourcePhrase}.`;
    case "extra_only":
      return locale === "ar"
        ? `تم استهلاك الحصة اليومية، لكن ما زالت اعتمادات إضافية من ${extraSourcePhrase} متاحة للاستخدام الآن.`
        : `Your daily allowance is exhausted, but extra credits from ${extraSourcePhrase} are still available right now.`;
    case "none":
      return locale === "ar"
        ? "لا توجد حصة يومية أو اعتمادات إضافية متاحة حالياً. ستتجدد الاعتمادات عند نافذة إعادة الضبط التالية."
        : "No daily or extra credits are currently available. Credits will renew at the next reset window.";
    default:
      return messages.assessmentDailyCreditsRenewsTomorrow;
  }
}

export function AssessmentStudio({
  locale,
  messages,
  uiLockConfig,
  initialPromptAccess,
  defaultModelId,
  models,
  initialDocuments,
  initialGenerations,
  initialActiveDocumentId,
}: AssessmentStudioProps) {
  const [generations, setGenerations] = useState(initialGenerations);
  const queryClient = useQueryClient();
  /* Assessment Studio must consume the exact same canonical credit query as the protected header.
     Future agents: do not seed this hook from page props or mutation responses, or the studio can
     momentarily outrun the shell before `/api/assessment/credits` finishes reconciling. */
  const creditSummaryQuery = useAssessmentCreditSummaryQuery({
    source: "assessment-studio",
  });
  const creditSummary = creditSummaryQuery.data ?? null;
  const creditDisplay = creditSummary
    ? resolveAssessmentCreditDisplayModel(creditSummary)
    : null;
  const [request, setRequest] = useState<AssessmentRequest>(() =>
    createInitialRequest(locale, defaultModelId, initialActiveDocumentId),
  );
  const [pending, setPending] = useState(false);
  const [readbackId, setReadbackId] = useState<string | null>(null);
  const [error, setError] = useState<OperationalUiError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [promptAccess, setPromptAccess] =
    useState<AssessmentPromptAccess>(initialPromptAccess);
  const [unlockPassword, setUnlockPassword] = useState("");
  const [unlockPasswordVisible, setUnlockPasswordVisible] = useState(false);
  const [unlockPending, setUnlockPending] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlockSuccessVisible, setUnlockSuccessVisible] = useState(false);
  const [unlockSuccessEntered, setUnlockSuccessEntered] = useState(false);
  const [lastCreatedGeneration, setLastCreatedGeneration] =
    useState<AssessmentGeneration | null>(null);
  const [showRetentionNotice, setShowRetentionNotice] = useState(false);
  const retentionNoticeGenerationIdRef = useRef<string | null>(null);
  const submitAttemptRef = useRef<AssessmentSubmitAttemptSnapshot | null>(null);
  const submitInFlightRef = useRef(false);
  const lastAppliedCreditSummaryRef = useRef<AssessmentDailyCreditsSummary | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setGenerations(initialGenerations);
  }, [initialGenerations]);

  useEffect(() => {
    /* Assessment Studio can mount from a prefetched route snapshot that predates an external
       admin credit mutation. Invalidate the shared query key once on mount so both the studio and
       protected header reconcile to fresh server truth without a custom browser event bridge. */
    void invalidateAssessmentCreditSummaryQuery(queryClient, {
      source: "assessment-studio",
      reason: "studio-mounted",
    });
  }, [queryClient]);

  useEffect(() => {
    if (!creditSummaryQuery.error) {
      return;
    }

    logAssessmentCreditClientDiagnostic({
      event: "assessment_studio_summary_query_failed",
      details: {
        errorCode: creditSummaryQuery.error.code ?? null,
      },
    });
  }, [creditSummaryQuery.error]);

  useEffect(() => {
    if (!creditSummary) {
      return;
    }

    /* Keep a studio-specific "summary applied" trace so diagnostics can confirm that the
       Assessment surface reconciled to the shared query result, not to any local balance owner. */
    if (areCreditSummariesEqual(lastAppliedCreditSummaryRef.current, creditSummary)) {
      return;
    }

    lastAppliedCreditSummaryRef.current = creditSummary;
    logAssessmentCreditClientDiagnostic({
      event: "assessment_studio_summary_applied",
      details: {
        source: "query-cache",
        displayState: creditDisplay?.state ?? null,
        dailyAvailable: creditDisplay?.dailyAvailable ?? null,
        extraAvailable: creditDisplay?.extraAvailable ?? null,
        remainingCount: creditSummary.remainingCount,
        manualCreditsAvailable: creditSummary.manualCreditsAvailable,
        grantCreditsAvailable: creditSummary.grantCreditsAvailable,
        assessmentAccess: creditSummary.assessmentAccess,
      },
    });
  }, [creditDisplay, creditSummary]);

  useEffect(() => {
    setPromptAccess(initialPromptAccess);
  }, [initialPromptAccess]);

  useEffect(() => {
    if (promptAccess.isAdmin) {
      return;
    }

    setRequest((current) =>
      current.modelId === defaultModelId
        ? current
        : {
            ...current,
            modelId: defaultModelId,
          },
    );

    setFieldErrors((current) =>
      current.modelId
        ? {
            ...current,
            modelId: "",
          }
        : current,
    );
  }, [defaultModelId, promptAccess.isAdmin]);

  useEffect(() => {
    setRequest((current) => {
      const sanitized = sanitizeAssessmentRequestQuestionTypes(current);
      const locked = applyAssessmentUiLockToRequest({
        request: sanitized,
        lockEnabledForCurrentUser: uiLockEnabledForCurrentUser,
        maxQuestionCountForCurrentUser,
        allowedQuestionTypesForCurrentUser,
        allowedOutputLanguagesForCurrentUser,
      });
      const hasSameQuestionTypes = hasSameQuestionTypeSelection(current, locked);
      const hasSameQuestionCount =
        current.options.questionCount === locked.options.questionCount;
      const hasSameLanguage = current.options.language === locked.options.language;

      return hasSameQuestionTypes && hasSameQuestionCount && hasSameLanguage
        ? current
        : locked;
    });
  }, [
    allowedOutputLanguagesForCurrentUser,
    allowedQuestionTypesForCurrentUser,
    maxQuestionCountForCurrentUser,
    uiLockEnabledForCurrentUser,
  ]);

  useEffect(() => {
    if (!initialActiveDocumentId) {
      return;
    }

    setRequest((current) =>
      current.documentId
        ? current
        : {
            ...current,
            documentId: initialActiveDocumentId,
          },
    );
  }, [initialActiveDocumentId]);

  useEffect(() => {
    const generationId = lastCreatedGeneration?.id;
    if (!generationId) {
      return;
    }

    // This reminder belongs to the persisted-success scope only.
    // Keying by generation id prevents duplicate banners on rerenders and shows it once per real save.
    if (retentionNoticeGenerationIdRef.current === generationId) {
      return;
    }

    retentionNoticeGenerationIdRef.current = generationId;
    setShowRetentionNotice(true);

    const timeoutId = window.setTimeout(() => {
      setShowRetentionNotice(false);
    }, RETENTION_NOTICE_AUTO_DISMISS_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [lastCreatedGeneration?.id]);

  const documentOptions = initialDocuments.slice(0, 20);
  const selectedModel =
    models.find((model) => model.id === request.modelId) ?? models[0] ?? null;
  const selectedDocument = documentOptions.find((item) => item.id === request.documentId);
  const latestDocument =
    documentOptions.find((document) => document.isActive) ?? documentOptions[0] ?? null;
  const latestGeneration = generations[0] ?? null;
  const creditsExhausted = creditSummary
    ? isAssessmentDailyCreditsExhausted(creditSummary)
    : false;
  const creditSummaryHeading = !creditDisplay
    ? messages.loading
    : buildAssessmentCreditPanelHeading({
        locale,
        creditDisplay,
        messages,
      });
  const creditSummaryBody = !creditDisplay
    ? messages.loading
    : buildAssessmentCreditPanelBody({
        locale,
        creditDisplay,
        messages,
      });
  const creditSourceLabels = creditDisplay
    ? buildAssessmentCreditSourceLabels(locale, creditDisplay)
    : [];
  const totalAvailableChipLabel =
    !creditDisplay || creditDisplay.state === "admin_exempt"
      ? null
      : locale === "ar"
        ? `المتاح الآن: ${formatAssessmentCreditCount(creditDisplay.totalAvailable ?? 0, locale)}`
        : `Available now: ${formatAssessmentCreditCount(creditDisplay.totalAvailable ?? 0, locale)}`;
  const dailyAvailableChipLabel =
    !creditDisplay
    || creditDisplay.state === "admin_exempt"
    || creditDisplay.dailyAvailable === null
      ? null
      : locale === "ar"
        ? `اليومي المتاح: ${formatAssessmentCreditCount(creditDisplay.dailyAvailable, locale)}`
        : `Daily available: ${formatAssessmentCreditCount(creditDisplay.dailyAvailable, locale)}`;
  const extraAvailableChipLabel =
    !creditDisplay
    || creditDisplay.state === "admin_exempt"
    || creditDisplay.extraAvailable <= 0
      ? null
      : locale === "ar"
        ? `الإضافي المتاح: ${formatAssessmentCreditCount(creditDisplay.extraAvailable, locale)}`
        : `Extra available: ${formatAssessmentCreditCount(creditDisplay.extraAvailable, locale)}`;
  const promptFeatureLocked =
    promptAccess.lockEnabled && !promptAccess.unlocked && !promptAccess.isAdmin;
  /* The server owns entitlement state and decides whether this account should ever see the
     password-unlock lane. Future agents: do not fall back to showing the password form when
     entitlement is disabled, or users can misread admin denial as a password bug. */
  const promptUnlockAllowed =
    promptFeatureLocked && promptAccess.entitlement === "enabled";
  const promptLockPanelCopy =
    promptAccess.entitlement === "enabled"
      ? {
          title: ASSESSMENT_PROMPT_LOCK_COPY.title,
          body: ASSESSMENT_PROMPT_LOCK_COPY.body,
        }
      : {
          title: ASSESSMENT_PROMPT_LOCK_COPY.entitlementTitle,
          body: ASSESSMENT_PROMPT_LOCK_COPY.entitlementBody,
        };
  const promptLockedFieldError =
    promptAccess.entitlement === "enabled"
      ? ASSESSMENT_PROMPT_LOCK_COPY.lockedFieldError
      : ASSESSMENT_PROMPT_LOCK_COPY.entitlementFieldError;
  const promptLockedPlaceholder =
    promptAccess.entitlement === "enabled"
      ? ASSESSMENT_PROMPT_LOCK_COPY.lockedPlaceholder
      : ASSESSMENT_PROMPT_LOCK_COPY.entitlementPlaceholder;
  const uiLockEnabledForCurrentUser = uiLockConfig.enabled && !promptAccess.isAdmin;
  const maxQuestionCountForCurrentUser = uiLockEnabledForCurrentUser
    ? Math.max(uiLockConfig.maxQuestionCountForUser, QUESTION_COUNT_OPTIONS[0] ?? 10)
    : (QUESTION_COUNT_OPTIONS[QUESTION_COUNT_OPTIONS.length - 1] ?? 100);
  const allowedQuestionTypesForCurrentUser = uiLockEnabledForCurrentUser
    ? uiLockConfig.allowedQuestionTypesForUser
    : QUESTION_TYPE_OPTIONS;
  const allowedQuestionTypeSetForCurrentUser = new Set(
    allowedQuestionTypesForCurrentUser,
  );
  const allowedOutputLanguagesForCurrentUser = uiLockEnabledForCurrentUser
    ? uiLockConfig.allowedOutputLanguagesForUser
    : ASSESSMENT_OUTPUT_LANGUAGE_OPTIONS;
  const allowedOutputLanguageSetForCurrentUser = new Set(
    allowedOutputLanguagesForCurrentUser,
  );
  const showLockedQuestionTypesNote =
    uiLockEnabledForCurrentUser
    && QUESTION_TYPE_OPTIONS.some(
      (type) => !allowedQuestionTypeSetForCurrentUser.has(type),
    );
  const isQuestionCountLockedForCurrentUser = (count: number) =>
    uiLockEnabledForCurrentUser && count > maxQuestionCountForCurrentUser;
  const isQuestionTypeLockedForCurrentUser = (type: AssessmentQuestionType) =>
    uiLockEnabledForCurrentUser && !allowedQuestionTypeSetForCurrentUser.has(type);
  const isOutputLanguageLockedForCurrentUser = (language: Locale) =>
    uiLockEnabledForCurrentUser
    && !allowedOutputLanguageSetForCurrentUser.has(language);
  const linkedDocumentReady = !selectedDocument || selectedDocument.status === "ready";
  const questionTypeCountMap = buildQuestionTypeCountMap(
    request.options.questionCount,
    request.options.questionTypeDistribution,
  );
  const questionCountOptions = QUESTION_COUNT_OPTIONS.map((count) => ({
    value: count,
    label: `${count} ${messages.assessmentQuestionsLabel}`,
    disabled: isQuestionCountLockedForCurrentUser(count),
    badge: isQuestionCountLockedForCurrentUser(count) ? messages.comingSoonLabel : undefined,
  }));
  const difficultyOptions = [
    { value: "easy" as const, label: messages.difficultyEasy },
    { value: "medium" as const, label: messages.difficultyMedium },
    { value: "hard" as const, label: messages.difficultyHard },
  ];
  const languageOptions = [
    {
      value: "en" as const,
      label: messages.localeEnglish,
      disabled: isOutputLanguageLockedForCurrentUser("en"),
      badge: isOutputLanguageLockedForCurrentUser("en") ? messages.comingSoonLabel : undefined,
    },
    {
      value: "ar" as const,
      label: messages.localeArabic,
      disabled: isOutputLanguageLockedForCurrentUser("ar"),
      badge: isOutputLanguageLockedForCurrentUser("ar") ? messages.comingSoonLabel : undefined,
    },
  ];
  const modelOptions = models.map((model) => ({
    value: model.id,
    label: model.label,
    description: getAssessmentModelMeta(model.id, messages)
      .map((chip) => chip.label)
      .join(" • "),
  }));
  const documentSelectOptions = [
    {
      value: "",
      label: messages.noLinkedDocument,
      description: messages.documentContextManageHelp,
    },
    ...documentOptions.map((document) => ({
      value: document.id,
      label: document.fileName,
      description: getDocumentStatusLabel(document.status, messages),
      badge: document.isActive ? messages.assessmentActiveLinkedDocument : undefined,
    })),
  ];

  useEffect(() => {
    logAssessmentCreditClientDiagnostic({
      event: "assessment_studio_exhausted_state_recalculated",
      details: {
        exhausted: creditSummary ? creditsExhausted : null,
        displayState: creditDisplay?.state ?? null,
        summary: creditSummary
          ? buildAssessmentCreditClientSummarySnapshot(creditSummary)
          : null,
      },
    });
  }, [creditDisplay, creditSummary, creditsExhausted]);

  function handleToggleQuestionType(type: AssessmentQuestionType) {
    setFieldErrors((current) => ({
      ...current,
      questionTypes: "",
      questionTypeDistribution: "",
    }));

    setRequest((current) => {
      const isSelected = current.options.questionTypes.includes(type);
      if (isSelected && current.options.questionTypes.length === 1) {
        return current;
      }

      const questionTypes = isSelected
        ? current.options.questionTypes.filter((item) => item !== type)
        : [...current.options.questionTypes, type];

      return {
        ...current,
        options: {
          ...current.options,
          questionTypes,
          questionTypeDistribution: buildBalancedQuestionTypeDistribution(questionTypes),
        },
      };
    });
  }

  function handleDistributionChange(type: AssessmentQuestionType, value: string) {
    setFieldErrors((current) => ({
      ...current,
      questionTypeDistribution: "",
    }));

    setRequest((current) => {
      const distribution = [...current.options.questionTypeDistribution];
      if (distribution.length <= 1) {
        return current;
      }

      const index = distribution.findIndex((entry) => entry.type === type);
      const lockedIndex = distribution.length - 1;
      if (index === -1 || index === lockedIndex) {
        return current;
      }

      const rawValue = Number.parseInt(value, 10);
      const nextValue = Number.isFinite(rawValue) ? rawValue : 0;
      const sumOtherEditable = distribution.reduce((total, entry, entryIndex) => {
        if (entryIndex === index || entryIndex === lockedIndex) {
          return total;
        }

        return total + entry.percentage;
      }, 0);
      const clampedValue = Math.max(0, Math.min(nextValue, 100 - sumOtherEditable));

      distribution[index] = {
        ...distribution[index]!,
        percentage: clampedValue,
      };
      distribution[lockedIndex] = {
        ...distribution[lockedIndex]!,
        percentage: Math.max(
          0,
          100 -
            distribution
              .slice(0, lockedIndex)
              .reduce((total, entry) => total + entry.percentage, 0),
        ),
      };

      return {
        ...current,
        options: {
          ...current.options,
          questionTypeDistribution: distribution,
        },
      };
    });
  }

  async function handleUnlockPromptFeature() {
    if (unlockPending || promptAccess.unlocked || promptAccess.entitlement !== "enabled") {
      return;
    }

    const password = unlockPassword.trim();
    if (!password) {
      setUnlockError(ASSESSMENT_PROMPT_LOCK_COPY.passwordRequired);
      return;
    }

    setUnlockPending(true);
    setUnlockError(null);

    try {
      const response = await fetch(ASSESSMENT_PROMPT_UNLOCK_ROUTE, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const payload = await readAssessmentApiResult<AssessmentPromptUnlockResponse>(
        response,
        ASSESSMENT_PROMPT_LOCK_COPY.unlockFailed,
      );

      if (!response.ok || !payload.ok || !payload.data.unlocked) {
        if (!payload.ok && payload.error.code === "ASSESSMENT_PROMPT_ENTITLEMENT_REQUIRED") {
          /* Reflect server-side entitlement revocations immediately in the open tab so stale page
             state never keeps offering a password form after admin access has been removed. */
          setPromptAccess((current) => ({
            ...current,
            lockEnabled: true,
            unlocked: false,
            entitlement: "disabled",
          }));
          setUnlockPassword("");
          setUnlockPasswordVisible(false);
        }

        setUnlockSuccessVisible(false);
        setUnlockSuccessEntered(false);
        setUnlockError(
          resolveAssessmentPromptUnlockErrorMessage(payload.ok ? null : payload.error),
        );
        return;
      }

      setPromptAccess((current) => ({
        ...current,
        lockEnabled: payload.data.lockEnabled,
        unlocked: payload.data.unlocked,
      }));
      setFieldErrors((current) => ({
        ...current,
        prompt: "",
      }));
      setUnlockPassword("");
      setUnlockPasswordVisible(false);
      setUnlockError(null);
      setUnlockSuccessVisible(true);
      setUnlockSuccessEntered(false);

      window.requestAnimationFrame(() => {
        setUnlockSuccessEntered(true);
      });
    } catch {
      setUnlockSuccessVisible(false);
      setUnlockSuccessEntered(false);
      setUnlockError(ASSESSMENT_PROMPT_LOCK_COPY.unlockFailed);
    } finally {
      setUnlockPending(false);
    }
  }

  async function handleRefreshGeneration(id: string) {
    setReadbackId(id);
    setError(null);
    setNotice(null);
    setShowRetentionNotice(false);

    try {
      const response = await fetch(`/api/assessment/${encodeURIComponent(id)}`);
      const payload = await readAssessmentApiResult<AssessmentGeneration>(
        response,
        messages.assessmentReadbackFailed,
      );

      if (!response.ok || !payload.ok) {
        throw createAssessmentRequestError(
          resolveAssessmentErrorMessage(payload.ok ? null : payload.error, messages),
          payload.ok ? "REQUEST_FAILED" : payload.error.code,
        );
      }

      setGenerations((current) => replaceGeneration(current, payload.data));
    } catch (nextError) {
      setError(
        createOperationalUiError(
          nextError instanceof Error
            ? nextError.message
            : messages.assessmentReadbackFailed,
          shouldShowAssessmentOperationalSupport(
            nextError instanceof Error && "code" in nextError
              ? String((nextError as AssessmentRequestError).code || "")
              : undefined,
          ),
        ),
      );
    } finally {
      setReadbackId(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    /* This synchronous guard belongs to the Assessment Studio submit lane.
       React state updates are async, so the button-disabled UI alone is not enough to stop a
       fast double-click from dispatching two POSTs before the rerender lands. */
    if (submitInFlightRef.current) {
      return;
    }

    submitInFlightRef.current = true;
    setPending(true);
    setError(null);
    setNotice(null);
    setShowRetentionNotice(false);
    setLastCreatedGeneration(null);
    setFieldErrors({});
    try {
      const requestForSubmit = applyAssessmentUiLockToRequest({
        request: sanitizeAssessmentRequestQuestionTypes(request),
        lockEnabledForCurrentUser: uiLockEnabledForCurrentUser,
        maxQuestionCountForCurrentUser,
        allowedQuestionTypesForCurrentUser,
        allowedOutputLanguagesForCurrentUser,
      });

      const hasSameQuestionTypes = hasSameQuestionTypeSelection(
        request,
        requestForSubmit,
      );
      const hasSameQuestionCount =
        request.options.questionCount === requestForSubmit.options.questionCount;
      const hasSameLanguage =
        request.options.language === requestForSubmit.options.language;
      if (!hasSameQuestionTypes || !hasSameQuestionCount || !hasSameLanguage) {
        setRequest(requestForSubmit);
      }

      /* Block submits until the canonical shared credit query has resolved. This keeps the studio
         from acting on a stale server-rendered seed or a local mutation response before the same
         `/api/assessment/credits` read model used by the header is available. */
      if (!creditSummary) {
        setError(createOperationalUiError(messages.loading, false));
        return;
      }

      // This is only a user-friendly local stop. The real exhausted-limit enforcement lives on the
      // server route so duplicate tabs, retried requests, and direct API calls stay constrained.
      if (creditsExhausted) {
        setError(createOperationalUiError(messages.assessmentDailyCreditsExhaustedBody, false));
        return;
      }

      if (selectedDocument && !linkedDocumentReady) {
        setFieldErrors({ documentId: messages.assessmentFieldDocumentNotReady });
        return;
      }

      if (requestForSubmit.options.questionTypes.length === 0) {
        setFieldErrors({ questionTypes: messages.assessmentQuestionTypesRequired });
        return;
      }

      if (
        requestForSubmit.options.questionTypeDistribution.reduce(
          (total, entry) => total + entry.percentage,
          0,
        ) !== 100
      ) {
        setFieldErrors({
          questionTypeDistribution: messages.assessmentDistributionInvalid,
        });
        return;
      }

      if (promptFeatureLocked && requestForSubmit.prompt.trim()) {
        setFieldErrors({
          prompt: promptLockedFieldError,
        });
        return;
      }

      // The prompt now acts as an optional steering note. We still block empty-content submissions
      // so Assessment always has either user intent text or a linked server-owned document to work from.
      if (!requestForSubmit.prompt.trim() && !requestForSubmit.documentId) {
        setFieldErrors({
          prompt: messages.assessmentPromptOrDocumentRequired,
          documentId: messages.assessmentPromptOrDocumentRequired,
        });
        return;
      }

      const requestFingerprint = buildAssessmentSubmitFingerprint(requestForSubmit);
      const nowMs = Date.now();
      const storedAttempt = readStoredAssessmentSubmitAttempt(nowMs);
      const currentAttempt = submitAttemptRef.current;
      const reusableAttempt =
        currentAttempt &&
        currentAttempt.requestFingerprint === requestFingerprint &&
        nowMs - currentAttempt.createdAt <= ASSESSMENT_SUBMIT_ATTEMPT_TTL_MS
          ? currentAttempt
          : storedAttempt?.requestFingerprint === requestFingerprint
            ? storedAttempt
            : null;
      const attemptSnapshot =
        reusableAttempt ??
        ({
          idempotencyKey: createAssessmentSubmitIdempotencyKey(),
          requestFingerprint,
          createdAt: nowMs,
        } satisfies AssessmentSubmitAttemptSnapshot);

      submitAttemptRef.current = attemptSnapshot;
      writeStoredAssessmentSubmitAttempt(attemptSnapshot);

      const response = await fetch("/api/assessment", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": attemptSnapshot.idempotencyKey,
        },
        body: JSON.stringify(requestForSubmit),
      });
      const payload = await readAssessmentApiResult<AssessmentCreateResponse>(
        response,
        messages.assessmentFieldGenericError,
      );

      if (!response.ok || !payload.ok) {
        if (!payload.ok && payload.error.fieldErrors) {
          setFieldErrors(payload.error.fieldErrors);
        }

        if (!payload.ok && payload.error.code === "ASSESSMENT_DAILY_CREDITS_EXHAUSTED") {
          /* Keep assessment credits server-authoritative on exhausted responses. Do not synthesize
             local zero-balance snapshots from stale UI state; force the shared query to refetch
             canonical `/api/assessment/credits` so header + studio reconcile from one source. */
          void invalidateAssessmentCreditSummaryQuery(queryClient, {
            source: "assessment-studio",
            reason: "submit-daily-exhausted",
            details: {
              errorCode: payload.error.code,
            },
          });
        }

        if (
          !payload.ok
          && (
            payload.error.code === "ASSESSMENT_ACCESS_DISABLED"
            || payload.error.code === "ASSESSMENT_FINALIZATION_FAILED"
          )
        ) {
          void invalidateAssessmentCreditSummaryQuery(queryClient, {
            source: "assessment-studio",
            reason: "submit-failed-authority-state",
            details: {
              errorCode: payload.error.code,
            },
          });
        }

        throw createAssessmentRequestError(
          resolveAssessmentErrorMessage(payload.ok ? null : payload.error, messages),
          payload.ok ? "REQUEST_FAILED" : payload.error.code,
        );
      }

      setGenerations((current) => replaceGeneration(current, payload.data.generation));
      setLastCreatedGeneration(payload.data.generation);
      /* Successful generations still reconcile through canonical `/api/assessment/credits` only.
         Do not patch the shared balance cache from mutation responses here, or the studio can show
         a provisional balance before the protected header finishes reading the same source. */
      void invalidateAssessmentCreditSummaryQuery(queryClient, {
        source: "assessment-studio",
        reason: "submit-succeeded-reconcile",
        details: {
          generationId: payload.data.generation.id,
        },
      });
      setNotice(messages.assessmentRequestSaved);
      submitAttemptRef.current = null;
      clearStoredAssessmentSubmitAttempt();
    } catch (nextError) {
      setError(
        createOperationalUiError(
          nextError instanceof Error
            ? nextError.message
            : messages.assessmentFieldGenericError,
          shouldShowAssessmentOperationalSupport(
            nextError instanceof Error && "code" in nextError
              ? String((nextError as AssessmentRequestError).code || "")
              : undefined,
          ),
        ),
      );
    } finally {
      setPending(false);
      submitInFlightRef.current = false;
    }
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-6">
        <section className="assessment-premium-panel relative isolate overflow-visible rounded-[2rem] p-5 shadow-sm sm:p-6 lg:p-8">
          <div className="relative z-10 space-y-6">
            {/* Keep model control isolated in the setup header so desktop/tablet layouts stay
                compact while small screens can stack naturally without squeezing the title lane. */}
            <div className="assessment-setup-top-row">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] dark:text-emerald-200">
                  <BrainCircuit className="h-5 w-5" />
                </div>
                <div className="min-w-0 space-y-1">
                  <p className="section-label text-emerald-700 dark:text-emerald-200">
                    {messages.assessmentTitle}
                  </p>
                  <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-foreground">
                    {messages.assessmentConfigTitle}
                  </h2>
                </div>
              </div>

              {/* Model visibility stays role-scoped by server-derived access state.
                  Backend request validation remains authoritative; this guard is UI-only. */}
              {promptAccess.isAdmin ? (
                <div className="assessment-model-control">
                  <AssessmentFieldSelect
                    id="assessment-model"
                    label={messages.modelLabel}
                    value={request.modelId}
                    options={modelOptions}
                    icon={Sparkles}
                    error={fieldErrors.modelId}
                    onChange={(nextValue) => {
                      setFieldErrors((current) => ({ ...current, modelId: "" }));
                      setRequest((current) => ({ ...current, modelId: nextValue }));
                    }}
                  />
                  {selectedModel ? (
                    <div className="assessment-model-control__meta">
                      {getAssessmentModelMeta(selectedModel.id, messages).map((chip) => (
                        <span
                          key={`${selectedModel.id}-${chip.label}`}
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${getModelChipClasses(chip.tone)}`}
                        >
                          {chip.label}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div
                  dir="rtl"
                  className="assessment-model-control overflow-hidden border-amber-500/28 bg-[linear-gradient(145deg,rgba(251,191,36,0.14),rgba(245,158,11,0.06))] text-right"
                >
                  {/* Non-admin model lane intentionally remains compact to align with the title rail.
                      Keep this rights/support block short and horizontally efficient across breakpoints. */}
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-amber-500/35 bg-amber-500/16 text-amber-800 dark:text-amber-200">
                      <ShieldCheck className="h-3 w-3" />
                    </span>
                    <div className="min-w-0 w-full space-y-1">
                      {/* Keep this legal-rights sentence on a single line whenever physically possible.
                          Clamp-based sizing and tighter tracking preserve readability while reducing wrap pressure. */}
                      <p className="max-w-full whitespace-normal break-words text-[clamp(0.45rem,0.95vw,0.6rem)] font-semibold leading-tight tracking-[-0.02em] text-foreground sm:whitespace-nowrap">
                        {ASSESSMENT_MODEL_VISIBILITY_COPY.rightsLine}
                      </p>
                      <p className="flex max-w-full items-center gap-1 text-[clamp(0.55rem,0.9vw,0.64rem)] leading-tight text-foreground-muted/82">
                        <HandHeart className="h-3 w-3 shrink-0 text-rose-500 dark:text-rose-300" />
                        <span className="min-w-0 whitespace-normal break-words [overflow-wrap:anywhere]">
                          {ASSESSMENT_MODEL_VISIBILITY_COPY.supportHint}
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <form className="space-y-6" onSubmit={handleSubmit}>
              {/* Daily credit UI mirrors the latest server summary for the signed-in owner.
                  Keep this read-only guidance inside Assessment Studio and preserve the backend
                  route as the only authority for quota enforcement and admin exemption. */}
              <div className="rounded-[1.5rem] border border-emerald-500/12 bg-[linear-gradient(145deg,rgba(16,185,129,0.08),rgba(14,165,233,0.05))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] dark:bg-[linear-gradient(145deg,rgba(16,185,129,0.12),rgba(14,165,233,0.08))]">
                <div className="flex flex-col gap-4">
                  <div className="min-w-0">
                    <p className="field-label mb-0 text-emerald-700 dark:text-emerald-200">
                      {messages.assessmentDailyCreditsTitle}
                    </p>
                    <h3 className="mt-2 text-lg font-semibold text-foreground">
                      {creditSummaryHeading}
                    </h3>
                    <div className="mt-2 space-y-1 text-sm leading-6 text-foreground-muted">
                      <p>{creditSummaryBody}</p>
                      {!creditSummary || creditSummary.isAdminExempt || !creditsExhausted ? null : (
                        <p className="text-[0.92em] text-foreground-muted/90">
                          {messages.assessmentDailyCreditsExhaustedSupportNote}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap gap-2">
                      {totalAvailableChipLabel ? (
                        <span className="inline-flex items-center rounded-full border border-emerald-500/15 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-200">
                          {totalAvailableChipLabel}
                        </span>
                      ) : null}
                      {dailyAvailableChipLabel ? (
                        <span className="inline-flex items-center rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-700 dark:text-sky-200">
                          {dailyAvailableChipLabel}
                        </span>
                      ) : null}
                      {extraAvailableChipLabel ? (
                        <span className="inline-flex items-center rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-700 dark:text-amber-200">
                          {extraAvailableChipLabel}
                        </span>
                      ) : null}
                      {creditSummary?.applies ? (
                        <span className="inline-flex items-center rounded-full border border-border-strong bg-background-strong px-3 py-1 text-xs font-semibold text-foreground-muted">
                          {creditSummary.usedCount}/{creditSummary.dailyLimit}{" "}
                          {messages.assessmentDailyCreditsUsedLabel}
                        </span>
                      ) : null}
                      {creditSourceLabels.map((label) => (
                        <span
                          key={label}
                          className="inline-flex items-center rounded-full border border-border-strong bg-background/70 px-3 py-1 text-xs font-semibold text-foreground-muted"
                        >
                          {label}
                        </span>
                      ))}
                    </div>

                    <div className="flex">
                      <Link
                        href={APP_ROUTES.globalCredits}
                        className="inline-flex items-center rounded-xl border border-border bg-background-elevated/70 px-3 py-2 text-xs font-semibold text-foreground transition hover:border-emerald-500/30 hover:text-emerald-700 dark:hover:text-emerald-200"
                      >
                        {messages.globalCreditsOpenDetailsAction ?? messages.assessmentCreditsOpenDetailsAction}
                      </Link>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-white/10 bg-black/[0.02] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] dark:bg-white/[0.02]">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-200">
                    <BrainCircuit className="h-4 w-4" />
                  </div>
                  <p className="field-label mb-0">{messages.assessmentModeLabel}</p>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {ASSESSMENT_MODE_OPTIONS.map((mode) => {
                    const selected = request.options.mode === mode;

                    return (
                      <button
                        key={mode}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => {
                          setFieldErrors((current) => ({ ...current, mode: "" }));
                          setRequest((current) => ({
                            ...current,
                            options: {
                              ...current.options,
                              mode,
                            },
                          }));
                        }}
                        className={`assessment-type-chip w-full justify-center px-4 text-center ${selected ? "assessment-type-chip--selected" : ""}`}
                      >
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current/20 bg-white/10">
                          {selected ? <Check className="h-3.5 w-3.5" /> : null}
                        </span>
                        {getAssessmentModeLabel(mode, messages)}
                      </button>
                    );
                  })}
                </div>
                {fieldErrors.mode ? (
                  <p className="mt-3 text-sm text-danger">{fieldErrors.mode}</p>
                ) : null}
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <AssessmentFieldSelect
                  id="assessment-count"
                  label={messages.assessmentQuestionCount}
                  value={request.options.questionCount}
                  options={questionCountOptions}
                  icon={Gauge}
                  error={fieldErrors.questionCount}
                  onChange={(nextValue) => {
                    setFieldErrors((current) => ({ ...current, questionCount: "" }));
                    setRequest((current) => ({
                      ...current,
                      options: {
                        ...current.options,
                        questionCount: nextValue,
                      },
                    }));
                  }}
                />

                <AssessmentFieldSelect
                  id="assessment-difficulty"
                  label={messages.assessmentDifficulty}
                  value={request.options.difficulty}
                  options={difficultyOptions}
                  icon={FileText}
                  error={fieldErrors.difficulty}
                  onChange={(nextValue) => {
                    setFieldErrors((current) => ({ ...current, difficulty: "" }));
                    setRequest((current) => ({
                      ...current,
                      options: {
                        ...current.options,
                        difficulty: nextValue,
                      },
                    }));
                  }}
                />

                <AssessmentFieldSelect
                  id="assessment-language"
                  label={messages.assessmentLanguage}
                  value={request.options.language}
                  options={languageOptions}
                  icon={Languages}
                  error={fieldErrors.language}
                  onChange={(nextValue) => {
                    setFieldErrors((current) => ({ ...current, language: "" }));
                    setRequest((current) => ({
                      ...current,
                      options: {
                        ...current.options,
                        language: nextValue,
                      },
                    }));
                  }}
                />
              </div>

              <div className="rounded-[1.5rem] border border-white/10 bg-black/[0.02] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] dark:bg-white/[0.02]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-200">
                      <Layers3 className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="field-label mb-0">{messages.assessmentQuestionTypesLabel}</p>
                    </div>
                  </div>
                  <span className="inline-flex items-center rounded-full border border-emerald-500/15 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-200">
                    {request.options.questionTypes.length}
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {QUESTION_TYPE_OPTIONS.map((type) => {
                    const selected = request.options.questionTypes.includes(type);

                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => {
                          handleToggleQuestionType(type);
                        }}
                        className={`assessment-type-chip ${selected ? "assessment-type-chip--selected" : ""}`}
                      >
                        <span className="flex h-5 w-5 items-center justify-center rounded-full border border-current/20 bg-white/10">
                          {selected ? <Check className="h-3.5 w-3.5" /> : null}
                        </span>
                        {getQuestionTypeLabel(type, messages)}
                      </button>
                    );
                  })}
                </div>
                {fieldErrors.questionTypes ? (
                  <p className="mt-3 text-sm text-danger">{fieldErrors.questionTypes}</p>
                ) : null}
              </div>

              <div className="rounded-[1.5rem] border border-white/10 bg-black/[0.02] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] dark:bg-white/[0.02]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gold/12 text-gold">
                      <Percent className="h-4 w-4" />
                    </div>
                    <p className="field-label mb-0">{messages.assessmentDistributionLabel}</p>
                  </div>
                  <span className="inline-flex items-center rounded-full border border-border-strong bg-background-strong px-3 py-1 text-xs font-semibold text-foreground-muted">
                    {messages.assessmentDistributionTotalLabel} · 100%
                  </span>
                </div>

                <div className="mt-4 grid gap-3">
                  {request.options.questionTypeDistribution.map((entry, index) => {
                    const locked =
                      request.options.questionTypeDistribution.length === 1 ||
                      index === request.options.questionTypeDistribution.length - 1;

                    return (
                      <div
                        key={entry.type}
                        className="rounded-[1.25rem] border border-white/10 bg-background/60 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] dark:bg-background-strong/55"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-foreground">
                                {getQuestionTypeLabel(entry.type, messages)}
                              </span>
                              <span className="inline-flex items-center rounded-full border border-border-strong bg-background-strong px-2.5 py-0.5 text-xs font-semibold text-foreground-muted">
                                {questionTypeCountMap[entry.type] ?? 0} {messages.assessmentQuestionsLabel}
                              </span>
                              {locked ? (
                                <span className="inline-flex items-center rounded-full border border-emerald-500/15 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-200">
                                  {messages.assessmentAutoLabel}
                                </span>
                              ) : null}
                            </div>
                          </div>

                          <div className="relative w-full sm:w-28">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step={1}
                              value={entry.percentage}
                              readOnly={locked}
                              onChange={(event) => {
                                handleDistributionChange(entry.type, event.target.value);
                              }}
                              className="field-control assessment-premium-field pe-8 text-sm font-semibold tabular-nums"
                            />
                            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-foreground-muted">
                              %
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {fieldErrors.questionTypeDistribution ? (
                  <p className="mt-3 text-sm text-danger">
                    {fieldErrors.questionTypeDistribution}
                  </p>
                ) : null}
              </div>

              <div className="rounded-[1.5rem] border border-white/10 bg-black/[0.02] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] dark:bg-white/[0.02]">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="field-label mb-0">{messages.assessmentPromptLabel}</p>
                  <span className="inline-flex items-center rounded-full border border-emerald-500/15 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-200">
                    {messages.assessmentPromptOptionalBadge}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-foreground-muted">
                  {messages.assessmentPromptHelper}
                </p>

                {promptFeatureLocked ? (
                  <div
                    dir="rtl"
                    className="mt-4 rounded-[1.25rem] border border-amber-500/25 bg-[linear-gradient(145deg,rgba(251,191,36,0.1),rgba(245,158,11,0.06))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                  >
                    <div className="flex items-start gap-3 text-right">
                      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-500/35 bg-amber-500/15 text-amber-800 dark:text-amber-200">
                        <LockKeyhole className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 space-y-1">
                        <p className="text-sm font-semibold leading-7 text-foreground">
                          {promptLockPanelCopy.title}
                        </p>
                        <p className="text-sm leading-7 text-foreground-muted">
                          {promptLockPanelCopy.body}
                        </p>
                      </div>
                    </div>

                    {promptUnlockAllowed ? (
                      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                        <label className="space-y-2">
                          <span className="block text-xs font-semibold text-foreground-muted">
                            {ASSESSMENT_PROMPT_LOCK_COPY.passwordLabel}
                          </span>
                          <div className="relative">
                            <input
                              type={unlockPasswordVisible ? "text" : "password"}
                              value={unlockPassword}
                              onChange={(event) => {
                                setUnlockError(null);
                                setUnlockPassword(event.target.value);
                              }}
                              placeholder={ASSESSMENT_PROMPT_LOCK_COPY.passwordPlaceholder}
                              className="field-control assessment-premium-field w-full pl-10"
                              autoComplete="current-password"
                              disabled={unlockPending}
                            />
                            {/* Visibility toggle is UI-only; password verification remains fully
                                server-authoritative through the unlock endpoint. */}
                            <button
                              type="button"
                              onClick={() => {
                                setUnlockPasswordVisible((current) => !current);
                              }}
                              aria-label={
                                unlockPasswordVisible
                                  ? ASSESSMENT_PROMPT_LOCK_COPY.hidePasswordAction
                                  : ASSESSMENT_PROMPT_LOCK_COPY.showPasswordAction
                              }
                              title={
                                unlockPasswordVisible
                                  ? ASSESSMENT_PROMPT_LOCK_COPY.hidePasswordAction
                                  : ASSESSMENT_PROMPT_LOCK_COPY.showPasswordAction
                              }
                              disabled={unlockPending}
                              className="absolute inset-y-0 left-2 inline-flex items-center justify-center text-foreground-muted/90 transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {unlockPasswordVisible ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                        </label>

                        <button
                          type="button"
                          onClick={() => {
                            void handleUnlockPromptFeature();
                          }}
                          disabled={unlockPending}
                          className="assessment-premium-button inline-flex h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold text-white"
                        >
                          {unlockPending
                            ? ASSESSMENT_PROMPT_LOCK_COPY.unlockActionPending
                            : ASSESSMENT_PROMPT_LOCK_COPY.unlockAction}
                        </button>
                      </div>
                    ) : null}

                    {unlockError ? (
                      <p className="mt-3 text-sm leading-6 text-danger">{unlockError}</p>
                    ) : null}
                  </div>
                ) : null}

                {unlockSuccessVisible ? (
                  <div
                    dir="rtl"
                    className={`mt-4 rounded-[1.1rem] border border-emerald-400/30 bg-[linear-gradient(140deg,rgba(16,185,129,0.16),rgba(52,211,153,0.07))] px-4 py-3.5 text-right shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_10px_24px_rgba(16,185,129,0.14)] transition-all duration-500 ease-out ${unlockSuccessEntered ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-[0.98] opacity-0"}`}
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-emerald-500/35 bg-emerald-500/18 text-emerald-800 dark:text-emerald-200">
                        <CheckCircle2 className="h-4.5 w-4.5" />
                      </span>
                      <div className="space-y-1">
                        <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                          <Sparkles className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-200" />
                          <span>{ASSESSMENT_PROMPT_LOCK_COPY.successTitle}</span>
                        </p>
                        <p className="text-sm leading-6 text-foreground-muted/95">
                          {ASSESSMENT_PROMPT_LOCK_COPY.successBody}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}

                <textarea
                  id="assessment-prompt"
                  value={request.prompt}
                  rows={4}
                  placeholder={
                    promptFeatureLocked
                      ? promptLockedPlaceholder
                      : messages.assessmentPromptPlaceholder
                  }
                  onChange={(event) => {
                    setFieldErrors((current) => ({ ...current, prompt: "" }));
                    setRequest((current) => ({ ...current, prompt: event.target.value }));
                  }}
                  disabled={promptFeatureLocked}
                  className={`field-control assessment-premium-field mt-4 min-h-[132px] resize-y ${promptFeatureLocked ? "cursor-not-allowed opacity-70" : ""}`}
                />
                {fieldErrors.prompt ? (
                  <p className="mt-2 text-sm text-danger">{fieldErrors.prompt}</p>
                ) : null}
              </div>

              <div className="space-y-3">
                <AssessmentFieldSelect
                  id="assessment-document"
                  label={messages.documentContextLabel}
                  value={request.documentId || ""}
                  options={documentSelectOptions}
                  icon={FileText}
                  error={fieldErrors.documentId}
                  onChange={(nextValue) => {
                    setFieldErrors((current) => ({ ...current, documentId: "" }));
                    setRequest((current) => ({
                      ...current,
                      documentId: nextValue || undefined,
                    }));
                  }}
                />
                {selectedDocument ? (
                  <div className="rounded-[1.25rem] border border-white/10 bg-background/65 px-4 py-3 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="break-words font-medium text-foreground">
                        {selectedDocument.fileName}
                      </p>
                      {selectedDocument.isActive ? (
                        <span className="inline-flex rounded-full border border-emerald-500/15 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-200">
                          {messages.assessmentActiveLinkedDocument}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-foreground-muted">
                      {linkedDocumentReady
                        ? messages.assessmentLinkReady
                        : messages.assessmentLinkUnavailable}
                    </p>
                  </div>
                ) : null}
              </div>

              {notice ? (
                <div className="rounded-[1.25rem] border border-emerald-500/15 bg-emerald-500/10 px-4 py-3 text-sm text-foreground">
                  <p>{notice}</p>
                  {lastCreatedGeneration && showRetentionNotice ? (
                    <div className="mt-3 rounded-[1rem] border border-sky-500/20 bg-background/65 px-3.5 py-3 text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] sm:text-sm">
                      {/* Keep this retention guidance inside the success notice so it never appears before server commit. */}
                      <div className="flex items-start gap-2.5">
                        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-200">
                          <Timer className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0 space-y-1">
                          <p className="font-semibold text-foreground">
                            {messages.assessmentRetentionNoticeTitle}
                          </p>
                          <p className="leading-6 text-foreground-muted">
                            {messages.assessmentRetentionNoticeBody}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Link
                          href={APP_ROUTES.history}
                          className="inline-flex items-center gap-2 rounded-full border border-sky-500/25 bg-sky-500/10 px-3 py-1.5 font-semibold text-sky-700 transition hover:border-sky-500/35 hover:bg-sky-500/15 dark:text-sky-200"
                        >
                          <History className="h-3.5 w-3.5" />
                          {messages.assessmentRetentionNoticeHistoryAction}
                        </Link>
                      </div>
                    </div>
                  ) : null}
                  {lastCreatedGeneration ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        href={lastCreatedGeneration.previewRoute}
                        className="inline-flex items-center gap-2 rounded-full border border-emerald-500/15 bg-white/70 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-white dark:bg-white/10 dark:text-emerald-100 dark:hover:bg-white/15"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        {messages.assessmentOpenPreview}
                      </Link>
                      <Link
                        href={lastCreatedGeneration.resultRoute}
                        className="inline-flex items-center gap-2 rounded-full border border-emerald-500/15 bg-white/70 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-white dark:bg-white/10 dark:text-emerald-100 dark:hover:bg-white/15"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        {messages.assessmentOpenResult}
                      </Link>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {error ? (
                <div className="rounded-[1.25rem] border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
                  <div className="space-y-3">
                    <p>{error.message}</p>
                    {error.showSupport ? (
                      <AuthSupportDetails
                        label={messages.operationalSupportDetailsLabel}
                        notes={getOperationalSupportNotes(messages)}
                      />
                    ) : null}
                  </div>
                </div>
              ) : null}

              <button
                type="submit"
                disabled={
                  pending ||
                  !creditSummary ||
                  creditsExhausted ||
                  (!request.prompt.trim() && !request.documentId) ||
                  !linkedDocumentReady ||
                  request.options.questionTypes.length === 0
                }
                className="assessment-premium-button flex w-full items-center justify-center gap-3 rounded-[1.2rem] px-6 py-4 font-semibold text-white"
              >
                {pending ? <span className="loading-spinner" /> : <Sparkles className="h-4 w-4" />}
                {pending ? messages.assessmentGenerateWorking : messages.assessmentGenerate}
              </button>
            </form>
          </div>
        </section>

      </div>

      <DocumentContextCard
        messages={messages}
        tone="assessment"
        selectedDocument={selectedDocument}
        latestDocument={latestDocument}
      />

      <section className="surface-strong rounded-[2rem] p-5 sm:p-6 lg:p-8">
        <div className="border-b border-border pb-4">
          <div>
            <p className="section-label">{messages.assessmentHistoryTitle}</p>
            <h3 className="mt-2 font-[family-name:var(--font-display)] text-[1.75rem] font-bold tracking-tight">
              {messages.recentAssessmentsTitle}
            </h3>
          </div>
        </div>
        
        <div className="mt-6">
          {generations.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-background/30 p-8 text-center text-sm font-medium text-foreground-muted">
              {messages.assessmentHistoryEmpty}
            </div>
          ) : (
            <div className="grid gap-3">
              {generations.map((generation, index) => (
                <article
                  key={generation.id}
                  className={`rounded-[1.4rem] border px-5 py-4 transition-all sm:px-6 ${
                    generation.id === latestGeneration?.id
                      ? "border-emerald-500/20 bg-emerald-500/5 shadow-sm"
                      : "border-border bg-background-elevated/80 hover:border-emerald-500/15 hover:shadow-sm"
                  }`}
                >
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-foreground">
                          {generation.title}
                        </p>
                        {index === 0 ? (
                          <span className="inline-flex items-center rounded-full border border-emerald-500/15 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-200">
                            {messages.assessmentGeneratedLabel}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-foreground-muted">
                        {generation.meta.summary}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="inline-flex items-center rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-semibold text-accent">
                          {`${generation.meta.questionCount} ${messages.assessmentQuestionsLabel}`}
                        </span>
                        <span className="inline-flex items-center rounded-full bg-gold/10 px-2.5 py-0.5 text-xs font-semibold text-gold">
                          {getDifficultyLabel(generation.meta.difficulty, messages)}
                        </span>
                        <span className="inline-flex items-center rounded-full border border-border-strong bg-background-strong px-2.5 py-0.5 text-xs font-semibold text-foreground-muted">
                          {getLanguageLabel(generation.meta.language, messages)}
                        </span>
                      </div>
                      <p className="mt-3 text-xs text-foreground-muted">
                        {generation.meta.modelLabel} • {formatAssessmentDate(generation.createdAt, locale)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 xl:max-w-[32rem] xl:justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          void handleRefreshGeneration(generation.id);
                        }}
                        className="inline-flex items-center gap-2 rounded-full border border-border-strong bg-background-strong px-3 py-1.5 text-xs font-semibold text-foreground-muted transition hover:border-emerald-500/30 hover:text-emerald-700 dark:hover:text-emerald-200"
                      >
                        {readbackId === generation.id ? (
                          <span className="loading-spinner h-3.5 w-3.5 border-2" />
                        ) : (
                          <RefreshCcw className="h-3.5 w-3.5" />
                        )}
                        {readbackId === generation.id
                          ? messages.assessmentReadbackLoading
                          : messages.assessmentRefreshAction}
                      </button>
                      <Link
                        href={generation.previewRoute}
                        className="inline-flex items-center gap-2 rounded-full border border-border-strong bg-background-strong px-3 py-1.5 text-xs font-semibold text-foreground transition hover:border-emerald-500/30 hover:text-emerald-700 dark:hover:text-emerald-200"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        {messages.assessmentOpenPreview}
                      </Link>
                      <Link
                        href={generation.resultRoute}
                        className="inline-flex items-center gap-2 rounded-full border border-border-strong bg-background-strong px-3 py-1.5 text-xs font-semibold text-foreground transition hover:border-emerald-500/30 hover:text-emerald-700 dark:hover:text-emerald-200"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        {messages.assessmentOpenResult}
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
