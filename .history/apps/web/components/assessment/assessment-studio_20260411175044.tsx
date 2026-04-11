"use client";

import { APP_ROUTES } from "@zootopia/shared-config";
import {
  ASSESSMENT_MODES,
  ASSESSMENT_QUESTION_TYPES,
  type AiModelDescriptor,
  type ApiFailure,
  type ApiResult,
  type AssessmentCreateResponse,
  type AssessmentDailyCreditsSummary,
  type AssessmentDifficulty,
  type AssessmentGeneration,
  type AssessmentMode,
  type AssessmentQuestionType,
  type AssessmentQuestionTypeDistribution,
  type AssessmentRequest,
  type DocumentRecord,
  type Locale,
} from "@zootopia/shared-types";
import {
  BrainCircuit,
  Check,
  ExternalLink,
  FileText,
  Gauge,
  History,
  Languages,
  Layers3,
  Percent,
  RefreshCcw,
  Sparkles,
  Timer,
} from "lucide-react";
import Link from "next/link";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";

import type { AppMessages } from "@/lib/messages";
import { dispatchAssessmentCreditRefresh } from "@/lib/assessment-credit-events";

import { AssessmentFieldSelect } from "@/components/assessment/assessment-field-select";
import { DocumentContextCard } from "@/components/document/document-context-card";

type AssessmentStudioProps = {
  locale: Locale;
  messages: AppMessages;
  models: AiModelDescriptor[];
  initialDocuments: DocumentRecord[];
  initialGenerations: AssessmentGeneration[];
  initialActiveDocumentId: string | null;
  initialCreditSummary: AssessmentDailyCreditsSummary;
};

const QUESTION_COUNT_OPTIONS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const ASSESSMENT_MODE_OPTIONS = [...ASSESSMENT_MODES];
const QUESTION_TYPE_OPTIONS = [...ASSESSMENT_QUESTION_TYPES];
const RETENTION_NOTICE_AUTO_DISMISS_MS = 60_000;

type AssessmentModelTone = "accent" | "gold" | "muted";

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
  models: AiModelDescriptor[],
  initialDocumentId: string | null,
): AssessmentRequest {
  const questionTypes: AssessmentQuestionType[] = ["mcq"];
  return {
    prompt: "",
    modelId: models[0]?.id ?? "qwen3.5-flash",
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
      return messages.assessmentFieldProviderUnavailable;
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
      return messages.assessmentAccessDisabledBody;
    case "ASSESSMENT_FINALIZATION_FAILED":
      return messages.assessmentFinalizationFailed;
    case "PROFILE_INCOMPLETE":
      return messages.profileCompletionRequiredNotice;
    case "UNAUTHENTICATED":
      return messages.supabaseAuthUnavailable;
    default:
      return error.message || messages.assessmentFieldGenericError;
  }
}

function isAssessmentDailyCreditsExhausted(credits: AssessmentDailyCreditsSummary) {
  return credits.applies && credits.remainingCount === 0;
}

