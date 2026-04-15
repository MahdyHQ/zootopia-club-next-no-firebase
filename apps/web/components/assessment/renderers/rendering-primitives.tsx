import type { ReactNode } from "react";

import { CheckCircle2 } from "lucide-react";

import type {
  AssessmentPreviewQuestionItem,
  NormalizedAssessmentPreview,
} from "@/lib/assessment-preview-model";
import {
  getAssessmentAnswerMissingPlaceholder,
  getAssessmentPromptMissingPlaceholder,
  getTypeAwareAnswerLabel,
  localizeAssessmentCopy,
} from "@/lib/assessment-render-copy";

export interface QuestionRendererProps {
  question: AssessmentPreviewQuestionItem;
  contentLanguage: NormalizedAssessmentPreview["contentLanguage"];
  dark: boolean;
  fallbackAnswerLabel: string;
  rationaleLabel: string;
}

export function safeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function safeList(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => item.trim())
    : [];
}

function getPanelTone(input: {
  dark: boolean;
  accent?: "default" | "emerald" | "amber" | "cyan";
}) {
  if (!input.dark) {
    switch (input.accent) {
      case "emerald":
        return "border-emerald-200/80 bg-emerald-50/70";
      case "amber":
        return "border-amber-200/80 bg-amber-50/75";
      case "cyan":
        return "border-cyan-200/80 bg-cyan-50/75";
      default:
        return "border-white/75 bg-white/72";
    }
  }

  switch (input.accent) {
    case "emerald":
      return "border-emerald-300/20 bg-emerald-400/10";
    case "amber":
      return "border-amber-300/20 bg-amber-400/10";
    case "cyan":
      return "border-cyan-300/20 bg-cyan-400/10";
    default:
      return "border-white/12 bg-white/[0.045]";
  }
}

function getChoiceTone(input: { dark: boolean; isCorrect: boolean }) {
  if (input.isCorrect) {
    return input.dark
      ? "border-emerald-300/28 bg-emerald-400/10 text-white"
      : "border-emerald-300/70 bg-emerald-50/85 text-slate-800";
  }

  return input.dark
    ? "border-white/10 bg-white/[0.04] text-white/85"
    : "border-white/70 bg-white/65 text-slate-700";
}

export function QuestionCardFrame(
  props: QuestionRendererProps & {
    children: ReactNode;
  },
) {
  const { question, contentLanguage, dark, children } = props;
  const prompt =
    safeText(question.stem) ||
    safeText(question.question) ||
    getAssessmentPromptMissingPlaceholder(contentLanguage);
  const typeLabel = safeText(question.typeLabel) || safeText(question.sectionTitle);

  return (
    <div className="space-y-4 break-words">
      <div className="flex flex-wrap items-center gap-2.5">
        <span
          className={`inline-flex min-w-10 items-center justify-center rounded-full px-3 py-1 text-sm font-bold ${
            dark ? "bg-white/10 text-white" : "bg-slate-900/6 text-slate-800"
          }`}
        >
          {question.displayOrder + 1}
        </span>
        {typeLabel ? (
          <span
            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${
              dark ? "bg-cyan-300/12 text-cyan-100" : "bg-cyan-50 text-cyan-800"
            }`}
          >
            {typeLabel}
          </span>
        ) : null}
        {safeText(question.difficultyLabel) ? (
          <span
            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
              dark ? "bg-white/8 text-white/78" : "bg-slate-900/5 text-slate-600"
            }`}
          >
            {localizeAssessmentCopy(
              contentLanguage,
              `Question difficulty: ${question.difficultyLabel}`,
              `صعوبة السؤال: ${question.difficultyLabel}`,
            )}
          </span>
        ) : null}
      </div>

      <h3
        className={`text-[1.02rem] font-semibold leading-8 ${
          dark ? "text-white" : "text-slate-900"
        }`}
      >
        {prompt}
      </h3>

      {children}
    </div>
  );
}

