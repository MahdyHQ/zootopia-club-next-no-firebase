import { localizeAssessmentCopy } from "@/lib/assessment-render-copy";

import {
  AnswerPanel,
  KeyValueGrid,
  QuestionCardFrame,
  RationalePanel,
  ScienceBlocks,
  TagsPanel,
  safeList,
  safeText,
  type QuestionRendererProps,
} from "@/components/assessment/renderers/rendering-primitives";

export function TerminologyRenderer(props: QuestionRendererProps) {
  const structured = props.question.structuredData;
  const acceptableVariants = safeList(structured?.acceptableVariants);

  return (
    <QuestionCardFrame {...props}>
      <KeyValueGrid
        dark={props.dark}
        items={[
          {
            label: localizeAssessmentCopy(props.contentLanguage, "Concept", "المفهوم"),
            value: safeText(structured?.concept),
          },
          {
            label: localizeAssessmentCopy(
              props.contentLanguage,
              "Accepted variants",
              "البدائل المقبولة",
            ),
            value: acceptableVariants.join(", "),
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