export function AssessmentStudio({
  locale,
  messages,
  models,
  initialDocuments,
  initialGenerations,
  initialActiveDocumentId,
  initialCreditSummary,
}: AssessmentStudioProps) {
  const [generations, setGenerations] = useState(initialGenerations);
  const [creditSummary, setCreditSummary] = useState(initialCreditSummary);
  const [request, setRequest] = useState<AssessmentRequest>(() =>
    createInitialRequest(locale, models, initialActiveDocumentId),
  );
  const [pending, setPending] = useState(false);
  const [readbackId, setReadbackId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastCreatedGeneration, setLastCreatedGeneration] =
    useState<AssessmentGeneration | null>(null);
  const [showRetentionNotice, setShowRetentionNotice] = useState(false);
  const retentionNoticeGenerationIdRef = useRef<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setGenerations(initialGenerations);
  }, [initialGenerations]);

  useEffect(() => {
    setCreditSummary(initialCreditSummary);
  }, [initialCreditSummary]);

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
  const creditsExhausted = isAssessmentDailyCreditsExhausted(creditSummary);
  const linkedDocumentReady = !selectedDocument || selectedDocument.status === "ready";
  const questionTypeCountMap = buildQuestionTypeCountMap(
    request.options.questionCount,
    request.options.questionTypeDistribution,
  );
  const questionCountOptions = QUESTION_COUNT_OPTIONS.map((count) => ({
    value: count,
    label: `${count} ${messages.assessmentQuestionsLabel}`,
  }));
  const difficultyOptions = [
    { value: "easy" as const, label: messages.difficultyEasy },
    { value: "medium" as const, label: messages.difficultyMedium },
    { value: "hard" as const, label: messages.difficultyHard },
  ];
  const languageOptions = [
    { value: "en" as const, label: messages.localeEnglish },
    { value: "ar" as const, label: messages.localeArabic },
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

  async function handleRefreshGeneration(id: string) {
    setReadbackId(id);
    setError(null);
    setNotice(null);
    setShowRetentionNotice(false);

    try {
      const response = await fetch(`/api/assessment/${encodeURIComponent(id)}`);
      const payload = (await response.json()) as ApiResult<AssessmentGeneration>;

      if (!response.ok || !payload.ok) {
        throw new Error(
          resolveAssessmentErrorMessage(payload.ok ? null : payload.error, messages),
        );
      }

      setGenerations((current) => replaceGeneration(current, payload.data));
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : messages.assessmentReadbackFailed,
      );
    } finally {
      setReadbackId(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);
    setShowRetentionNotice(false);
    setLastCreatedGeneration(null);
    setFieldErrors({});

    // This is only a user-friendly local stop. The real exhausted-limit enforcement lives on the
    // server route so duplicate tabs, retried requests, and direct API calls stay constrained.
    if (creditsExhausted) {
      setError(messages.assessmentDailyCreditsExhaustedBody);
      setPending(false);
      return;
    }

    if (selectedDocument && !linkedDocumentReady) {
      setFieldErrors({ documentId: messages.assessmentFieldDocumentNotReady });
      setPending(false);
      return;
    }

    if (request.options.questionTypes.length === 0) {
      setFieldErrors({ questionTypes: messages.assessmentQuestionTypesRequired });
      setPending(false);
      return;
    }

    if (
      request.options.questionTypeDistribution.reduce(
        (total, entry) => total + entry.percentage,
        0,
      ) !== 100
    ) {
      setFieldErrors({
        questionTypeDistribution: messages.assessmentDistributionInvalid,
      });
      setPending(false);
      return;
    }

    // The prompt now acts as an optional steering note. We still block empty-content submissions
    // so Assessment always has either user intent text or a linked server-owned document to work from.
    if (!request.prompt.trim() && !request.documentId) {
      setFieldErrors({
        prompt: messages.assessmentPromptOrDocumentRequired,
        documentId: messages.assessmentPromptOrDocumentRequired,
      });
      setPending(false);
      return;
    }

    try {
      const response = await fetch("/api/assessment", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      });
      const payload = (await response.json()) as ApiResult<AssessmentCreateResponse>;

      if (!response.ok || !payload.ok) {
        if (!payload.ok && payload.error.fieldErrors) {
          setFieldErrors(payload.error.fieldErrors);
        }

        if (!payload.ok && payload.error.code === "ASSESSMENT_DAILY_CREDITS_EXHAUSTED") {
          setCreditSummary((current) =>
            current.applies
              ? {
                  ...current,
                  remainingCount: 0,
                  usedCount: current.dailyLimit,
                }
              : current,
          );
          dispatchAssessmentCreditRefresh();
        }

        throw new Error(
          resolveAssessmentErrorMessage(payload.ok ? null : payload.error, messages),
        );
      }

      setGenerations((current) => replaceGeneration(current, payload.data.generation));
      setLastCreatedGeneration(payload.data.generation);
      setCreditSummary(payload.data.credits);
      dispatchAssessmentCreditRefresh();
      setNotice(messages.assessmentRequestSaved);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : messages.assessmentFieldGenericError,
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-6">
        <section className="assessment-premium-panel relative isolate overflow-visible rounded-[2rem] p-5 shadow-sm sm:p-6 lg:p-8">
          <div className="relative z-10 space-y-6">
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

            <form className="space-y-6" onSubmit={handleSubmit}>
              {/* Daily credit UI mirrors the latest server summary for the signed-in owner.
                  Keep this read-only guidance inside Assessment Studio and preserve the backend
                  route as the only authority for quota enforcement and admin exemption. */}
              <div className="rounded-[1.5rem] border border-emerald-500/12 bg-[linear-gradient(145deg,rgba(16,185,129,0.08),rgba(14,165,233,0.05))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] dark:bg-[linear-gradient(145deg,rgba(16,185,129,0.12),rgba(14,165,233,0.08))]">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="field-label mb-0 text-emerald-700 dark:text-emerald-200">
                      {messages.assessmentDailyCreditsTitle}
                    </p>
                    <h3 className="mt-2 text-lg font-semibold text-foreground">
                      {creditSummary.isAdminExempt
                        ? messages.assessmentDailyCreditsAdminExemptTitle
                        : creditsExhausted
                          ? messages.assessmentDailyCreditsExhaustedTitle
                          : `${creditSummary.remainingCount} ${messages.assessmentDailyCreditsRemainingLabel}`}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-foreground-muted">
                      {creditSummary.isAdminExempt
                        ? messages.assessmentDailyCreditsAdminExemptBody
                        : creditsExhausted
                          ? messages.assessmentDailyCreditsExhaustedInline
                          : messages.assessmentDailyCreditsRenewsTomorrow}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    <span className="inline-flex items-center rounded-full border border-emerald-500/15 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-200">
                      {creditSummary.dailyLimit} {messages.assessmentDailyCreditsLimitLabel}
                    </span>
                    {creditSummary.applies ? (
                      <span className="inline-flex items-center rounded-full border border-border-strong bg-background-strong px-3 py-1 text-xs font-semibold text-foreground-muted">
                        {creditSummary.usedCount}/{creditSummary.dailyLimit}{" "}
                        {messages.assessmentDailyCreditsUsedLabel}
                      </span>
                    ) : null}
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

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
              </div>
              {selectedModel ? (
                <div className="-mt-1 flex flex-wrap gap-2">
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
                <textarea
                  id="assessment-prompt"
                  value={request.prompt}
                  rows={4}
                  placeholder={messages.assessmentPromptPlaceholder}
                  onChange={(event) => {
                    setFieldErrors((current) => ({ ...current, prompt: "" }));
                    setRequest((current) => ({ ...current, prompt: event.target.value }));
                  }}
                  className="field-control assessment-premium-field mt-4 min-h-[132px] resize-y"
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
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={
                  pending ||
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