export function InfoPanel(input: {
  title: string;
  dark: boolean;
  accent?: "default" | "emerald" | "amber" | "cyan";
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded-[1.1rem] border px-4 py-3 ${getPanelTone({
        dark: input.dark,
        accent: input.accent,
      })}`}
    >
      <p
        className={`text-[0.7rem] font-semibold uppercase tracking-[0.18em] ${
          input.dark ? "text-white/62" : "text-slate-500"
        }`}
      >
        {input.title}
      </p>
      <div
        className={`mt-2 space-y-2 text-sm leading-7 ${
          input.dark ? "text-white/84" : "text-slate-700"
        }`}
      >
        {input.children}
      </div>
    </div>
  );
}

export function KeyValueGrid(input: {
  dark: boolean;
  items: Array<{ label: string; value: string }>;
}) {
  const items = input.items.filter((item) => safeText(item.value));
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <div
          key={`${item.label}-${item.value}`}
          className={`rounded-[1rem] border px-4 py-3 ${getPanelTone({
            dark: input.dark,
            accent: "cyan",
          })}`}
        >
          <p
            className={`text-[0.7rem] font-semibold uppercase tracking-[0.18em] ${
              input.dark ? "text-white/62" : "text-slate-500"
            }`}
          >
            {item.label}
          </p>
          <p
            className={`mt-2 text-sm leading-7 ${
              input.dark ? "text-white/86" : "text-slate-700"
            }`}
          >
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}

export function ChoiceList(input: {
  question: AssessmentPreviewQuestionItem;
  dark: boolean;
}) {
  if (input.question.choices.length === 0) {
    return null;
  }

  return (
    <div
      className={`grid gap-3 ${
        input.question.choiceLayout === "grid-2x2" ? "md:grid-cols-2" : ""
      }`}
    >
      {input.question.choices.map((choice, index) => (
        <div
          key={`${input.question.id}-choice-${index}`}
          className={`flex items-start gap-3 rounded-[1rem] border px-4 py-3 ${getChoiceTone({
            dark: input.dark,
            isCorrect: choice.isCorrect,
          })}`}
        >
          <span
            className={`inline-flex h-8 min-w-8 items-center justify-center rounded-full text-xs font-bold ${
              choice.isCorrect
                ? input.dark
                  ? "bg-emerald-200/16 text-emerald-100"
                  : "bg-emerald-100 text-emerald-700"
                : input.dark
                  ? "bg-white/10 text-white/78"
                  : "bg-slate-900/6 text-slate-700"
            }`}
          >
            {choice.marker ? `${choice.marker})` : index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-7">
              {safeText(choice.text) || safeText(choice.displayText)}
            </p>
          </div>
          {choice.isCorrect ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function SupplementalCopy(input: {
  question: AssessmentPreviewQuestionItem;
  dark: boolean;
  contentLanguage: NormalizedAssessmentPreview["contentLanguage"];
}) {
  const lines = safeList(input.question.supplementalLines);
  if (lines.length === 0) {
    return null;
  }

  return (
    <InfoPanel
      title={localizeAssessmentCopy(
        input.contentLanguage,
        "Additional context",
        "سياق إضافي",
      )}
      dark={input.dark}
    >
      {lines.map((line, index) => (
        <p key={`${input.question.id}-line-${index}`}>{line}</p>
      ))}
    </InfoPanel>
  );
}

export function ScienceBlocks(input: {
  question: AssessmentPreviewQuestionItem;
  dark: boolean;
}) {
  if (input.question.scienceBlocks.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-3">
      {input.question.scienceBlocks.map((block) => {
        if (block.kind === "value" && safeText(block.value)) {
          return (
            <InfoPanel
              key={`${input.question.id}-${block.key}`}
              title={block.label}
              dark={input.dark}
            >
              <p>{block.value}</p>
            </InfoPanel>
          );
        }

        if (block.kind === "pair") {
          const items = [
            { label: safeText(block.leftLabel) || "Left", value: safeText(block.leftValue) },
            { label: safeText(block.rightLabel) || "Right", value: safeText(block.rightValue) },
          ].filter((item) => item.value);

          if (items.length === 0) {
            return null;
          }

          return (
            <div key={`${input.question.id}-${block.key}`} className="space-y-3">
              <p
                className={`text-[0.7rem] font-semibold uppercase tracking-[0.18em] ${
                  input.dark ? "text-white/62" : "text-slate-500"
                }`}
              >
                {block.label}
              </p>
              <KeyValueGrid dark={input.dark} items={items} />
            </div>
          );
        }

        if (block.kind === "list") {
          const items = safeList(block.items);
          if (items.length === 0) {
            return null;
          }

          return (
            <InfoPanel
              key={`${input.question.id}-${block.key}`}
              title={block.label}
              dark={input.dark}
            >
              {items.map((item, index) => (
                <p key={`${block.key}-${index}`}>
                  <span className="font-semibold">
                    {block.ordered ? `${index + 1}.` : "-"}
                  </span>{" "}
                  {item}
                </p>
              ))}
            </InfoPanel>
          );
        }

        if (block.kind === "pair-list" && block.pairs && block.pairs.length > 0) {
          return (
            <InfoPanel
              key={`${input.question.id}-${block.key}`}
              title={block.label}
              dark={input.dark}
            >
              {block.pairs.map((pair, index) => (
                <p key={`${block.key}-${index}`}>
                  <span className="font-semibold">{pair.left}</span>
                  {" -> "}
                  {pair.right}
                </p>
              ))}
            </InfoPanel>
          );
        }

        return null;
      })}
    </div>
  );
}

export function AnswerPanel(props: QuestionRendererProps) {
  const answerLabel = getTypeAwareAnswerLabel({
    locale: props.contentLanguage,
    questionType: props.question.questionType,
    fallback: props.fallbackAnswerLabel,
  });
  const answer =
    safeText(props.question.answerDisplay) ||
    safeText(props.question.answer) ||
    getAssessmentAnswerMissingPlaceholder(props.contentLanguage);

  return (
    <InfoPanel title={answerLabel} dark={props.dark} accent="emerald">
      <p>{answer}</p>
    </InfoPanel>
  );
}

export function RationalePanel(props: QuestionRendererProps) {
  const rationale = safeText(props.question.rationale);
  if (!rationale) {
    return null;
  }

  return (
    <InfoPanel title={props.rationaleLabel} dark={props.dark}>
      <p>{rationale}</p>
    </InfoPanel>
  );
}

export function TagsPanel(input: {
  question: AssessmentPreviewQuestionItem;
  dark: boolean;
}) {
  const tags = safeList(input.question.tags);
  if (tags.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <span
          key={`${input.question.id}-${tag}`}
          className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${
            input.dark
              ? "border-white/12 bg-white/[0.04] text-white/74"
              : "border-white/75 bg-white/78 text-slate-600"
          }`}
        >
          {tag}
        </span>
      ))}
    </div>
  );
}
