import "server-only";

import type { NormalizedAssessmentPreview } from "@/lib/assessment-preview-model";
import {
  countFillBlanks,
  extractMatchingPairs,
  resolveTrueFalseAnswerValue,
  splitMultipleResponseAnswers,
} from "@/lib/assessment-question-display";

import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableBorders,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

export function buildAssessmentJsonExport(preview: NormalizedAssessmentPreview) {
  return JSON.stringify(preview, null, 2);
}

export function buildAssessmentMarkdownExport(preview: NormalizedAssessmentPreview) {
  return preview.markdownExport;
}

function buildChoiceRuns(marker: string | null, text: string) {
  return [
    new TextRun({
      text: marker ? `${marker}) ` : "• ",
      bold: true,
      color: "0f766e",
    }),
    new TextRun({
      text,
    }),
  ];
}

function buildChoiceParagraph(input: {
  marker: string | null;
  text: string;
  alignment: (typeof AlignmentType)[keyof typeof AlignmentType];
  isRtl: boolean;
}) {
  return new Paragraph({
    alignment: input.alignment,
    bidirectional: input.isRtl,
    indent: input.isRtl
      ? {
          right: 360,
        }
      : {
          left: 360,
        },
    spacing: {
      after: 80,
    },
    children: buildChoiceRuns(input.marker, input.text),
  });
}

function buildChoiceTable(input: {
  choices: NormalizedAssessmentPreview["questions"][number]["choices"];
  alignment: (typeof AlignmentType)[keyof typeof AlignmentType];
  isRtl: boolean;
}) {
  /* DOCX exports mirror the shared preview/PDF MCQ layout for compact four-choice questions.
     Keep this as a display-only table layer so future agents do not push answer choices back into
     the question stem or replace the current lightweight docx export path with ad-hoc formatting. */
  return new Table({
    alignment: input.alignment,
    visuallyRightToLeft: input.isRtl,
    layout: TableLayoutType.FIXED,
    width: {
      size: 100,
      type: WidthType.PERCENTAGE,
    },
    columnWidths: [4500, 4500],
    borders: TableBorders.NONE,
    rows: [0, 2].map(
      (startIndex) =>
        new TableRow({
          children: [0, 1].map((offset) => {
            const choice = input.choices[startIndex + offset];

            return new TableCell({
              width: {
                size: 50,
                type: WidthType.PERCENTAGE,
              },
              margins: {
                top: 90,
                bottom: 90,
                left: 120,
                right: 120,
              },
              shading: {
                fill: "F8FAFC",
              },
              borders: {
                top: {
                  color: "D6E2EF",
                  size: 1,
                  style: "single",
                },
                bottom: {
                  color: "D6E2EF",
                  size: 1,
                  style: "single",
                },
                left: {
                  color: "D6E2EF",
                  size: 1,
                  style: "single",
                },
                right: {
                  color: "D6E2EF",
                  size: 1,
                  style: "single",
                },
              },
              children: choice
                ? [
                    new Paragraph({
                      alignment: input.alignment,
                      bidirectional: input.isRtl,
                      spacing: {
                        line: 300,
                      },
                      children: buildChoiceRuns(choice.marker, choice.text),
                    }),
                  ]
                : [new Paragraph({})],
            });
          }),
        }),
    ),
  });
}

function localizeCopy(locale: NormalizedAssessmentPreview["locale"], en: string, ar: string) {
  return locale === "ar" ? ar : en;
}

function buildTypeAwareDocxDetails(input: {
  preview: NormalizedAssessmentPreview;
  question: NormalizedAssessmentPreview["questions"][number];
  alignment: (typeof AlignmentType)[keyof typeof AlignmentType];
  isRtl: boolean;
}) {
  const lines: string[] = [];

  switch (input.question.questionType) {
    case "true_false": {
      const value = resolveTrueFalseAnswerValue(
        input.question.answerDisplay || input.question.answer,
      );
      if (value) {
        lines.push(
          `${localizeCopy(input.preview.locale, "Resolved True/False", "قيمة صح / خطأ")}: ${
            value === "true"
              ? localizeCopy(input.preview.locale, "True", "صح")
              : localizeCopy(input.preview.locale, "False", "خطأ")
          }`,
        );
      }
      break;
    }
    case "fill_blanks": {
      const blankCount = countFillBlanks(input.question.stem);
      if (blankCount > 0) {
        lines.push(
          `${localizeCopy(input.preview.locale, "Blank count", "عدد الفراغات")}: ${blankCount}`,
        );
      }
      break;
    }
    case "matching": {
      const pairs = extractMatchingPairs(input.question.answerDisplay || input.question.answer);
      if (pairs.length > 0) {
        lines.push(localizeCopy(input.preview.locale, "Matching pairs", "أزواج التوصيل"));
        lines.push(...pairs.map((pair) => `- ${pair.left} -> ${pair.right}`));
      }
      break;
    }
    case "multiple_response": {
      const resolvedAnswers = input.question.choices
        .filter((choice) => choice.isCorrect)
        .map((choice) => choice.displayText);
      const fallbackAnswers = splitMultipleResponseAnswers(
        input.question.answerDisplay || input.question.answer,
      );
      const answers = resolvedAnswers.length > 0 ? resolvedAnswers : fallbackAnswers;

      if (answers.length > 0) {
        lines.push(
          `${localizeCopy(input.preview.locale, "Resolved correct options", "الخيارات الصحيحة")}: ${answers.join(
            ", ",
          )}`,
        );
      }
      break;
    }
    default:
      break;
  }

  return lines.map(
    (line) =>
      new Paragraph({
        alignment: input.alignment,
        bidirectional: input.isRtl,
        children: [
          new TextRun({
            text: line,
          }),
        ],
      }),
  );
}

