import {
  AnswerPanel,
  ChoiceList,
  QuestionCardFrame,
  RationalePanel,
  ScienceBlocks,
  SupplementalCopy,
  TagsPanel,
  type QuestionRendererProps,
} from "@/components/assessment/renderers/rendering-primitives";

export function McqRenderer(props: QuestionRendererProps) {
  return (
    <QuestionCardFrame {...props}>
      <ChoiceList question={props.question} dark={props.dark} />
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
