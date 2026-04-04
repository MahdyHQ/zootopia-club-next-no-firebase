import "server-only";

import type { NormalizedAssessmentPreview } from "@/lib/assessment-preview-model";
import { getProtectedSignatureCopy } from "@/lib/branding/protected-signature";

import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";

function slugifyFileSegment(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[\u0600-\u06FF]+/g, "assessment")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "assessment";
}

export function buildAssessmentExportFileBase(preview: NormalizedAssessmentPreview) {
  return `${slugifyFileSegment(preview.title)}-${preview.id.slice(0, 8)}`;
}

export function buildAssessmentJsonExport(preview: NormalizedAssessmentPreview) {
  return JSON.stringify(preview, null, 2);
}

export function buildAssessmentMarkdownExport(preview: NormalizedAssessmentPreview) {
  return preview.markdownExport;
}

export async function buildAssessmentDocxExport(preview: NormalizedAssessmentPreview) {
  const isRtl = preview.direction === "rtl";
  const headingAlignment = isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT;
  const bodyAlignment = headingAlignment;
  const signature = getProtectedSignatureCopy(preview.locale);

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
              after: 200,
            },
            children: [
              new TextRun({
                text: preview.summary,
                size: 24,
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
            const paragraphs = [
              new Paragraph({
                heading: HeadingLevel.HEADING_2,
                alignment: headingAlignment,
                bidirectional: isRtl,
                spacing: {
                  before: 220,
                  after: 120,
                },
                children: [
                  new TextRun({
                    text: `${question.index + 1}. ${question.stem}`,
                    bold: true,
                  }),
                ],
              }),
            ];

            if (question.choiceLines.length > 0) {
              paragraphs.push(
                ...question.choiceLines.map(
                  (choiceLine) =>
                    new Paragraph({
                      alignment: bodyAlignment,
                      bidirectional: isRtl,
                      indent: isRtl
                        ? {
                            right: 420,
                          }
                        : {
                            left: 420,
                          },
                      spacing: {
                        after: 90,
                      },
                      children: [
                        new TextRun({
                          text: choiceLine,
                        }),
                      ],
                    }),
                ),
              );
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

            paragraphs.push(
              new Paragraph({
                alignment: bodyAlignment,
                bidirectional: isRtl,
                children: [
                  new TextRun({
                    text: `${preview.locale === "ar" ? "الإجابة" : "Answer"}: `,
                    bold: true,
                  }),
                  new TextRun(question.answer),
                ],
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
          /* Exported assessment files carry the same branded attribution seal as the protected viewer.
             Keep this footer aligned with the shell/result-surface seal so exported artifacts stay recognizably first-party. */
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: {
              before: 360,
              after: 80,
            },
            children: [
              new TextRun({
                text: signature.label,
                bold: true,
                color: "0f766e",
                size: 20,
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            bidirectional: true,
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