function buildScienceDocxDetails(input: {
  question: NormalizedAssessmentPreview["questions"][number];
  alignment: (typeof AlignmentType)[keyof typeof AlignmentType];
  isRtl: boolean;
}) {
  const paragraphs: Paragraph[] = [];

  /* DOCX should preserve the same science-type structure semantics as preview/PDF surfaces.
     Keep this mapper centralized so sequence/comparison/cause-effect formatting does not regress
     into one generic answer paragraph when new question types coexist in the same export. */
  for (const block of input.question.scienceBlocks) {
    switch (block.kind) {
      case "value": {
        if (!block.value) {
          break;
        }

        paragraphs.push(
          new Paragraph({
            alignment: input.alignment,
            bidirectional: input.isRtl,
            children: [
              new TextRun({
                text: `${block.label}: `,
                bold: true,
              }),
              new TextRun(block.value),
            ],
          }),
        );
        break;
      }
      case "pair": {
        paragraphs.push(
          new Paragraph({
            alignment: input.alignment,
            bidirectional: input.isRtl,
            children: [
              new TextRun({
                text: `${block.label}:`,
                bold: true,
              }),
            ],
          }),
        );

        if (block.leftValue) {
          paragraphs.push(
            new Paragraph({
              alignment: input.alignment,
              bidirectional: input.isRtl,
              indent: input.isRtl ? { right: 360 } : { left: 360 },
              children: [
                new TextRun({
                  text: `${block.leftLabel || "Left"}: `,
                  bold: true,
                }),
                new TextRun(block.leftValue),
              ],
            }),
          );
        }

        if (block.rightValue) {
          paragraphs.push(
            new Paragraph({
              alignment: input.alignment,
              bidirectional: input.isRtl,
              indent: input.isRtl ? { right: 360 } : { left: 360 },
              children: [
                new TextRun({
                  text: `${block.rightLabel || "Right"}: `,
                  bold: true,
                }),
                new TextRun(block.rightValue),
              ],
            }),
          );
        }
        break;
      }
      case "list": {
        if (!block.items || block.items.length === 0) {
          break;
        }

        paragraphs.push(
          new Paragraph({
            alignment: input.alignment,
            bidirectional: input.isRtl,
            children: [
              new TextRun({
                text: `${block.label}:`,
                bold: true,
              }),
            ],
          }),
        );

        paragraphs.push(
          ...block.items.map(
            (item, index) =>
              new Paragraph({
                alignment: input.alignment,
                bidirectional: input.isRtl,
                indent: input.isRtl ? { right: 360 } : { left: 360 },
                children: [
                  new TextRun({
                    text: block.ordered ? `${index + 1}. ` : "- ",
                    bold: true,
                  }),
                  new TextRun(item),
                ],
              }),
          ),
        );
        break;
      }
      case "pair-list": {
        if (!block.pairs || block.pairs.length === 0) {
          break;
        }

        paragraphs.push(
          new Paragraph({
            alignment: input.alignment,
            bidirectional: input.isRtl,
            children: [
              new TextRun({
                text: `${block.label}:`,
                bold: true,
              }),
            ],
          }),
        );

        paragraphs.push(
          ...block.pairs.map(
            (pair) =>
              new Paragraph({
                alignment: input.alignment,
                bidirectional: input.isRtl,
                indent: input.isRtl ? { right: 360 } : { left: 360 },
                children: [
                  new TextRun({
                    text: `${pair.left} -> ${pair.right}`,
                  }),
                ],
              }),
          ),
        );
        break;
      }
      default:
        break;
    }
  }

  return paragraphs;
}

