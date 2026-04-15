import { resolveTrueFalseAnswerValue } from "@/lib/assessment-question-display";
import { localizeAssessmentCopy } from "@/lib/assessment-render-copy";

import {
  AnswerPanel,
  QuestionCardFrame,
  RationalePanel,
  ScienceBlocks,
  TagsPanel,
  type QuestionRendererProps,
} from "@/components/assessment/renderers/rendering-primitives";

export function TrueFalseRenderer(props: QuestionRendererProps) {
  const resolvedAnswer = resolveTrueFalseAnswerValue(
    props.question.answerDisplay || props.question.answer,
  );

  return (
    <QuestionCardFrame {...props}>
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          {
            value: "true" as const,
            label: localizeAssessmentCopy(props.contentLanguage, "True", "صح"),
          },
          {
            value: "false" as const,
            label: localizeAssessmentCopy(props.contentLanguage, "False", "خطأ"),
          },
        ].map((option) => {
          const isCorrect = resolvedAnswer === option.value;

          return (
            <div
              key={option.value}
              className={`rounded-[1rem] border px-4 py-4 text-center text-sm font-semibold ${
                isCorrect
                  ? props.dark
                    ? "border-emerald-300/28 bg-emerald-400/10 text-emerald-100"
                    : "border-emerald-300/70 bg-emerald-50/85 text-emerald-800"
                  : props.dark
                    ? "border-white/12 bg-white/[0.045] text-white/76"
                    : "border-white/75 bg-white/72 text-slate-600"
              }`}
            >
              {option.label}
            </div>
          );
        })}
      </div>
      <ScienceBlocks question={props.question} dark={props.dark} />
      <AnswerPanel {...props} />
      <RationalePanel {...props} />
      <TagsPanel question={props.question} dark={props.dark} />
    </QuestionCardFrame>
  );
}
