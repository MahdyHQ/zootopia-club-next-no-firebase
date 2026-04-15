import { localizeAssessmentCopy } from "@/lib/assessment-render-copy";

import {
  AnswerPanel,
  KeyValueGrid,
  QuestionCardFrame,
  RationalePanel,
  ScienceBlocks,
  TagsPanel,
  safeText,
  type QuestionRendererProps,
} from "@/components/assessment/renderers/rendering-primitives";

export function DefinitionRenderer(props: QuestionRendererProps) {
  const structured = props.question.structuredData;

  return (
    <QuestionCardFrame {...props}>
      <KeyValueGrid
        dark={props.dark}
        items={[
          {
            label: localizeAssessmentCopy(props.contentLanguage, "Target term", "المصطلح الهدف"),
            value: safeText(structured?.expectedTerm) || safeText(structured?.concept),
          },
          {
            label: localizeAssessmentCopy(
              props.contentLanguage,
              "Definition focus",
              "محور التعريف",
            ),
            value: safeText(structured?.target),
          },
        ]}
      />
      <ScienceBlocks question={props.question} dark={props.dark} />
      <AnswerPanel {...props} />
      <RationalePanel {...props} />
      <TagsPanel question={props.question} dark={props.dark} />
    </QuestionCardFrame>
  );
}