export async function buildAssessmentDocxExport(preview: NormalizedAssessmentPreview) {
  const isRtl = preview.direction === "rtl";
  const headingAlignment = isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT;
  const bodyAlignment = headingAlignment;

  const document = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            heading: HeadingLevel.TITLE,
            alignment: headingAlignment,
            bidirectional: isRtl,
            children: [
              new TextRun({
                text: preview.title,
                bold: true,
                size: 34,
              }),
            ],
          }),
          new Paragraph({
            alignment: bodyAlignment,
            bidirectional: isRtl,
            spacing: {
              after: 180,
            },
            children: [
              new TextRun({
                text: preview.summary,
                size: 22,
              }),
            ],
          }),
          ...preview.metadata.map(
            (item) =>
              new Paragraph({
                alignment: bodyAlignment,
                bidirectional: isRtl,
                children: [
                  new TextRun({
                    text: `${item.label}: `,
                    bold: true,
                  }),
                  new TextRun({
                    text: item.value,
                  }),
                ],
              }),
          ),
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            alignment: headingAlignment,
            bidirectional: isRtl,
            spacing: {
              before: 320,
              after: 200,
            },
            children: [
              new TextRun({
                text: preview.questionCountLabel,
                bold: true,
              }),
            ],
          }),
          ...preview.questions.flatMap((question) => {
            const paragraphs: Array<Paragraph | Table> = [
              new Paragraph({
                heading: HeadingLevel.HEADING_2,
                alignment: headingAlignment,
                bidirectional: isRtl,
                spacing: {
                  before: 180,
                  after: 90,
                },
                children: [
                  new TextRun({
                    text: `${question.index + 1}. ${question.stem}`,
                    bold: true,
                  }),
                ],
              }),
            ];

            if (question.choices.length > 0) {
              if (question.choiceLayout === "grid-2x2" && question.choices.length === 4) {
                paragraphs.push(
                  buildChoiceTable({
                    choices: question.choices,
                    alignment: bodyAlignment,
                    isRtl,
                  }),
                );
              } else {
                paragraphs.push(
                  ...question.choices.map((choice) =>
                    buildChoiceParagraph({
                      marker: choice.marker,
                      text: choice.text,
                      alignment: bodyAlignment,
                      isRtl,
                    }),
                  ),
                );
              }
            }

            if (question.supplementalLines.length > 0) {
              paragraphs.push(
                ...question.supplementalLines.map(
                  (line) =>
                    new Paragraph({
                      alignment: bodyAlignment,
                      bidirectional: isRtl,
                      spacing: {
                        after: 90,
                      },
                      children: [
                        new TextRun({
                          text: line,
                        }),
                      ],
                    }),
                ),
              );
            }

            if (question.typeLabel) {
              paragraphs.push(
                new Paragraph({
                  alignment: bodyAlignment,
                  bidirectional: isRtl,
                  children: [
                    new TextRun({
                      text: `${preview.locale === "ar" ? "نوع السؤال" : "Question type"}: `,
                      bold: true,
                    }),
                    new TextRun(question.typeLabel),
                  ],
                }),
              );
            }

            if (question.difficultyLabel) {
              paragraphs.push(
                new Paragraph({
                  alignment: bodyAlignment,
                  bidirectional: isRtl,
                  children: [
                    new TextRun({
                      text: `${preview.locale === "ar" ? "صعوبة السؤال" : "Question difficulty"}: `,
                      bold: true,
                    }),
                    new TextRun(question.difficultyLabel),
                  ],
                }),
              );
            }

            paragraphs.push(
              new Paragraph({
                alignment: bodyAlignment,
                bidirectional: isRtl,
                children: [
                  new TextRun({
                    text: `${preview.locale === "ar" ? "الإجابة" : "Answer"}: `,
                    bold: true,
                  }),
                  new TextRun(question.answerDisplay),
                ],
              }),
            );

            paragraphs.push(
              ...buildTypeAwareDocxDetails({
                preview,
                question,
                alignment: bodyAlignment,
                isRtl,
              }),
            );

            paragraphs.push(
              ...buildScienceDocxDetails({
                question,
                alignment: bodyAlignment,
                isRtl,
              }),
            );

            if (question.rationale) {
              paragraphs.push(
                new Paragraph({
                  alignment: bodyAlignment,
                  bidirectional: isRtl,
                  children: [
                    new TextRun({
                      text: `${preview.locale === "ar" ? "التبرير" : "Rationale"}: `,
                      bold: true,
                    }),
                    new TextRun(question.rationale),
                  ],
                }),
              );
            }

            if (question.tags.length > 0) {
              paragraphs.push(
                new Paragraph({
                  alignment: bodyAlignment,
                  bidirectional: isRtl,
                  children: [
                    new TextRun({
                      text: `${preview.locale === "ar" ? "الوسوم" : "Tags"}: `,
                      bold: true,
                    }),
                    new TextRun(question.tags.join(", ")),
                  ],
                }),
              );
            }

            return paragraphs;
          }),
           /* DOCX exports should carry the same file-facing attribution line as preview/PDF
             surfaces so footer wording stays consistent across every assessment file surface. */
          new Paragraph({
            alignment: AlignmentType.CENTER,
            bidirectional: true,
            spacing: {
              before: 360,
            },
            children: [
              new TextRun({
                text: preview.fileSurface.footerText,
                size: 22,
              }),
            ],
          }),
        ],
      },
    ],
  });

  return Packer.toBuffer(document);
}
