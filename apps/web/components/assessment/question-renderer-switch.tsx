"use client";

import type {
  AssessmentPreviewQuestionItem,
  NormalizedAssessmentPreview,
} from "@/lib/assessment-preview-model";

import { ComparisonRenderer } from "@/components/assessment/renderers/render-comparison";
import { DefinitionRenderer } from "@/components/assessment/renderers/render-definition";
import { FillBlanksRenderer } from "@/components/assessment/renderers/render-fill-blanks";
import { McqRenderer } from "@/components/assessment/renderers/render-mcq";
import { ScientificTermRenderer } from "@/components/assessment/renderers/render-scientific-term";
import { ShortAnswerRenderer } from "@/components/assessment/renderers/render-short-answer";
import { TerminologyRenderer } from "@/components/assessment/renderers/render-terminology";
import { TrueFalseRenderer } from "@/components/assessment/renderers/render-true-false";

interface QuestionRendererSwitchProps {
  question: AssessmentPreviewQuestionItem;
  dark: boolean;
  contentLanguage: NormalizedAssessmentPreview["contentLanguage"];
  answerLabel: string;
  rationaleLabel: string;
}

function resolveRendererVariant(question: AssessmentPreviewQuestionItem) {
  if (question.rendering?.renderVariant) {
    return question.rendering.renderVariant;
  }

  switch (question.questionType) {
    case "mcq":
      return "mcq_card";
    case "true_false":
      return "true_false_card";
    case "definition":
      return "definition_card";
    case "terminology":
      return "terminology_card";
    case "fill_blanks":
      return "fill_blanks_card";
    case "comparison":
      return "comparison_card";
    case "scientific_term":
      return "scientific_term_card";
    default:
      return "short_answer_card";
  }
}

export function QuestionRendererSwitch(props: QuestionRendererSwitchProps) {
  /* Question-type ownership stays modular here on purpose.
     New assessment types should extend this switch with a dedicated renderer file instead of
     pushing more nested conditionals back into the shared preview/result shell. */
  const sharedProps = {
    question: props.question,
    dark: props.dark,
    contentLanguage: props.contentLanguage,
    fallbackAnswerLabel: props.answerLabel,
    rationaleLabel: props.rationaleLabel,
  };

  switch (resolveRendererVariant(props.question)) {
    case "mcq_card":
      return <McqRenderer {...sharedProps} />;
    case "true_false_card":
      return <TrueFalseRenderer {...sharedProps} />;
    case "definition_card":
      return <DefinitionRenderer {...sharedProps} />;
    case "terminology_card":
      return <TerminologyRenderer {...sharedProps} />;
    case "fill_blanks_card":
      return <FillBlanksRenderer {...sharedProps} />;
    case "comparison_card":
      return <ComparisonRenderer {...sharedProps} />;
    case "scientific_term_card":
      return <ScientificTermRenderer {...sharedProps} />;
    default:
      return <ShortAnswerRenderer {...sharedProps} />;
  }
}
