"use client";

import type {
  AssessmentPreviewQuestionItem,
  NormalizedAssessmentPreview,
} from "@/lib/assessment-preview-model";

import { QuestionRendererSwitch } from "@/components/assessment/question-renderer-switch";
import { QuestionSection } from "@/components/assessment/question-section";

interface AssessmentGroupedViewProps {
  questions: AssessmentPreviewQuestionItem[];
  dark: boolean;
  contentLanguage: NormalizedAssessmentPreview["contentLanguage"];
  answerLabel: string;
  rationaleLabel: string;
}

function getQuestionCardTone(dark: boolean) {
  return dark
    ? "border-white/12 bg-[linear-gradient(145deg,rgba(7,18,34,0.48),rgba(4,13,26,0.22))] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_40px_rgba(2,6,23,0.22)] backdrop-blur-xl"
    : "border-white/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.64),rgba(241,249,247,0.42))] shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_16px_34px_rgba(15,23,42,0.08)] backdrop-blur-xl";
}

function buildPageSectionGroups(questions: AssessmentPreviewQuestionItem[]) {
  const groups: Array<{
    key: string;
    heading: string | null;
    questions: AssessmentPreviewQuestionItem[];
  }> = [];

  for (const question of questions) {
    const shouldStartNewGroup = question.startsSection || groups.length === 0;

    if (shouldStartNewGroup) {
      groups.push({
        key: `${question.sectionKey ?? "section"}-${question.id}`,
        heading: question.startsSection ? question.sectionHeading : null,
        questions: [question],
      });
      continue;
    }

    groups[groups.length - 1]!.questions.push(question);
  }

  return groups;
}

export function AssessmentGroupedView(props: AssessmentGroupedViewProps) {
  /* Page-local grouping intentionally follows server-authored section metadata.
     This keeps the preview/result shell aligned with export grouping while allowing a section to
     continue across pages without inventing duplicate headings on every continuation page. */
  const sectionGroups = buildPageSectionGroups(props.questions);

  return (
    <>
      {sectionGroups.map((sectionGroup) => (
        <QuestionSection
          key={sectionGroup.key}
          heading={sectionGroup.heading}
          dark={props.dark}
        >
          {sectionGroup.questions.map((question) => (
            <article
              key={question.id}
              className={`rounded-[1.5rem] border px-[1.26rem] py-[1.2rem] sm:px-[1.46rem] sm:py-[1.36rem] ${getQuestionCardTone(
                props.dark,
              )}`}
            >
              <QuestionRendererSwitch
                question={question}
                dark={props.dark}
                contentLanguage={props.contentLanguage}
                answerLabel={props.answerLabel}
                rationaleLabel={props.rationaleLabel}
              />
            </article>
          ))}
        </QuestionSection>
      ))}
    </>
  );
}
