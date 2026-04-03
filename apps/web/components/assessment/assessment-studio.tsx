"use client";

import {
  ASSESSMENT_MODES,
  ASSESSMENT_QUESTION_TYPES,
  type AiModelDescriptor,
  type ApiFailure,
  type ApiResult,
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
  ChevronDown,
  ExternalLink,
  FileText,
  Gauge,
  Languages,
  Layers3,
  Percent,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";

import type { AppMessages } from "@/lib/messages";

import { DocumentContextCard } from "@/components/document/document-context-card";

type AssessmentStudioProps = {
  locale: Locale;
  messages: AppMessages;
  models: AiModelDescriptor[];
  initialDocuments: DocumentRecord[];
  initialGenerations: AssessmentGeneration[];
  initialActiveDocumentId: string | null;
};

const QUESTION_COUNT_OPTIONS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const ASSESSMENT_MODE_OPTIONS = [...ASSESSMENT_MODES];
const QUESTION_TYPE_OPTIONS = [...ASSESSMENT_QUESTION_TYPES];

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
    modelId: models[0]?.id ?? "gemini-3.1-flash-lite-preview",
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
      return "bg-violet-500/10 text-violet-700 dark:text-violet-200";
  }
}

function getAssessmentModelMeta(modelId: string, messages: AppMessages) {
  switch (modelId) {
    case "gemini-3.1-flash-lite-preview":
      return [
        { label: messages.modelTagDefault, tone: "accent" as const },
        { label: messages.modelTagFast, tone: "muted" as const },
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
    case "gemini-2.5-flash-lite":
      return [
        { label: messages.modelTagFast, tone: "accent" as const },
        { label: messages.modelProviderGoogle, tone: "muted" as const },
      ];
    case "qwen3.5-flash":
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
      return messages.assessmentFieldProviderUnavailable;
    case "ASSESSMENT_PROVIDER_EXECUTION_FAILED":
      return messages.assessmentFieldProviderExecutionFailed;
    case "ASSESSMENT_PROVIDER_RESPONSE_INVALID":
      return messages.assessmentFieldProviderResponseInvalid;
    case "PROFILE_INCOMPLETE":
      return messages.profileCompletionRequiredNotice;
    case "UNAUTHENTICATED":
      return messages.firebaseUnavailable;
    default:
      return error.message || messages.assessmentFieldGenericError;
  }
}

export function AssessmentStudio({
  locale,
  messages,
  models,
  initialDocuments,
  initialGenerations,
  initialActiveDocumentId,
}: AssessmentStudioProps) {
  const [generations, setGenerations] = useState(initialGenerations);
  const [request, setRequest] = useState<AssessmentRequest>(() =>
    createInitialRequest(locale, models, initialActiveDocumentId),
  );
  const [selectedGenerationId, setSelectedGenerationId] = useState<string | null>(
    initialGenerations[0]?.id ?? null,
  );
  const [pending, setPending] = useState(false);
  const [readbackId, setReadbackId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastCreatedGeneration, setLastCreatedGeneration] =
    useState<AssessmentGeneration | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setGenerations(initialGenerations);
    setSelectedGenerationId((current) => {
      if (current && initialGenerations.some((item) => item.id === current)) {
        return current;
      }

      return initialGenerations[0]?.id ?? null;
    });
  }, [initialGenerations]);

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

  const documentOptions = initialDocuments.slice(0, 20);
  const selectedModel =
    models.find((model) => model.id === request.modelId) ?? models[0] ?? null;
  const selectedDocument = documentOptions.find((item) => item.id === request.documentId);
  const latestDocument =
    documentOptions.find((document) => document.isActive) ?? documentOptions[0] ?? null;
  const latestGeneration =
    generations.find((item) => item.id === selectedGenerationId) ?? generations[0] ?? null;
  const linkedDocumentReady = !selectedDocument || selectedDocument.status === "ready";
  const questionTypeCountMap = buildQuestionTypeCountMap(
    request.options.questionCount,
    request.options.questionTypeDistribution,
  );

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

  async function handleSelectGeneration(id: string) {
    setSelectedGenerationId(id);
    setReadbackId(id);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(`/api/assessment/${encodeURIComponent(id)}`);
      const payload = (await response.json()) as ApiResult<AssessmentGeneration>;

      if (!response.ok || !payload.ok) {
        throw new Error(
          resolveAssessmentErrorMessage(payload.ok ? null : payload.error, messages),
        );
      }

      setGenerations((current) => replaceGeneration(current, payload.data));
      setSelectedGenerationId(payload.data.id);
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
    setLastCreatedGeneration(null);
    setFieldErrors({});

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

    try {
      const response = await fetch("/api/assessment", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      });
      const payload = (await response.json()) as ApiResult<AssessmentGeneration>;

      if (!response.ok || !payload.ok) {
        if (!payload.ok && payload.error.fieldErrors) {
          setFieldErrors(payload.error.fieldErrors);
        }

        throw new Error(
          resolveAssessmentErrorMessage(payload.ok ? null : payload.error, messages),
        );
      }

      setGenerations((current) => replaceGeneration(current, payload.data));
      setSelectedGenerationId(payload.data.id);
      setLastCreatedGeneration(payload.data);
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
    <div className="space-y-8 animate-float translate-y-0">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <section className="assessment-premium-panel relative overflow-hidden rounded-[2rem] p-5 shadow-sm sm:p-6 lg:p-8">
          <div className="relative z-10 space-y-6">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-violet-500/20 bg-violet-500/10 text-violet-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] dark:text-violet-200">
                <BrainCircuit className="h-5 w-5" />
              </div>
              <div className="min-w-0 space-y-1">
                <p className="section-label text-violet-600 dark:text-violet-300">
                  {messages.assessmentTitle}
                </p>
                <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-foreground">
                  {messages.assessmentConfigTitle}
                </h2>
              </div>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="group">
                <label
                  htmlFor="assessment-prompt"
                  className="field-label transition-colors group-focus-within:text-violet-600 dark:group-focus-within:text-violet-300"
                >
                  {messages.assessmentPromptLabel}
                </label>
                <textarea
                  id="assessment-prompt"
                  value={request.prompt}
                  required
                  rows={5}
                  placeholder={messages.assessmentPromptPlaceholder}
                  onChange={(event) => {
                    setFieldErrors((current) => ({ ...current, prompt: "" }));
                    setRequest((current) => ({ ...current, prompt: event.target.value }));
                  }}
                  className="field-control assessment-premium-field min-h-[148px] resize-y"
                />
                {fieldErrors.prompt ? (
                  <p className="mt-2 text-sm text-danger">{fieldErrors.prompt}</p>
                ) : null}
              </div>

              <div className="rounded-[1.5rem] border border-white/10 bg-black/[0.02] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] dark:bg-white/[0.02]">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-200">
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
                <div className="group">
                  <label
                    htmlFor="assessment-count"
                    className="field-label transition-colors group-focus-within:text-violet-600 dark:group-focus-within:text-violet-300"
                  >
                    {messages.assessmentQuestionCount}
                  </label>
                  <div className="relative">
                    <select
                      id="assessment-count"
                      value={request.options.questionCount}
                      onChange={(event) => {
                        setFieldErrors((current) => ({ ...current, questionCount: "" }));
                        setRequest((current) => ({
                          ...current,
                          options: {
                            ...current.options,
                            questionCount: Number(event.target.value),
                          },
                        }));
                      }}
                      className="field-control assessment-premium-field appearance-none pe-11"
                    >
                      {QUESTION_COUNT_OPTIONS.map((count) => (
                        <option key={count} value={count}>
                          {count}
                        </option>
                      ))}
                    </select>
                    <Gauge className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-500/70 dark:text-violet-300/80" />
                    <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" />
                  </div>
                  {fieldErrors.questionCount ? (
                    <p className="mt-2 text-sm text-danger">{fieldErrors.questionCount}</p>
                  ) : null}
                </div>

                <div className="group">
                  <label
                    htmlFor="assessment-difficulty"
                    className="field-label transition-colors group-focus-within:text-violet-600 dark:group-focus-within:text-violet-300"
                  >
                    {messages.assessmentDifficulty}
                  </label>
                  <div className="relative">
                    <select
                      id="assessment-difficulty"
                      value={request.options.difficulty}
                      onChange={(event) => {
                        setFieldErrors((current) => ({ ...current, difficulty: "" }));
                        setRequest((current) => ({
                          ...current,
                          options: {
                            ...current.options,
                            difficulty: event.target.value as AssessmentDifficulty,
                          },
                        }));
                      }}
                      className="field-control assessment-premium-field appearance-none pe-11"
                    >
                      <option value="easy">{messages.difficultyEasy}</option>
                      <option value="medium">{messages.difficultyMedium}</option>
                      <option value="hard">{messages.difficultyHard}</option>
                    </select>
                    <FileText className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-500/70 dark:text-violet-300/80" />
                    <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" />
                  </div>
                  {fieldErrors.difficulty ? (
                    <p className="mt-2 text-sm text-danger">{fieldErrors.difficulty}</p>
                  ) : null}
                </div>

                <div className="group">
                  <label
                    htmlFor="assessment-language"
                    className="field-label transition-colors group-focus-within:text-violet-600 dark:group-focus-within:text-violet-300"
                  >
                    {messages.assessmentLanguage}
                  </label>
                  <div className="relative">
                    <select
                      id="assessment-language"
                      value={request.options.language}
                      onChange={(event) => {
                        setFieldErrors((current) => ({ ...current, language: "" }));
                        setRequest((current) => ({
                          ...current,
                          options: {
                            ...current.options,
                            language: event.target.value as Locale,
                          },
                        }));
                      }}
                      className="field-control assessment-premium-field appearance-none pe-11"
                    >
                      <option value="en">{messages.localeEnglish}</option>
                      <option value="ar">{messages.localeArabic}</option>
                    </select>
                    <Languages className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-500/70 dark:text-violet-300/80" />
                    <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" />
                  </div>
                  {fieldErrors.language ? (
                    <p className="mt-2 text-sm text-danger">{fieldErrors.language}</p>
                  ) : null}
                </div>

                <div className="group">
                  <label
                    htmlFor="assessment-model"
                    className="field-label transition-colors group-focus-within:text-violet-600 dark:group-focus-within:text-violet-300"
                  >
                    {messages.modelLabel}
                  </label>
                  <div className="relative">
                    <select
                      id="assessment-model"
                      value={request.modelId}
                      onChange={(event) => {
                        setFieldErrors((current) => ({ ...current, modelId: "" }));
                        setRequest((current) => ({ ...current, modelId: event.target.value }));
                      }}
                      className="field-control assessment-premium-field appearance-none pe-11 font-mono text-sm"
                    >
                      {models.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.label}
                        </option>
                      ))}
                    </select>
                    <Sparkles className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-500/70 dark:text-violet-300/80" />
                    <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" />
                  </div>
                  {selectedModel ? (
                    <div className="mt-3 flex flex-wrap gap-2">
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
                  {fieldErrors.modelId ? (
                    <p className="mt-2 text-sm text-danger">{fieldErrors.modelId}</p>
                  ) : null}
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-white/10 bg-black/[0.02] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] dark:bg-white/[0.02]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-200">
                      <Layers3 className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="field-label mb-0">{messages.assessmentQuestionTypesLabel}</p>
                    </div>
                  </div>
                  <span className="inline-flex items-center rounded-full border border-violet-500/15 bg-violet-500/10 px-3 py-1 text-xs font-semibold text-violet-700 dark:text-violet-200">
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
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gold/10 text-gold">
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
                                <span className="inline-flex items-center rounded-full border border-violet-500/15 bg-violet-500/10 px-2.5 py-0.5 text-xs font-semibold text-violet-700 dark:text-violet-200">
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

              <div className="group">
                <label
                  htmlFor="assessment-document"
                  className="field-label transition-colors group-focus-within:text-violet-600 dark:group-focus-within:text-violet-300"
                >
                  {messages.documentContextLabel}
                </label>
                <div className="relative">
                  <select
                    id="assessment-document"
                    value={request.documentId || ""}
                    onChange={(event) => {
                      setFieldErrors((current) => ({ ...current, documentId: "" }));
                      setRequest((current) => ({
                        ...current,
                        documentId: event.target.value || undefined,
                      }));
                    }}
                    className="field-control assessment-premium-field appearance-none pe-11"
                  >
                    <option value="">{messages.noLinkedDocument}</option>
                    {documentOptions.map((document) => (
                      <option key={document.id} value={document.id}>
                        {`${document.fileName} - ${getDocumentStatusLabel(document.status, messages)}${document.isActive ? ` - ${messages.assessmentActiveLinkedDocument}` : ""}`}
                      </option>
                    ))}
                  </select>
                  <FileText className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-500/70 dark:text-violet-300/80" />
                  <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" />
                </div>
                {selectedDocument ? (
                  <div className="mt-3 rounded-[1.25rem] border border-white/10 bg-background/65 px-4 py-3 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="break-words font-medium text-foreground">
                        {selectedDocument.fileName}
                      </p>
                      {selectedDocument.isActive ? (
                        <span className="inline-flex rounded-full border border-violet-500/15 bg-violet-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-violet-700 dark:text-violet-200">
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
                {fieldErrors.documentId ? (
                  <p className="mt-2 text-sm text-danger">{fieldErrors.documentId}</p>
                ) : null}
              </div>

              {notice ? (
                <div className="rounded-[1.25rem] border border-violet-500/15 bg-violet-500/10 px-4 py-3 text-sm text-foreground">
                  <p>{notice}</p>
                  {lastCreatedGeneration ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        href={lastCreatedGeneration.previewRoute}
                        className="inline-flex items-center gap-2 rounded-full border border-violet-500/15 bg-white/70 px-3 py-1.5 text-xs font-semibold text-violet-700 transition hover:bg-white dark:bg-white/10 dark:text-violet-100 dark:hover:bg-white/15"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        {messages.assessmentOpenPreview}
                      </Link>
                      <Link
                        href={lastCreatedGeneration.resultRoute}
                        className="inline-flex items-center gap-2 rounded-full border border-violet-500/15 bg-white/70 px-3 py-1.5 text-xs font-semibold text-violet-700 transition hover:bg-white dark:bg-white/10 dark:text-violet-100 dark:hover:bg-white/15"
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
                  !request.prompt.trim() ||
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

        <section className="flex flex-col rounded-[2rem] border border-white/10 bg-background-elevated/90 p-5 shadow-sm backdrop-blur-xl sm:p-6 lg:p-8">
          <p className="section-label">{messages.assessmentLatestTitle}</p>

          <div className="mt-6 flex-1">
            {pending && !latestGeneration ? (
              <div className="rounded-2xl border border-dashed border-border bg-background/30 p-8 text-center">
                <div className="mx-auto h-10 w-10 loading-spinner" />
                <p className="mt-4 font-semibold text-foreground">
                  {messages.assessmentLoadingTitle}
                </p>
                <p className="mt-1 text-sm text-foreground-muted">
                  {messages.assessmentLoadingBody}
                </p>
              </div>
            ) : latestGeneration ? (
              <div className="space-y-5">
                <div>
                  <h3 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-foreground">
                    {latestGeneration.title}
                  </h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="inline-flex items-center rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-semibold text-accent">
                      {`${latestGeneration.meta.questionCount} ${messages.assessmentQuestionsLabel}`}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-gold/10 px-2.5 py-0.5 text-xs font-semibold text-gold">
                      {getDifficultyLabel(latestGeneration.meta.difficulty, messages)}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-border-strong bg-background-strong px-2.5 py-0.5 text-xs font-semibold text-foreground-muted">
                      {getLanguageLabel(latestGeneration.meta.language, messages)}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-foreground-muted">
                    {latestGeneration.meta.summary}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      href={latestGeneration.previewRoute}
                      className="inline-flex items-center gap-2 rounded-full border border-border-strong bg-background-strong px-3 py-1.5 text-xs font-semibold text-foreground transition hover:border-accent hover:text-accent"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      {messages.assessmentOpenPreview}
                    </Link>
                    <Link
                      href={latestGeneration.resultRoute}
                      className="inline-flex items-center gap-2 rounded-full border border-border-strong bg-background-strong px-3 py-1.5 text-xs font-semibold text-foreground transition hover:border-accent hover:text-accent"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      {messages.assessmentOpenResult}
                    </Link>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-border bg-background-strong p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-foreground-muted">
                      {messages.assessmentPromptPreviewLabel}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-foreground">
                      {latestGeneration.meta.promptPreview || messages.assessmentNoPromptPreview}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border bg-background-strong p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-foreground-muted">
                      {messages.assessmentSourceDocument}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-foreground">
                      {latestGeneration.meta.sourceDocument?.fileName || messages.noLinkedDocument}
                    </p>
                    <p className="mt-1 text-xs text-foreground-muted">
                      {latestGeneration.meta.modelLabel} • {formatAssessmentDate(latestGeneration.createdAt, locale)}
                    </p>
                  </div>
                </div>

                <div className="side-scrollbar space-y-4 max-h-[500px] overflow-y-auto pr-2">
                  {latestGeneration.questions.map((question, index) => (
                    <article
                      key={`${latestGeneration.id}-${question.id}`}
                      className="rounded-[1.5rem] border border-border-strong bg-background-strong p-5"
                    >
                      <div className="flex items-start gap-4">
                        <div className="flex shrink-0 flex-col items-center gap-2">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">
                            {index + 1}
                          </span>
                          {question.type ? (
                            <span className="inline-flex items-center rounded-full border border-violet-500/15 bg-violet-500/10 px-2 py-0.5 text-[11px] font-semibold text-violet-700 dark:text-violet-200">
                              {getQuestionTypeLabel(question.type, messages)}
                            </span>
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1 space-y-3">
                          <p className="whitespace-pre-wrap text-[0.95rem] font-semibold leading-relaxed text-foreground">
                            {question.question}
                          </p>
                          <div className="rounded-xl border border-border bg-foreground-muted/5 p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-foreground-muted">
                              {messages.assessmentAnswerLabel}
                            </p>
                            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground-muted">
                              {question.answer}
                            </p>
                          </div>
                          {question.rationale ? (
                            <p className="text-sm leading-6 text-foreground-muted">
                              <span className="font-semibold text-foreground">
                                {`${messages.assessmentRationaleLabel}: `}
                              </span>
                              {question.rationale}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-border p-8 text-center bg-background/30">
                <p className="font-medium text-foreground-muted">{messages.assessmentEmpty}</p>
                <p className="text-sm text-foreground-muted/70 mt-1 max-w-[280px]">
                  {messages.assessmentEmptyStateBody}
                </p>
              </div>
            )}
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
              {generations.map((generation) => (
                <button
                  key={generation.id}
                  type="button"
                  onClick={() => {
                    void handleSelectGeneration(generation.id);
                  }}
                  className={`group flex w-full flex-col justify-between gap-4 rounded-xl border px-6 py-4 text-start transition-all md:flex-row md:items-center ${
                    generation.id === latestGeneration?.id
                      ? "border-accent bg-accent/5 shadow-sm"
                      : "border-border bg-background-elevated hover:border-accent hover:shadow-sm"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground group-hover:text-accent transition-colors">
                      {generation.title}
                    </p>
                    <p className="mt-1 text-sm text-foreground-muted">
                      {generation.meta.summary}
                    </p>
                    <p className="mt-2 text-xs text-foreground-muted">
                      {`${generation.meta.questionCount} ${messages.assessmentQuestionsLabel} • ${getLanguageLabel(generation.meta.language, messages)} • ${formatAssessmentDate(generation.createdAt, locale)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {readbackId === generation.id ? (
                      <span className="inline-flex items-center gap-2 rounded-full border border-border-strong bg-background-strong px-3 py-1 text-xs font-semibold text-foreground-muted">
                        <span className="loading-spinner h-3.5 w-3.5 border-2" />
                        {messages.assessmentReadbackLoading}
                      </span>
                    ) : null}
                    <span className="inline-flex w-fit items-center rounded-full border border-border-strong bg-background-strong px-3 py-1 font-mono text-xs text-foreground-muted">
                      {generation.meta.modelLabel}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
