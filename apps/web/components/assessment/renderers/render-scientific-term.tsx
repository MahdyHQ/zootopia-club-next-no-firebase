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

export function ScientificTermRenderer(props: QuestionRendererProps) {
  const structured = props.question.structuredData;

  return (
    <QuestionCardFrame {...props}>
      <KeyValueGrid
        dark={props.dark}
        items={[
          {
            label: localizeAssessmentCopy(props.contentLanguage, "Concept", "المفهوم"),
            value: safeText(structured?.concept) || safeText(structured?.target),
          },
          {
            label: localizeAssessmentCopy(
              props.contentLanguage,
              "Expected term",
              "المصطلح المتوقع",
            ),
            value: safeText(structured?.expectedTerm),
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
