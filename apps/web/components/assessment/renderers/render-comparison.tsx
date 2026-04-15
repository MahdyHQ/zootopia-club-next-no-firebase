import { localizeAssessmentCopy } from "@/lib/assessment-render-copy";

import {
  AnswerPanel,
  InfoPanel,
  KeyValueGrid,
  QuestionCardFrame,
  RationalePanel,
  ScienceBlocks,
  TagsPanel,
  safeList,
  safeText,
  type QuestionRendererProps,
} from "@/components/assessment/renderers/rendering-primitives";

export function ComparisonRenderer(props: QuestionRendererProps) {
  const structured = props.question.structuredData;
  const points = safeList(structured?.comparisonPoints);

  return (
    <QuestionCardFrame {...props}>
      <KeyValueGrid
        dark={props.dark}
        items={[
          {
            label: localizeAssessmentCopy(props.contentLanguage, "Left concept", "المفهوم الأول"),
            value: safeText(structured?.leftEntity) || safeText(structured?.subjectA),
          },
          {
            label: localizeAssessmentCopy(
              props.contentLanguage,
              "Right concept",
              "المفهوم الثاني",
            ),
            value: safeText(structured?.rightEntity) || safeText(structured?.subjectB),
          },
        ]}
      />

      {points.length > 0 ? (
        <InfoPanel
          title={localizeAssessmentCopy(
            props.contentLanguage,
            "Comparison points",
            "نقاط المقارنة",
          )}
          dark={props.dark}
          accent="cyan"
        >
          {points.map((point, index) => (
            <p key={`${props.question.id}-comparison-point-${index}`}>
              <span className="font-semibold">{index + 1}.</span> {point}
            </p>
          ))}
        </InfoPanel>
      ) : null}

      <ScienceBlocks question={props.question} dark={props.dark} />
      <AnswerPanel {...props} />
      <RationalePanel {...props} />
      <TagsPanel question={props.question} dark={props.dark} />
    </QuestionCardFrame>
  );
}
