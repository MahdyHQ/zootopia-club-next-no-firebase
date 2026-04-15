import {
  AnswerPanel,
  QuestionCardFrame,
  RationalePanel,
  ScienceBlocks,
  SupplementalCopy,
  TagsPanel,
  type QuestionRendererProps,
} from "@/components/assessment/renderers/rendering-primitives";

export function ShortAnswerRenderer(props: QuestionRendererProps) {
  return (
    <QuestionCardFrame {...props}>
      <SupplementalCopy
        question={props.question}
        dark={props.dark}
        contentLanguage={props.contentLanguage}
      />
      <ScienceBlocks question={props.question} dark={props.dark} />
      <AnswerPanel {...props} />
      <RationalePanel {...props} />
      <TagsPanel question={props.question} dark={props.dark} />
    </QuestionCardFrame>
  );
}
