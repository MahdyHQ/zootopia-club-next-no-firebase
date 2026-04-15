import { countFillBlanks } from "@/lib/assessment-question-display";
import { localizeAssessmentCopy } from "@/lib/assessment-render-copy";

import {
  AnswerPanel,
  InfoPanel,
  QuestionCardFrame,
  RationalePanel,
  TagsPanel,
  safeList,
  type QuestionRendererProps,
} from "@/components/assessment/renderers/rendering-primitives";

export function FillBlanksRenderer(props: QuestionRendererProps) {
  const blankCount = props.question.rendering?.blankCount ?? countFillBlanks(props.question.stem);
  const blankAnswers = safeList(props.question.rendering?.expectedResponses);

  return (
    <QuestionCardFrame {...props}>
      <InfoPanel
        title={localizeAssessmentCopy(props.contentLanguage, "Blank structure", "بنية الفراغات")}
        dark={props.dark}
        accent="amber"
      >
        <p>
          {localizeAssessmentCopy(
            props.contentLanguage,
            `Visible blanks: ${blankCount || 0}`,
            `عدد الفراغات الظاهرة: ${blankCount || 0}`,
          )}
        </p>
      </InfoPanel>

      {blankAnswers.length > 0 ? (
        <div className="flex flex-wrap gap-2.5">
          {blankAnswers.map((answer, index) => (
            <span
              key={`${props.question.id}-blank-${index}`}
              className={`inline-flex rounded-full border px-3 py-1.5 text-sm font-medium ${
                props.dark
                  ? "border-amber-300/24 bg-amber-400/10 text-amber-100"
                  : "border-amber-200 bg-amber-50 text-amber-800"
              }`}
            >
              {`${index + 1}. ${answer}`}
            </span>
          ))}
        </div>
      ) : null}

      <AnswerPanel {...props} />
      <RationalePanel {...props} />
      <TagsPanel question={props.question} dark={props.dark} />
    </QuestionCardFrame>
  );
}
