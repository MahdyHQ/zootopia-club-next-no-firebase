import "server-only";

import type {
  AssessmentPreviewThemeMode,
  AssessmentPreviewFileSurface,
  AssessmentPreviewQuestionItem,
  NormalizedAssessmentPreview,
} from "@/lib/assessment-preview-model";
import {
  ASSESSMENT_FILE_FOOTER_LAYOUT,
} from "@/lib/assessment-file-branding";
import { buildAssessmentFileQuestionPages } from "@/lib/assessment-file-layout";
import {
  countFillBlanks,
  extractMatchingPairs,
  resolveTrueFalseAnswerValue,
  splitMultipleResponseAnswers,
} from "@/lib/assessment-question-display";

/* The Fast browser-print lane caches rendered HTML artifacts, and the Pro lane currently reuses
   this shared file-surface foundation before Puppeteer capture. Bump this whenever the shared
   assessment file layout changes materially so both lanes can invalidate stale source surfaces
   without collapsing back into one mixed route or cache contract. */
export const ASSESSMENT_PRINT_LAYOUT_VERSION = "2026-04-06-compact-pdf-v21";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderChoiceItem(input: {
  marker: string | null;
  text: string;
  isCorrect: boolean;
}) {
  const choiceClassName = input.isCorrect ? "choice-item choice-item--correct" : "choice-item";
  const markerClassName = input.isCorrect ? "choice-marker choice-marker--correct" : "choice-marker";

  return `
    <div class="${choiceClassName}">
      <span class="${markerClassName}">${escapeHtml(input.marker ? `${input.marker})` : "•")}</span>
      <span class="choice-text">${escapeHtml(input.text)}</span>
      ${input.isCorrect ? '<span class="choice-correct-badge" aria-hidden="true">&#10003;</span>' : ""}
    </div>
  `.trim();
}

function localizeCopy(locale: NormalizedAssessmentPreview["contentLanguage"], en: string, ar: string) {
  return locale === "ar" ? ar : en;
}

function getTypeAwareAnswerLabel(input: {
  locale: NormalizedAssessmentPreview["contentLanguage"];
  questionType: AssessmentPreviewQuestionItem["questionType"];
  fallback: string;
}) {
  switch (input.questionType) {
    case "essay":
      return localizeCopy(input.locale, "Model answer / guidance", "إرشاد الإجابة المقالية");
    case "short_answer":
      return localizeCopy(input.locale, "Expected short answer", "الإجابة القصيرة المتوقعة");
    case "matching":
      return localizeCopy(input.locale, "Correct matching", "التوصيل الصحيح");
    case "multiple_response":
      return localizeCopy(input.locale, "Correct options", "الخيارات الصحيحة");
    case "terminology":
      return localizeCopy(input.locale, "Expected term", "المصطلح المتوقع");
    case "definition":
      return localizeCopy(input.locale, "Expected definition", "التعريف المتوقع");
    case "comparison":
      return localizeCopy(input.locale, "Comparison guidance", "إرشاد المقارنة");
    case "labeling":
      return localizeCopy(input.locale, "Labeling key", "مفتاح التسمية");
    case "classification":
      return localizeCopy(input.locale, "Classification key", "مفتاح التصنيف");
    case "sequencing":
      return localizeCopy(input.locale, "Expected sequence", "التسلسل المتوقع");
    case "process_mechanism":
      return localizeCopy(input.locale, "Mechanism guidance", "إرشاد الآلية");
    case "cause_effect":
      return localizeCopy(input.locale, "Cause-effect mapping", "خريطة السبب والنتيجة");
    case "distinguish_between":
      return localizeCopy(input.locale, "Distinguishing points", "نقاط التمييز");
    case "identify_structure":
      return localizeCopy(input.locale, "Structure identification", "تحديد البنية");
    case "identify_compound":
      return localizeCopy(input.locale, "Compound identification", "تحديد المركب");
    default:
      return input.fallback;
  }
}

function renderScienceBlock(input: {
  block: AssessmentPreviewQuestionItem["scienceBlocks"][number];
}) {
  const { block } = input;

  switch (block.kind) {
    case "value":
      return block.value
        ? `
          <div class="science-block">
            <div class="answer-label">${escapeHtml(block.label)}</div>
            <p>${escapeHtml(block.value)}</p>
          </div>
        `
        : "";
    case "pair": {
      if (!block.leftValue && !block.rightValue) {
        return "";
      }

      return `
        <div class="science-block">
          <div class="answer-label">${escapeHtml(block.label)}</div>
          <div class="science-pair-grid">
            ${
              block.leftValue
                ? `<p><strong>${escapeHtml(block.leftLabel || "Left")}:</strong> ${escapeHtml(block.leftValue)}</p>`
                : ""
            }
            ${
              block.rightValue
                ? `<p><strong>${escapeHtml(block.rightLabel || "Right")}:</strong> ${escapeHtml(block.rightValue)}</p>`
                : ""
            }
          </div>
        </div>
      `;
    }
    case "list": {
      if (!block.items || block.items.length === 0) {
        return "";
      }

      return `
        <div class="science-block">
          <div class="answer-label">${escapeHtml(block.label)}</div>
          <div class="science-list">
            ${block.items
              .map(
                (item, index) =>
                  `<p><span class="science-list-marker">${escapeHtml(
                    block.ordered ? `${index + 1}.` : "-",
                  )}</span> ${escapeHtml(item)}</p>`,
              )
              .join("")}
          </div>
        </div>
      `;
    }
    case "pair-list": {
      if (!block.pairs || block.pairs.length === 0) {
        return "";
      }

      return `
        <div class="science-block">
          <div class="answer-label">${escapeHtml(block.label)}</div>
          <div class="science-list">
            ${block.pairs
              .map(
                (pair) =>
                  `<p>${escapeHtml(pair.left)} <span aria-hidden="true">-></span> ${escapeHtml(pair.right)}</p>`,
              )
              .join("")}
          </div>
        </div>
      `;
    }
    default:
      return "";
  }
}

function renderScienceBlocks(input: {
  blocks: AssessmentPreviewQuestionItem["scienceBlocks"];
}) {
  if (!input.blocks || input.blocks.length === 0) {
    return "";
  }

  return input.blocks.map((block) => renderScienceBlock({ block })).join("");
}

function renderQuestionCard(input: {
  question: AssessmentPreviewQuestionItem;
  answerLabel: string;
  rationaleLabel: string;
  contentLanguage: NormalizedAssessmentPreview["contentLanguage"];
  className?: string;
}) {
  const { question, answerLabel, rationaleLabel, contentLanguage, className = "" } = input;
  const articleClassName = ["question-card", className].filter(Boolean).join(" ");
  const resolvedTrueFalseValue =
    question.questionType === "true_false"
      ? resolveTrueFalseAnswerValue(question.answerDisplay || question.answer)
      : null;
  const fillBlankCount =
    question.questionType === "fill_blanks" ? countFillBlanks(question.stem) : 0;
  const matchingPairs =
    question.questionType === "matching"
      ? extractMatchingPairs(question.answerDisplay || question.answer)
      : [];
  const resolvedMultipleResponseAnswers =
    question.questionType === "multiple_response"
      ? (() => {
          const choiceAnswers = question.choices
            .filter((choice) => choice.isCorrect)
            .map((choice) => choice.displayText);

          if (choiceAnswers.length > 0) {
            return choiceAnswers;
          }

          return splitMultipleResponseAnswers(question.answerDisplay || question.answer);
        })()
      : [];
  const resolvedAnswerLabel = getTypeAwareAnswerLabel({
    locale: contentLanguage,
    questionType: question.questionType,
    fallback: answerLabel,
  });

  return `
    <article class="${articleClassName}">
      <div class="question-header">
        <span class="question-index">${question.index + 1}</span>
        ${question.typeLabel ? `<span class="question-type">${escapeHtml(question.typeLabel)}</span>` : ""}
        ${
          question.difficultyLabel
            ? `<span class="question-difficulty">${escapeHtml(
                `${localizeCopy(contentLanguage, "Question difficulty", "صعوبة السؤال")}: ${question.difficultyLabel}`,
              )}</span>`
            : ""
        }
      </div>
      <h2 class="question-title">${escapeHtml(question.stem)}</h2>
      ${
        resolvedTrueFalseValue
          ? `
            <div class="true-false-grid">
              ${[
                {
                  value: "true" as const,
                  label: localizeCopy(contentLanguage, "True", "صح"),
                },
                {
                  value: "false" as const,
                  label: localizeCopy(contentLanguage, "False", "خطأ"),
                },
              ]
                .map(
                  (option) =>
                    `<span class="${
                      resolvedTrueFalseValue === option.value
                        ? "true-false-pill true-false-pill--correct"
                        : "true-false-pill"
                    }">${escapeHtml(option.label)}</span>`,
                )
                .join("")}
            </div>
          `
          : ""
      }
      ${
        question.choices.length > 0
          ? `
            <div class="choice-list ${question.choiceLayout === "grid-2x2" ? "choice-list--paired" : ""}">
              ${question.choices
                .map((choice) =>
                  renderChoiceItem({
                    marker: choice.marker,
                    text: choice.text,
                    isCorrect: choice.isCorrect,
                  }),
                )
                .join("")}
            </div>
          `
          : ""
      }
      ${
        fillBlankCount > 0
          ? `<p class="blank-count">${escapeHtml(
              `${localizeCopy(contentLanguage, "Blank count", "عدد الفراغات")}: ${fillBlankCount}`,
            )}</p>`
          : ""
      }
      ${
        matchingPairs.length > 0
          ? `
            <div class="type-detail-card">
              <div class="answer-label">${escapeHtml(
                localizeCopy(contentLanguage, "Matching pairs", "أزواج التوصيل"),
              )}</div>
              <div class="matching-pair-list">
                ${matchingPairs
                  .map(
                    (pair) =>
                      `<p>${escapeHtml(pair.left)} <span aria-hidden="true">-></span> ${escapeHtml(pair.right)}</p>`,
                  )
                  .join("")}
              </div>
            </div>
          `
          : ""
      }
      ${
        question.questionType === "multiple_response" &&
        question.choices.length === 0 &&
        resolvedMultipleResponseAnswers.length > 0
          ? `
            <div class="type-detail-card">
              <div class="answer-label">${escapeHtml(
                localizeCopy(contentLanguage, "Resolved correct options", "الخيارات الصحيحة"),
              )}</div>
              <p>${escapeHtml(resolvedMultipleResponseAnswers.join(", "))}</p>
            </div>
          `
          : ""
      }
      ${renderScienceBlocks({ blocks: question.scienceBlocks })}
      ${
        question.supplementalLines.length > 0
          ? `
            <div class="supplemental-copy">
              ${question.supplementalLines
                .map((line) => `<p>${escapeHtml(line)}</p>`)
                .join("")}
            </div>
          `
          : ""
      }
      <div class="answer-card">
        <div class="answer-label">${escapeHtml(resolvedAnswerLabel)}</div>
        <p>${escapeHtml(question.answerDisplay)}</p>
      </div>
      ${
        question.rationale
          ? `
            <div class="rationale-card">
              <div class="answer-label">${escapeHtml(rationaleLabel)}</div>
              <p>${escapeHtml(question.rationale)}</p>
            </div>
          `
          : ""
      }
      ${
        question.tags.length > 0
          ? `
            <div class="tag-list">
              ${question.tags
                .map((tag) => `<span class="tag-item">${escapeHtml(tag)}</span>`)
                .join("")}
            </div>
          `
          : ""
      }
    </article>
  `
    .trim();
}

function renderSupportPill(text: string, className = "support-chip") {
  return `<span class="${className}">${escapeHtml(text)}</span>`;
}

function renderSupportContactCard(input: {
  label: string;
  value: string;
  href: string;
}) {
  return `
    <a class="support-contact-card" href="${escapeHtml(input.href)}">
      <span class="support-contact-label">${escapeHtml(input.label)}</span>
      <span class="support-contact-value">${escapeHtml(input.value)}</span>
    </a>
  `.trim();
}

function renderFooterLine(input: AssessmentPreviewFileSurface["footerLine"]) {
  return `
    <p class="footer-line" dir="rtl">
      <span class="footer-emoji">${escapeHtml(input.leadingEmoji)}</span>
      <span class="footer-line-text">${escapeHtml(input.text)}</span>
      <span class="footer-emoji">${escapeHtml(input.trailingEmoji)}</span>
    </p>
  `.trim();
}

function renderPageBadge(input: {
  number: string;
  dynamic?: boolean;
}) {
  const numberClassName = input.dynamic
    ? "footer-page-number footer-page-number--dynamic"
    : "footer-page-number";
  const pageArcViewBox = ASSESSMENT_FILE_FOOTER_LAYOUT.pageArcViewBox;
  const pageArcCenter = pageArcViewBox / 2;

  return `
    <span class="footer-page-badge" aria-hidden="true">
      <svg viewBox="0 0 ${pageArcViewBox} ${pageArcViewBox}" class="footer-page-arc">
        <circle
          cx="${pageArcCenter}"
          cy="${pageArcCenter}"
          r="${ASSESSMENT_FILE_FOOTER_LAYOUT.pageArcRadius}"
          fill="none"
          stroke="currentColor"
          stroke-width="${ASSESSMENT_FILE_FOOTER_LAYOUT.pageArcStrokeWidth}"
          stroke-dasharray="${ASSESSMENT_FILE_FOOTER_LAYOUT.pageArcDashArray}"
          stroke-linecap="round"
          transform="rotate(${ASSESSMENT_FILE_FOOTER_LAYOUT.pageArcRotation} ${pageArcCenter} ${pageArcCenter})"
        />
      </svg>
      <span class="${numberClassName}">${input.dynamic ? "" : escapeHtml(input.number)}</span>
    </span>
  `.trim();
}

function renderAssessmentFileFooter(input: {
  footerLine: AssessmentPreviewFileSurface["footerLine"];
  sealAssetUrl: string;
  pageNumberText: string;
  variant: "screen" | "print";
  enableDynamicPageNumber?: boolean;
}) {
  /* The support page body runs RTL for Arabic copy, but footer anchors must remain physically
     stable across all pages: left seal, centered line, right page badge. */
  return `
    <footer class="${input.variant}-footer assessment-file-footer" dir="ltr">
      <span class="footer-seal">
        <img src="${escapeHtml(input.sealAssetUrl)}" alt="" />
      </span>
      <div class="footer-line-wrap">
        ${renderFooterLine(input.footerLine)}
      </div>
      ${renderPageBadge({
        number: input.pageNumberText,
        dynamic:
          input.variant === "print" &&
          (input.enableDynamicPageNumber ?? true),
      })}
    </footer>
  `.trim();
}

export function buildAssessmentPrintHtml(input: {
  preview: NormalizedAssessmentPreview;
  themeMode: AssessmentPreviewThemeMode;
  qrCodeDataUrl: string;
  autoPrint?: boolean;
  documentBaseUrl?: string | null;
  pageNumberMode?: "css" | "pdf-template" | "static-sections";
}) {
  const {
    preview,
    themeMode,
    qrCodeDataUrl,
    autoPrint = true,
    documentBaseUrl,
    pageNumberMode = "static-sections",
  } = input;
  const contentLanguage = preview.contentLanguage;
  const dark = themeMode === "dark";
  const backgroundUrl = dark
    ? preview.fileSurface.backgroundDarkUrl
    : preview.fileSurface.backgroundLightUrl;
  const sealAssetUrl = dark
    ? preview.fileSurface.sealDarkAssetUrl
    : preview.fileSurface.sealLightAssetUrl;
  const facultyBadgeAssetUrl = dark
    ? preview.fileSurface.facultyBadgeDarkAssetUrl
    : preview.fileSurface.facultyBadgeLightAssetUrl;
  const answerLabel = contentLanguage === "ar" ? "الإجابة" : "Answer";
  const rationaleLabel = contentLanguage === "ar" ? "التبرير" : "Rationale";
  const pdfEyebrow = contentLanguage === "ar" ? "تصدير PDF" : "PDF export";
  /* Keep the summary chip label literal and shared with the detached preview/result shell so the
     premium file header reads as one consistent SUMMARY surface before and after Pro PDF capture. */
  const summaryLabel = "SUMMARY";
  const printHint = contentLanguage === "ar"
    ? "استخدم نافذة الطباعة في المتصفح ثم اختر Save as PDF."
    : "Use your browser print dialog and choose Save as PDF.";
  /* Chrome paints the page-margin strip from the page box itself, not from fixed print layers.
     Keep these margins aligned with the renderer's safe content area and unified footer bar, but
     let the @page foundation below own the full-bleed edge color future agents must not regress. */
  const pageMarginTop = "8mm";
  const pageMarginRight = "7mm";
  const pageMarginBottom = "16mm";
  const pageMarginLeft = "7mm";
  const pageFrameInset = "4mm";
  const pageArtworkBleed = "2mm";
  const fixedFooterBottomInset = "0.8mm";
  const pageBackgroundFoundation = dark ? "#0b1825" : "#f4efe4";
  const footerSideAnchorSize = `${ASSESSMENT_FILE_FOOTER_LAYOUT.sideAnchorSizePx}px`;
  const footerSealImagePaddingPx = `${ASSESSMENT_FILE_FOOTER_LAYOUT.sealImagePaddingPx}px`;
  const footerSealImageScale = ASSESSMENT_FILE_FOOTER_LAYOUT.sealImageScale;
  const footerTextMaxWidth = `${ASSESSMENT_FILE_FOOTER_LAYOUT.footerTextMaxWidthPx}px`;
  const footerTextFontFamily = ASSESSMENT_FILE_FOOTER_LAYOUT.footerTextFontFamily;
    /* Keep card growth intentionally subtle: this tiny bump fills whitespace a bit more across the
      shared file surface while preserving readability and the existing 2-then-3 page rhythm. */
    const firstPageQuestionCardMinHeight = "39.5mm";
    const followingPageQuestionCardMinHeight = "26.2mm";
    const followingPageQuestionCardPrintMinHeight = "28.2mm";
  /* The final support-page composition must stay on one page with its own footer attached.
     Keep these print guards centralized so future tweaks do not reintroduce footer-only overflow. */
  const staticSectionMinHeight = "calc(100vh - 0.6mm)";
  const supportPagePrintPadding = "12px 12px 10px";
  const supportPagePrintCardPadding = "9px 10px";
  const supportPagePrintGridGap = "8px";
  const supportPagePrintSignatureWidth = "268px";
  /* Static section numbering keeps both Pro and Fast lanes on real page numbers rendered
     inside the shared bottom-right arc, avoiding brittle CSS page counters that can show `0`
     on some print engines while preserving a compatibility mode for older surfaces. */
  const useStaticSectionPageNumbers =
    pageNumberMode === "static-sections" || pageNumberMode === "pdf-template";
  const useFixedPrintFooter = !useStaticSectionPageNumbers;
  const questionHeaderJustify =
    preview.direction === "rtl" ? "flex-end" : "space-between";
  const qrInsetSide = "right";
  const coverPaddingSide = "padding-right";
  const coverHeaderAsidePadding = "132px";
  const pageFoldSide = preview.direction === "rtl" ? "left" : "right";
  const questionPages = buildAssessmentFileQuestionPages(preview.questions);
  const firstQuestionPage = questionPages[0] ?? {
    questions: [] as AssessmentPreviewQuestionItem[],
    usesOverflowFallback: false,
  };
  const followingQuestionPages = questionPages.slice(1);
  const firstPageQuestionCards = firstQuestionPage.questions
    .map((question) =>
      renderQuestionCard({
        question,
        answerLabel,
        rationaleLabel,
        contentLanguage,
        className: "question-card--first-page",
      }),
    )
    .join("\n");
  const followingQuestionPageSections = followingQuestionPages
    .map((page, pageIndex) => {
      const pageNumber = pageIndex + 2;

      return `
        <section class="page-section page-section--question">
          <section class="question-page-stack">
            ${page.questions
              .map((question) =>
                renderQuestionCard({
                  question,
                  answerLabel,
                  rationaleLabel,
                  contentLanguage,
                  className: "question-card--compact",
                }),
              )
              .join("\n")}
          </section>
          ${
            page.usesOverflowFallback
              ? `<p class="overflow-note">Long-content safety fallback applied on this page to preserve clean borders and prevent card overlap.</p>`
              : ""
          }
          ${renderAssessmentFileFooter({
            footerLine: preview.fileSurface.footerLine,
            sealAssetUrl,
            pageNumberText: String(pageNumber),
            variant: "screen",
          })}
        </section>
      `.trim();
    })
    .join("\n");
  const supportPage = preview.fileSurface.supportPage;
  const supportPageNumber = questionPages.length + 1;
  const resolvedDocumentBaseUrl = documentBaseUrl
    ? new URL(documentBaseUrl, "https://example.invalid").toString()
    : null;
  const exportFontStylesheetUrl =
    "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=Alexandria:wght@400;600;700;800&family=Amiri:wght@400;700&family=Aref+Ruqaa:wght@400;700&display=swap";
  const supportHeroChips = supportPage.heroChips
    .map((chip) => renderSupportPill(chip))
    .join("\n");
  const supportCostItems = supportPage.costItems
    .map((item) => renderSupportPill(item, "support-chip support-chip--cost"))
    .join("\n");
  const supportImpactItems = supportPage.impactItems
    .map(
      (item) => `
        <div class="support-impact-item">
          <span class="support-impact-bullet" aria-hidden="true">✦</span>
          <p>${escapeHtml(item)}</p>
        </div>
      `.trim(),
    )
    .join("\n");
  const supportContactCards = [
    renderSupportContactCard({
      label: supportPage.contactPathLabel,
      value: supportPage.contactPathUrl,
      href: supportPage.contactPathUrl,
    }),
    renderSupportContactCard({
      label: supportPage.directLinkLabel,
      value: supportPage.directLinkUrl.replace(/^https?:\/\//, ""),
      href: supportPage.directLinkUrl,
    }),
  ].join("\n");
  const metadata = preview.metadata
    .map(
      (item) => `
        <div class="meta-item">
          <span class="meta-label">${escapeHtml(item.label)}</span>
          <span class="meta-divider" aria-hidden="true"></span>
          <span class="meta-value">${escapeHtml(item.value)}</span>
        </div>
      `.trim(),
    )
    .join("\n");
  const compositionBadges = preview.compositionBadges
    .map(
      (badge) => `
        <span class="composition-badge composition-badge--${badge.tone}">
          ${escapeHtml(badge.label)}${badge.value ? ` <strong>${escapeHtml(`· ${badge.value}`)}</strong>` : ""}
        </span>
      `.trim(),
    )
    .join("\n");

  return `<!doctype html>
<html lang="${preview.contentLanguage}" dir="${preview.direction}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    ${resolvedDocumentBaseUrl ? `<base href="${escapeHtml(resolvedDocumentBaseUrl)}" />` : ""}
    <link href="${exportFontStylesheetUrl}" rel="stylesheet" />
    <title>${escapeHtml(preview.title)}</title>
    <style>
      :root {
        color-scheme: ${dark ? "dark" : "light"};
        /* Dark export colors stay matte and science-leaning on purpose.
           Keep this palette coherent with the protected preview mood without pushing the PDF
           into neon contrast or flat black slabs that fight the file background artwork. */
        --ink: ${dark ? "#f7fbff" : "#0f172a"};
        --muted: ${dark ? "#a4bad0" : "#566375"};
        --line: ${dark ? "rgba(148, 163, 184, 0.1)" : "rgba(15, 23, 42, 0.12)"};
        --line-strong: ${dark ? "rgba(94, 234, 212, 0.16)" : "rgba(15, 118, 110, 0.14)"};
        --accent: ${dark ? "#67e8d8" : "#0f766e"};
        --accent-soft: ${dark ? "rgba(94, 234, 212, 0.14)" : "rgba(15, 118, 110, 0.1)"};
        --surface-strong: ${dark ? "rgba(5, 16, 31, 0.88)" : "rgba(255, 255, 255, 0.72)"};
        --surface-soft: ${dark ? "rgba(7, 18, 34, 0.78)" : "rgba(255, 255, 255, 0.46)"};
        --surface-soft-2: ${dark ? "rgba(4, 12, 24, 0.9)" : "rgba(255, 255, 255, 0.36)"};
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      body {
        margin: 0;
        padding: 14px;
        background: ${pageBackgroundFoundation};
        color: var(--ink);
        /* Assessment exports can now intentionally include tasteful emojis.
           Preserve emoji-capable font fallbacks here so browser Save-as-PDF keeps those glyphs
           visible instead of dropping them from the printed file surface. */
        font-family: "Plus Jakarta Sans", "Alexandria", "Amiri", "Segoe UI", "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", Tahoma, Arial, sans-serif;
      }

      .screen-background,
      .page-background-print {
        position: fixed;
        inset: -4%;
        background-position: center;
        background-size: cover;
        pointer-events: none;
      }

      .screen-background {
        background-image: url("${escapeHtml(backgroundUrl)}");
        z-index: 0;
        opacity: ${dark ? "0.36" : "0.28"};
      }

      .screen-wash {
        position: fixed;
        inset: 0;
        z-index: 0;
        background: ${dark ? "rgba(2, 8, 18, 0.74)" : "rgba(255, 255, 255, 0.68)"};
      }

      .page-background-print {
        background-image: ${dark
          ? `linear-gradient(180deg, rgba(2, 8, 18, 0.2), rgba(3, 10, 23, 0.3)), url("${escapeHtml(backgroundUrl)}")`
          : `url("${escapeHtml(backgroundUrl)}")`};
      }

      .page-background-print,
      .page-chrome-print,
      .print-footer {
        display: none;
      }

      .sheet {
        position: relative;
        z-index: 1;
        max-width: 860px;
        margin: 0 auto;
        overflow: hidden;
        border: 1px solid var(--line);
        border-radius: 22px;
        padding: 18px 18px 16px;
        background:
          linear-gradient(${dark ? "180deg, rgba(2, 8, 20, 0.92), rgba(4, 12, 24, 0.82)" : "180deg, rgba(255, 255, 255, 0.72), rgba(255, 255, 255, 0.56)"}),
          radial-gradient(${dark ? "circle at top right, rgba(94, 234, 212, 0.08), transparent 32%" : "circle at top right, rgba(15, 118, 110, 0.05), transparent 28%"}),
          radial-gradient(${dark ? "circle at bottom left, rgba(56, 189, 248, 0.05), transparent 30%" : "circle at bottom left, rgba(15, 118, 110, 0.04), transparent 26%"});
        box-shadow:
          inset 0 0 0 1px var(--line-strong),
          ${dark ? "0 26px 70px rgba(1, 4, 14, 0.62)" : "0 22px 52px rgba(15, 23, 42, 0.14)"};
      }

      /* The file frame and fold replace the older oversized corner brackets with a quieter
         printed-document treatment. Keep this subtle so the PDF feels premium without stealing
         space from the actual assessment content. */
      .sheet-frame,
      .page-frame {
        position: absolute;
        inset: 12px;
        border: 1px solid var(--line-strong);
        border-radius: 18px;
      }

      .sheet-fold,
      .page-fold {
        position: absolute;
        top: 0;
        ${pageFoldSide}: 0;
        width: 72px;
        height: 72px;
        background: linear-gradient(${dark ? "135deg, rgba(141, 242, 223, 0.22), transparent 64%" : "135deg, rgba(15, 118, 110, 0.12), transparent 62%"});
        clip-path: polygon(100% 0, 0 0, 100% 100%);
        opacity: 0.9;
      }

      /* The cover shell is the only block that owns the export QR.
         Keeping the QR inside this first-page header preserves the premium opening layout
         and prevents the branded code from leaking into later PDF pages. */
      .cover-shell {
        position: relative;
        ${coverPaddingSide}: ${coverHeaderAsidePadding};
        margin-bottom: 6px;
        padding-bottom: 6px;
        border-bottom: 1px solid var(--line);
        break-inside: avoid;
        page-break-inside: avoid;
      }

      .cover-brand {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        min-width: 0;
      }

      .cover-copy {
        min-width: 0;
      }

      .brand-logo {
        width: 38px;
        height: 38px;
        flex: none;
        border-radius: 14px;
        box-shadow: 0 10px 24px rgba(15, 23, 42, 0.14);
      }

      .brand-eyebrow {
        display: block;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--muted);
      }

      .brand-name {
        display: block;
        margin-top: 3px;
        font-size: 16px;
        font-weight: 700;
        line-height: 1.2;
        color: var(--ink);
      }

      .eyebrow {
        display: inline-flex;
        align-items: center;
        margin-top: 5px;
        padding: 3px 9px;
        border-radius: 999px;
        background: var(--accent-soft);
        color: var(--accent);
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }

      h1 {
        margin: 5px 0 0;
        max-width: 36rem;
        font-size: 20.4px;
        line-height: 1.14;
      }

      /* This summary panel is the premium cover-level container for the lecture/assessment brief.
         Keep the chip, contrast, and restrained accent together here so the PDF summary reads as an
         intentional file header block instead of falling back to plain body copy under the title. */
      .summary-panel {
        position: relative;
        margin-top: 7px;
        max-width: 38rem;
        padding: 8px 10px 9px;
        border: 1px solid var(--line);
        border-radius: 16px;
        background:
          linear-gradient(${dark
            ? "180deg, rgba(8, 18, 35, 0.82), rgba(4, 11, 24, 0.68)"
            : "180deg, rgba(255, 255, 255, 0.82), rgba(244, 250, 248, 0.7)"}),
          radial-gradient(${dark
            ? "circle at top right, rgba(94, 234, 212, 0.12), transparent 42%"
            : "circle at top right, rgba(15, 118, 110, 0.08), transparent 40%"});
        box-shadow:
          inset 0 0 0 1px var(--line-strong),
          ${dark ? "0 16px 30px rgba(1, 4, 14, 0.18)" : "0 14px 26px rgba(15, 23, 42, 0.06)"};
      }

      .summary-chip {
        display: inline-flex;
        align-items: center;
        padding: 4px 10px;
        border: 1px solid ${dark ? "rgba(94, 234, 212, 0.24)" : "rgba(15, 118, 110, 0.16)"};
        border-radius: 999px;
        background: ${dark ? "rgba(8, 30, 40, 0.84)" : "rgba(241, 249, 247, 0.92)"};
        color: ${dark ? "#dcfff9" : "#0f766e"};
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }

      .summary {
        margin: 5px 0 0;
        max-width: none;
        font-size: 11.8px;
        line-height: 1.44;
        color: ${dark ? "rgba(232, 244, 248, 0.92)" : "rgba(15, 23, 42, 0.8)"};
      }

      /* The QR is intentionally pinned to the physical top-right corner of page one.
         Keep this export-only anchor independent from RTL/LTR flow so Arabic files do not drift
         left and the QR never steals the same width budget as the assessment title block. */
      .hero-qr {
        position: absolute;
        top: 0;
        ${qrInsetSide}: 0;
        width: 56px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .hero-qr-card {
        display: grid;
        place-items: center;
        width: 52px;
        height: 52px;
        padding: 3px;
        border: 1px solid var(--line);
        border-radius: 14px;
        background: ${dark
          ? "linear-gradient(180deg, rgba(8, 18, 35, 0.96), rgba(4, 11, 24, 0.86))"
          : "var(--surface-strong)"};
        box-shadow: 0 10px 24px rgba(15, 23, 42, 0.12);
      }

      .hero-qr-card img {
        width: 42px;
        height: 42px;
        border-radius: 10px;
        background: white;
        padding: 3px;
      }

      /* This small faculty badge sits in the reserved top-right header pocket shared by print
         and detached file surfaces. Keep it compact and non-interactive so it complements QR and
         title branding without colliding with the summary panel or metadata ribbon. */
      .hero-faculty-badge {
        position: absolute;
        top: 2px;
        ${qrInsetSide}: 58px;
        width: 70px;
        display: flex;
        align-items: flex-start;
        justify-content: center;
        pointer-events: none;
      }

      .hero-faculty-badge-card {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 66px;
        min-height: 34px;
        padding: 2px 4px;
        border: 1px solid var(--line);
        border-radius: 12px;
        background: ${dark ? "rgba(6, 16, 30, 0.78)" : "rgba(255, 255, 255, 0.76)"};
        box-shadow: ${dark ? "0 10px 22px rgba(1, 4, 14, 0.16)" : "0 8px 18px rgba(15, 23, 42, 0.08)"};
      }

      .hero-faculty-badge-card img {
        display: block;
        width: 100%;
        max-height: 40px;
        object-fit: contain;
        opacity: ${dark ? "0.92" : "0.88"};
      }

      .meta-ribbon {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 5px;
      }

      .composition-ribbon {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 6px;
      }

      .composition-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        min-height: 24px;
        border: 1px solid var(--line);
        border-radius: 999px;
        padding: 3px 8px;
        font-size: 11px;
        font-weight: 700;
        line-height: 1.2;
      }

      .composition-badge strong {
        font-weight: 900;
      }

      .composition-badge--type {
        background: ${dark
          ? "linear-gradient(180deg, rgba(12, 34, 43, 0.78), rgba(7, 24, 36, 0.88))"
          : "linear-gradient(180deg, rgba(255, 255, 255, 0.84), rgba(222, 247, 244, 0.92))"};
        color: ${dark ? "#dcfff9" : "#0f766e"};
      }

      .composition-badge--summary {
        background: ${dark
          ? "linear-gradient(180deg, rgba(8, 18, 35, 0.92), rgba(4, 11, 24, 0.84))"
          : "linear-gradient(180deg, rgba(255, 255, 255, 0.86), rgba(236, 253, 245, 0.88))"};
        color: ${dark ? "#e6fffa" : "#166534"};
      }

      .meta-item {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-height: 26px;
        border: 1px solid var(--line);
        border-radius: 999px;
        padding: 3px 8px;
        background: ${dark
          ? "linear-gradient(180deg, rgba(8, 18, 35, 0.94), rgba(4, 11, 24, 0.82))"
          : "var(--surface-soft)"};
      }

      .meta-label {
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--muted);
      }

      .meta-divider {
        width: 4px;
        height: 4px;
        border-radius: 999px;
        background: var(--accent);
        opacity: 0.82;
      }

      .meta-value {
        font-size: 12px;
        font-weight: 700;
      }

      /* The first-page shell owns the cover plus the first two question cards.
         Keep this split explicit so page one can match the requested cover-plus-two rhythm,
         while later pages stay free to pack denser repeated cards without disturbing question ordering. */
      .page-section {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .page-section--question {
        margin-top: 12px;
      }

      .first-page-shell {
        display: grid;
        gap: 4px;
      }

      .first-page-questions {
        display: grid;
        gap: 3px;
      }

      .question-page-stack {
        display: grid;
        gap: 5px;
      }

      /* The question cards stay intentionally translucent so the themed file background can read
         through, but they still keep enough ink density for PDF readability and classroom-safe print.
         Do not turn these back into opaque slabs or the detached export mood will drift away again. */
      .question-card {
        position: relative;
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 11px 12px;
        background: ${dark
          ? "linear-gradient(180deg, rgba(8, 18, 35, 0.62), rgba(4, 11, 24, 0.42))"
          : "linear-gradient(180deg, rgba(255, 255, 255, 0.54), rgba(255, 255, 255, 0.28))"};
        box-shadow:
          inset 0 0 0 1px var(--line-strong),
          ${dark ? "0 16px 34px rgba(1, 4, 14, 0.2)" : "0 14px 28px rgba(15, 23, 42, 0.08)"};
        break-inside: avoid;
        page-break-inside: avoid;
      }

      /* Page-one and page-two+ question density intentionally differ.
         The first-page cards stay balanced beside the cover, while later cards are tightened so
         normal exports can reach three questions per page without collapsing readability. */
      .question-card--first-page {
        /* Keep first-page cards slightly taller than later cards so the opening sheet reads as a
          balanced cover-plus-two composition instead of leaving a sparse pocket under short items. */
        min-height: ${firstPageQuestionCardMinHeight};
        border-radius: 12px;
        padding: 8px 10px 8px;
      }

      .question-card--compact {
        min-height: ${followingPageQuestionCardMinHeight};
        border-radius: 12px;
        padding: 8px 10px 8px;
      }

      .question-card--first-page .question-header,
      .question-card--compact .question-header {
        gap: 6px;
        margin-bottom: 4px;
      }

      .question-card--first-page .question-index,
      .question-card--compact .question-index {
        width: 25px;
        height: 25px;
        font-size: 10.9px;
      }

      .question-card--first-page .question-type,
      .question-card--compact .question-type {
        padding: 2px 6px;
        font-size: 9.7px;
      }

      .question-card--first-page .question-difficulty,
      .question-card--compact .question-difficulty {
        padding: 2px 6px;
        font-size: 9.2px;
      }

      .question-card--first-page .question-title {
        font-size: 13.2px;
        line-height: 1.33;
      }

      .question-card--compact .question-title {
        font-size: 12.8px;
        line-height: 1.32;
      }

      .question-header {
        display: flex;
        align-items: center;
        justify-content: ${questionHeaderJustify};
        gap: 8px;
        margin-bottom: 5px;
      }

      .question-index {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border-radius: 999px;
        background: var(--accent-soft);
        color: var(--accent);
        font-size: 12px;
        font-weight: 800;
      }

      .question-type {
        display: inline-flex;
        align-items: center;
        padding: 4px 8px;
        border-radius: 999px;
        background: ${dark ? "rgba(255, 255, 255, 0.06)" : "rgba(15, 23, 42, 0.05)"};
        color: var(--muted);
        font-size: 10.5px;
        font-weight: 700;
      }

      .question-difficulty {
        display: inline-flex;
        align-items: center;
        margin-inline-start: auto;
        padding: 4px 8px;
        border-radius: 999px;
        border: 1px solid ${dark ? "rgba(251, 191, 36, 0.32)" : "rgba(245, 158, 11, 0.32)"};
        background: ${dark ? "rgba(245, 158, 11, 0.16)" : "rgba(254, 243, 199, 0.84)"};
        color: ${dark ? "#fffbeb" : "#92400e"};
        font-size: 10px;
        font-weight: 800;
      }

      .question-title {
        margin: 0;
        font-size: 15.4px;
        line-height: 1.48;
        white-space: pre-wrap;
      }

      .choice-list {
        display: grid;
        gap: 5px;
        margin-top: 6px;
      }

      .true-false-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 6px;
        margin-top: 7px;
      }

      .true-false-pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--line);
        border-radius: 10px;
        padding: 6px 8px;
        font-size: 11px;
        font-weight: 700;
        background: ${dark ? "rgba(7, 18, 35, 0.72)" : "rgba(255, 255, 255, 0.62)"};
        color: var(--muted);
      }

      .true-false-pill--correct {
        border-color: ${dark ? "rgba(103, 232, 216, 0.34)" : "rgba(16, 185, 129, 0.28)"};
        background: ${dark
          ? "linear-gradient(180deg, rgba(12, 34, 43, 0.78), rgba(7, 24, 36, 0.9))"
          : "linear-gradient(180deg, rgba(255, 255, 255, 0.82), rgba(236, 253, 245, 0.9))"};
        color: ${dark ? "#e6fffa" : "#0f766e"};
      }

      .blank-count {
        margin: 8px 0 0;
        font-size: 11px;
        font-weight: 700;
        color: ${dark ? "#fde68a" : "#92400e"};
      }

      .type-detail-card {
        border: 1px solid var(--line);
        border-radius: 11px;
        background: ${dark
          ? "linear-gradient(180deg, rgba(6, 15, 30, 0.82), rgba(3, 10, 22, 0.64))"
          : "linear-gradient(180deg, rgba(255, 255, 255, 0.62), rgba(241, 249, 247, 0.46))"};
        padding: 8px 10px;
        margin-top: 7px;
      }

      .type-detail-card p {
        margin: 5px 0 0;
        font-size: 12px;
        line-height: 1.48;
      }

      .matching-pair-list p {
        margin: 4px 0 0;
      }

      /* This paired grid is the PDF-specific counterpart to the preview/result layout.
         Keep four-choice MCQ sets in two columns when space allows so export parity stays intact
         without turning the PDF into a tall single-column document. */
      .choice-list--paired {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .choice-item {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        border: 1px solid var(--line);
        border-radius: 12px;
        padding: 7px 9px;
        background: ${dark ? "rgba(7, 18, 35, 0.72)" : "rgba(255, 255, 255, 0.56)"};
        box-shadow: inset 0 1px 0 ${dark ? "rgba(255, 255, 255, 0.05)" : "rgba(255, 255, 255, 0.82)"};
        font-size: 12px;
        line-height: 1.45;
      }

      .question-card--first-page .choice-list,
      .question-card--compact .choice-list {
        gap: 4px;
        margin-top: 5px;
      }

      .question-card--first-page .true-false-grid,
      .question-card--compact .true-false-grid {
        margin-top: 5px;
        gap: 4px;
      }

      .question-card--first-page .true-false-pill,
      .question-card--compact .true-false-pill {
        padding: 4px 6px;
        font-size: 10.4px;
      }

      .question-card--first-page .choice-item,
      .question-card--compact .choice-item {
        gap: 6px;
        border-radius: 10px;
        padding: 4px 6px;
        font-size: 11.2px;
        line-height: 1.34;
      }

      .choice-marker {
        min-width: 2.2em;
        font-weight: 800;
        color: var(--accent);
      }

      /* Preview/result/PDF all use this stateful option highlight to mark the resolved correct
         answer with one quiet premium accent. Preserve the restrained tint and glow balance here
         so export files stay elegant and readable instead of drifting into neon quiz styling. */
      .choice-item--correct {
        border-color: ${dark ? "rgba(103, 232, 216, 0.34)" : "rgba(16, 185, 129, 0.28)"};
        background: ${dark
          ? "linear-gradient(180deg, rgba(12, 34, 43, 0.78), rgba(7, 24, 36, 0.9))"
          : "linear-gradient(180deg, rgba(255, 255, 255, 0.82), rgba(236, 253, 245, 0.9))"};
        box-shadow:
          inset 0 0 0 1px ${dark ? "rgba(103, 232, 216, 0.14)" : "rgba(16, 185, 129, 0.12)"},
          ${dark ? "0 0 22px rgba(45, 212, 191, 0.12)" : "0 12px 24px rgba(16, 185, 129, 0.1)"};
      }

      .choice-marker--correct {
        color: ${dark ? "#e6fffa" : "#0f766e"};
        text-shadow: ${dark ? "0 0 10px rgba(94, 234, 212, 0.18)" : "none"};
      }

      .choice-text {
        min-width: 0;
        flex: 1;
        font-weight: 600;
      }

      .choice-correct-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        flex: none;
        border-radius: 999px;
        border: 1px solid ${dark ? "rgba(167, 243, 208, 0.24)" : "rgba(16, 185, 129, 0.22)"};
        background: ${dark ? "rgba(110, 231, 183, 0.12)" : "rgba(255, 255, 255, 0.88)"};
        color: ${dark ? "#ecfeff" : "#0f766e"};
        font-size: 10px;
        font-weight: 800;
        box-shadow: ${dark ? "0 0 16px rgba(45, 212, 191, 0.14)" : "0 8px 18px rgba(16, 185, 129, 0.1)"};
      }

      .supplemental-copy {
        margin-top: 7px;
      }

      .question-card--first-page .supplemental-copy,
      .question-card--compact .supplemental-copy {
        margin-top: 5px;
      }

      .supplemental-copy p {
        margin: 0 0 5px;
        font-size: 12px;
        line-height: 1.48;
        color: var(--muted);
      }

      .question-card--first-page .supplemental-copy p,
      .question-card--compact .supplemental-copy p {
        margin: 0 0 3px;
        font-size: 11.4px;
        line-height: 1.4;
      }

      .answer-card,
      .rationale-card {
        border: 1px solid var(--line);
        border-radius: 11px;
        background: ${dark
          ? "linear-gradient(180deg, rgba(6, 15, 30, 0.82), rgba(3, 10, 22, 0.64))"
          : "linear-gradient(180deg, rgba(255, 255, 255, 0.62), rgba(241, 249, 247, 0.46))"};
        padding: 8px 10px;
        margin-top: 7px;
        box-shadow: inset 0 1px 0 ${dark ? "rgba(255, 255, 255, 0.05)" : "rgba(255, 255, 255, 0.86)"};
      }

      .question-card--first-page .answer-card,
      .question-card--first-page .rationale-card,
      .question-card--compact .answer-card,
      .question-card--compact .rationale-card {
        border-radius: 9px;
        padding: 5px 7px;
        margin-top: 4px;
      }

      .question-card--first-page .type-detail-card,
      .question-card--compact .type-detail-card {
        border-radius: 9px;
        padding: 5px 7px;
        margin-top: 4px;
      }

      .question-card--first-page .type-detail-card p,
      .question-card--compact .type-detail-card p {
        margin: 3px 0 0;
        font-size: 11.1px;
        line-height: 1.34;
      }

      .answer-label {
        font-size: 10px;
        font-weight: 800;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.12em;
      }

      .answer-card p,
      .rationale-card p {
        margin: 5px 0 0;
        font-size: 12px;
        line-height: 1.48;
        white-space: pre-wrap;
      }

      .question-card--first-page .answer-card p,
      .question-card--first-page .rationale-card p,
      .question-card--compact .answer-card p,
      .question-card--compact .rationale-card p {
        margin: 3px 0 0;
        font-size: 11.1px;
        line-height: 1.34;
      }

      .tag-list {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
        margin-top: 7px;
      }

      .question-card--first-page .tag-list,
      .question-card--compact .tag-list {
        gap: 4px;
        margin-top: 5px;
      }

      .tag-item {
        display: inline-flex;
        padding: 4px 8px;
        border-radius: 999px;
        background: ${dark ? "rgba(45, 212, 191, 0.14)" : "rgba(16, 185, 129, 0.09)"};
        color: ${dark ? "#d7fff6" : "#0f766e"};
        font-size: 10.2px;
        font-weight: 700;
      }

      .question-card--first-page .tag-item,
      .question-card--compact .tag-item {
        padding: 2px 6px;
        font-size: 9.5px;
      }

      .overflow-note {
        margin: 0;
        font-size: 10.6px;
        line-height: 1.6;
        color: var(--muted);
      }

      /* This dedicated closing page is always appended after the actual assessment content.
         Preserve its forced page break plus the shared light/dark file-surface tokens here so
         the support message stays the true final page without drifting away from export theming. */
      .support-page {
        position: relative;
        margin-top: 14px;
        overflow: hidden;
        border: 1px solid var(--line);
        border-radius: 20px;
        padding: 18px 18px 16px;
        background:
          linear-gradient(${dark ? "180deg, rgba(4, 13, 27, 0.9), rgba(5, 16, 31, 0.72)" : "180deg, rgba(255, 255, 255, 0.76), rgba(255, 255, 255, 0.52)"}),
          radial-gradient(${dark ? "circle at top right, rgba(103, 232, 216, 0.12), transparent 32%" : "circle at top right, rgba(15, 118, 110, 0.08), transparent 30%"}),
          radial-gradient(${dark ? "circle at bottom left, rgba(56, 189, 248, 0.08), transparent 34%" : "circle at bottom left, rgba(15, 118, 110, 0.06), transparent 28%"});
        box-shadow:
          inset 0 0 0 1px var(--line-strong),
          ${dark ? "0 24px 54px rgba(1, 4, 14, 0.28)" : "0 20px 42px rgba(15, 23, 42, 0.1)"};
        break-before: page;
        page-break-before: always;
        break-inside: avoid;
        page-break-inside: avoid;
      }

      .support-page::before,
      .support-page::after {
        content: "";
        position: absolute;
        inset: auto;
        border-radius: 999px;
        pointer-events: none;
        opacity: ${dark ? "0.8" : "1"};
      }

      .support-page::before {
        top: -58px;
        left: -36px;
        width: 166px;
        height: 166px;
        background: ${dark ? "radial-gradient(circle, rgba(103, 232, 216, 0.14), transparent 68%)" : "radial-gradient(circle, rgba(15, 118, 110, 0.12), transparent 66%)"};
      }

      .support-page::after {
        right: -30px;
        bottom: -54px;
        width: 180px;
        height: 180px;
        background: ${dark ? "radial-gradient(circle, rgba(56, 189, 248, 0.12), transparent 70%)" : "radial-gradient(circle, rgba(242, 198, 106, 0.16), transparent 72%)"};
      }

      /* Keep the final support page as one coherent page composition: support content, signature,
         and footer are intentionally grouped together so the footer cannot break onto a new page. */
      .support-page-composition {
        position: relative;
        z-index: 1;
        display: flex;
        flex-direction: column;
        min-height: 100%;
        gap: 10px;
        break-inside: avoid;
        page-break-inside: avoid;
      }

      .support-page-inner {
        position: relative;
        z-index: 1;
        display: grid;
        gap: 12px;
      }

      .support-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.08fr) minmax(248px, 0.92fr);
        gap: 12px;
        align-items: start;
      }

      .support-main,
      .support-side {
        display: grid;
        gap: 12px;
      }

      .support-eyebrow {
        display: inline-flex;
        align-items: center;
        width: fit-content;
        padding: 4px 10px;
        border-radius: 999px;
        background: var(--accent-soft);
        color: var(--accent);
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }

      .support-title {
        margin: 8px 0 0;
        font-size: 28px;
        line-height: 1.14;
      }

      .support-subtitle {
        margin: 8px 0 0;
        max-width: 34rem;
        font-size: 14px;
        line-height: 1.72;
        color: var(--muted);
      }

      .support-chip-row,
      .support-cost-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 7px;
      }

      .support-chip-row {
        margin-top: 12px;
      }

      .support-cost-grid {
        margin-top: 11px;
      }

      .support-chip {
        display: inline-flex;
        align-items: center;
        min-height: 30px;
        padding: 6px 11px;
        border-radius: 999px;
        border: 1px solid var(--line);
        background: ${dark
          ? "linear-gradient(180deg, rgba(8, 18, 35, 0.92), rgba(4, 11, 24, 0.8))"
          : "rgba(255, 255, 255, 0.72)"};
        font-size: 11.3px;
        font-weight: 700;
        line-height: 1.4;
        color: var(--ink);
      }

      .support-chip--cost {
        background: ${dark ? "rgba(45, 212, 191, 0.12)" : "rgba(16, 185, 129, 0.09)"};
        color: ${dark ? "#defdf6" : "#0f766e"};
      }

      .support-card {
        position: relative;
        border: 1px solid var(--line);
        border-radius: 16px;
        padding: 12px 13px;
        background: ${dark
          ? "linear-gradient(180deg, rgba(7, 18, 35, 0.8), rgba(4, 11, 24, 0.64))"
          : "linear-gradient(180deg, rgba(255, 255, 255, 0.68), rgba(255, 255, 255, 0.44))"};
        box-shadow:
          inset 0 0 0 1px var(--line-strong),
          ${dark ? "0 16px 32px rgba(1, 4, 14, 0.16)" : "0 12px 24px rgba(15, 23, 42, 0.06)"};
        break-inside: avoid;
        page-break-inside: avoid;
      }

      .support-card h3 {
        margin: 0;
        font-size: 15px;
        line-height: 1.4;
      }

      .support-card p {
        margin: 8px 0 0;
        font-size: 12.4px;
        line-height: 1.7;
        color: var(--muted);
      }

      .support-card--lead p {
        margin-top: 0;
        font-size: 13.3px;
        line-height: 1.8;
        color: var(--ink);
        font-weight: 600;
      }

      .support-impact-list {
        display: grid;
        gap: 8px;
        margin-top: 11px;
      }

      .support-impact-item {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        border: 1px solid var(--line);
        border-radius: 12px;
        padding: 8px 10px;
        background: ${dark ? "rgba(7, 18, 35, 0.74)" : "rgba(255, 255, 255, 0.58)"};
      }

      .support-impact-bullet {
        color: var(--accent);
        font-size: 12px;
        font-weight: 800;
        line-height: 1.5;
      }

      .support-impact-item p {
        margin: 0;
        color: var(--ink);
        font-size: 12.1px;
        line-height: 1.62;
        font-weight: 600;
      }

      /* Keep the support contact paths explicit on the final page so the exported file itself
         remains self-sufficient: QR, Contact page path, and direct link all stay visible even
         after the student shares or prints the PDF away from the live app shell. */
      .support-contact-grid {
        display: grid;
        grid-template-columns: 102px minmax(0, 1fr);
        gap: 10px;
        margin-top: 12px;
        align-items: stretch;
      }

      .support-qr-panel {
        display: grid;
        align-content: start;
        justify-items: center;
        gap: 8px;
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 10px 8px;
        background: ${dark ? "rgba(4, 13, 27, 0.88)" : "rgba(255, 255, 255, 0.76)"};
        text-align: center;
      }

      .support-qr-label {
        font-size: 9.8px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--muted);
      }

      .support-qr-card {
        display: grid;
        place-items: center;
        width: 76px;
        height: 76px;
        padding: 4px;
        border-radius: 16px;
        border: 1px solid var(--line);
        background: ${dark
          ? "linear-gradient(180deg, rgba(8, 18, 35, 0.96), rgba(4, 11, 24, 0.86))"
          : "var(--surface-strong)"};
        box-shadow: 0 10px 22px rgba(15, 23, 42, 0.12);
      }

      .support-qr-card img {
        width: 64px;
        height: 64px;
        border-radius: 12px;
        background: white;
        padding: 4px;
      }

      .support-contact-stack {
        display: grid;
        gap: 8px;
      }

      .support-contact-card {
        display: block;
        border: 1px solid var(--line);
        border-radius: 14px;
        padding: 10px 12px;
        background: ${dark ? "rgba(7, 18, 35, 0.78)" : "rgba(255, 255, 255, 0.62)"};
        color: inherit;
        text-decoration: none;
      }

      .support-contact-label {
        display: block;
        font-size: 9.8px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--muted);
      }

      .support-contact-value {
        display: block;
        margin-top: 5px;
        font-size: 12.8px;
        line-height: 1.55;
        color: var(--ink);
        font-weight: 700;
        word-break: break-word;
      }

      .support-personal-note {
        margin-top: 11px !important;
        font-size: 12px !important;
      }

      /* The signature image belongs only on the closing support page.
         Keep it centered between the support body and final closing line so the page ends like a
         signed letter instead of pushing the signature into question-page chrome. */
      .support-signature-wrap {
        display: flex;
        justify-content: center;
        margin: 8px 0 10px;
      }

      .support-signature-card {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 16px 28px;
        border: 1px solid var(--line);
        border-radius: 18px;
        background: ${dark ? "rgba(7, 18, 35, 0.78)" : "rgba(255, 255, 255, 0.7)"};
        box-shadow:
          inset 0 0 0 1px var(--line-strong),
          ${dark ? "0 16px 32px rgba(1, 4, 14, 0.16)" : "0 12px 24px rgba(15, 23, 42, 0.06)"};
      }

      .support-signature-card img {
        display: block;
        width: min(340px, 100%);
        max-width: 100%;
        height: auto;
        object-fit: contain;
      }

      /* The closing line is the final emotional note on the exported file.
         Keep it concise and visually separated so the support page feels intentional and premium,
         not like an appendix or a dense postscript bolted onto the end. */
      .support-closing {
        position: relative;
        z-index: 1;
        margin: 0;
        padding-top: 10px;
        border-top: 1px solid var(--line);
        font-size: 13px;
        line-height: 1.76;
        color: var(--ink);
        font-weight: 600;
      }

      /* Keep the detached HTML preview and real print/PDF footer on the same composition system:
         left seal, centered Arabic attribution line, and right page-number badge. Future agents
         should evolve this shared footer rather than forking the HTML and React file surfaces. */
      .assessment-file-footer {
        display: flex;
        align-items: center;
        gap: 12px;
        /* Footer anchors must remain physically LTR regardless of surrounding RTL support-copy
           containers so the seal stays on the left and the page badge stays on the right. */
        direction: ltr;
        unicode-bidi: isolate;
        border: 1px solid ${dark ? "rgba(94, 234, 212, 0.18)" : "rgba(15, 118, 110, 0.14)"};
        border-radius: 18px;
        padding: 8px 12px;
        background:
          linear-gradient(${dark
            ? "180deg, rgba(4, 13, 27, 0.97), rgba(3, 10, 22, 0.92)"
            : "180deg, rgba(255, 255, 255, 0.88), rgba(246, 251, 249, 0.8)"}),
          radial-gradient(${dark
            ? "circle at left center, rgba(94, 234, 212, 0.08), transparent 34%"
            : "circle at left center, rgba(15, 118, 110, 0.05), transparent 34%"});
        box-shadow:
          inset 0 0 0 1px var(--line-strong),
          ${dark ? "0 12px 28px rgba(1, 4, 14, 0.18)" : "0 10px 22px rgba(15, 23, 42, 0.06)"};
      }

      .screen-footer {
        margin-top: 16px;
      }

      .footer-seal {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: ${footerSideAnchorSize};
        height: ${footerSideAnchorSize};
        flex: none;
        overflow: hidden;
        border: 1px solid ${dark ? "rgba(220, 255, 249, 0.16)" : "rgba(15, 118, 110, 0.14)"};
        border-radius: 999px;
        background: ${dark ? "rgba(255, 255, 255, 0.055)" : "rgba(255, 255, 255, 0.82)"};
      }

      .footer-seal img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: contain;
        padding: ${footerSealImagePaddingPx};
        transform: scale(${footerSealImageScale});
        transform-origin: center;
      }

      .footer-line-wrap {
        min-width: 0;
        flex: 1;
      }

      .footer-line {
        display: inline-flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: center;
        gap: 3px 6px;
        width: 100%;
        margin: 0;
        text-align: center;
        font-size: 10.8px;
        line-height: 1.32;
        font-weight: 700;
        color: var(--ink);
      }

      .footer-line-text {
        min-width: 0;
        max-width: ${footerTextMaxWidth};
        white-space: normal;
        font-family: ${footerTextFontFamily};
      }

      .footer-emoji {
        flex: none;
      }

      .footer-page-badge {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: ${footerSideAnchorSize};
        height: ${footerSideAnchorSize};
        flex: none;
        color: ${dark ? "#dcfff9" : "#0f766e"};
      }

      .footer-page-arc {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
      }

      .footer-page-number {
        position: relative;
        font-size: 16px;
        font-weight: 900;
        letter-spacing: 0.16em;
        font-variant-numeric: tabular-nums;
      }

      .footer-page-number--dynamic::before {
        content: counter(page);
      }

      .print-hint {
        margin-top: 14px;
        font-size: 11px;
        color: var(--muted);
      }

      @page {
        /* The page box owns the true full-page bleed in Chrome print output.
           Keep this foundation matched to the themed file background edge tone so exported PDFs
           never fall back to black or blank border bands around the designed sheet. */
        background: ${pageBackgroundFoundation};
        margin: ${pageMarginTop} ${pageMarginRight} ${pageMarginBottom} ${pageMarginLeft};
      }

      @media screen and (max-width: 760px) {
        /* Keep this fallback screen-only. Printed pages are narrow enough to match this breakpoint,
           and letting it apply during export would collapse the QR out of its corner anchor. */
        .cover-shell {
          ${coverPaddingSide}: 0;
        }

        .hero-qr {
          position: static;
          width: auto;
          flex-direction: row;
          justify-content: flex-end;
          margin-bottom: 10px;
        }

        .hero-faculty-badge {
          position: static;
          width: auto;
          justify-content: flex-end;
          margin-bottom: 8px;
        }

        .hero-faculty-badge-card {
          width: 64px;
        }

        .support-grid,
        .support-contact-grid {
          grid-template-columns: minmax(0, 1fr);
        }

        .support-qr-panel {
          justify-items: start;
          text-align: right;
        }
      }

      @media (max-width: 620px) {
        .choice-list--paired {
          grid-template-columns: minmax(0, 1fr);
        }

        .question-card--first-page {
          min-height: auto;
        }
      }

      @media print {
        html,
        body {
          background: ${pageBackgroundFoundation};
        }

        body {
          padding: 0;
        }

        .screen-background,
        .screen-wash {
          display: none;
        }

        /* The @page foundation owns the outer edge strip, while this fixed layer owns the richer
           themed artwork inside the printed sheet. Keep both layers visually aligned, but do not
           move edge-gap ownership back here because Chrome will not paint page margins from it. */
        /* Dark printed pages still need an opaque inner artwork layer instead of a low-opacity
           image floating over white paper. Preserve that depth so the PDF keeps its midnight mood
           once the page-box foundation removes the old black edge bands. */
        .page-background-print {
          display: block;
          z-index: 0;
          top: calc(-1 * ${pageMarginTop} - ${pageArtworkBleed});
          right: calc(-1 * ${pageMarginRight} - ${pageArtworkBleed});
          bottom: calc(-1 * ${pageMarginBottom} - ${pageArtworkBleed});
          left: calc(-1 * ${pageMarginLeft} - ${pageArtworkBleed});
          opacity: ${dark ? "1" : "0.44"};
        }

        /* This chrome layer decorates the printed sheet above the page-box foundation.
           Keep the frame and fold anchored to the same artwork bounds so future spacing tweaks do
           not reintroduce visible edge gaps between the safe content area and the file background. */
        .page-chrome-print {
          display: block;
          position: fixed;
          top: calc(-1 * ${pageMarginTop} - ${pageArtworkBleed});
          right: calc(-1 * ${pageMarginRight} - ${pageArtworkBleed});
          bottom: calc(-1 * ${pageMarginBottom} - ${pageArtworkBleed});
          left: calc(-1 * ${pageMarginLeft} - ${pageArtworkBleed});
          z-index: 1;
          pointer-events: none;
        }

        .page-chrome-print .page-frame {
          position: absolute;
          inset: ${pageFrameInset};
          border-radius: 0;
        }

        .page-chrome-print .page-fold {
          position: absolute;
          top: 0;
          ${pageFoldSide}: 0;
          width: 24mm;
          height: 24mm;
        }

        /* The safe content area still belongs to the paged sheet, not the full-page foundation.
           Keep exported content inset here so the background can reach the edges cleanly without
           letting cards, QR, or footer copy drift into the trim-sensitive outer page band. */
        .sheet {
          box-shadow: none;
          border: none;
          border-radius: 0;
          max-width: none;
          padding: 0;
          background: transparent;
        }

        .sheet-frame,
        .sheet-fold,
        .print-hint {
          display: none;
        }

        /* Section-static numbering keeps real page numbers across both PDF pathways by relying
           on per-page section numbering instead of engine-dependent CSS page counters. */
        .page-number-mode-static-sections .page-section,
        .page-number-mode-static-sections .support-page {
          min-height: ${staticSectionMinHeight};
          display: flex;
          flex-direction: column;
        }

        /* Keep page footers bound to their owning page section by treating the footer row as a
           non-shrinking trailing block. This protects against print reflow pushing only the footer
           onto a following page when content density fluctuates near page boundaries. */
        .page-number-mode-static-sections .screen-footer {
          display: flex;
          margin-top: auto;
          flex-shrink: 0;
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .page-number-mode-static-sections .support-page-composition {
          flex: 1 1 auto;
          min-height: 0;
        }

        .page-number-mode-static-sections .support-page-inner {
          flex: 1 1 auto;
          min-height: 0;
        }

        /* Final support-page footer stays attached to the physical page bottom in static-section
           mode so the right-side page badge consistently lands in the bottom-right corner. */
        .page-number-mode-static-sections .support-page .screen-footer {
          margin-top: auto;
          padding-top: 6px;
          break-before: avoid;
          page-break-before: avoid;
        }

        .page-number-mode-static-sections .print-footer {
          display: none;
        }

        .page-number-mode-css .screen-footer {
          display: none;
        }

        /* Printed question pages are grouped explicitly through the shared page-slot helper.
           Keep each later section on its own forced page so question counts stay stable instead
           of relying on browser auto-flow to decide whether two or three cards fit. */
        .page-section--question {
          margin-top: 0;
          break-before: page;
          page-break-before: always;
        }

        .first-page-shell {
          gap: 3px;
        }

        .first-page-questions {
          min-height: 0;
          gap: 2px;
        }

        .question-card--first-page {
          min-height: ${firstPageQuestionCardMinHeight};
        }

        .question-page-stack {
          gap: 4px;
        }

        .question-card--compact {
          padding: 7px 9px 7px;
          min-height: ${followingPageQuestionCardPrintMinHeight};
        }

        .support-page {
          margin-top: 0;
          border-radius: 18px;
          padding: ${supportPagePrintPadding};
        }

        .support-page-composition {
          gap: ${supportPagePrintGridGap};
        }

        .support-page-inner {
          gap: ${supportPagePrintGridGap};
        }

        .support-grid {
          gap: ${supportPagePrintGridGap};
        }

        .support-main,
        .support-side {
          gap: 9px;
        }

        .support-title {
          font-size: 22.5px;
          line-height: 1.12;
        }

        .support-subtitle {
          font-size: 12.7px;
          line-height: 1.58;
        }

        .support-card {
          border-radius: 14px;
          padding: ${supportPagePrintCardPadding};
        }

        .support-card p {
          margin-top: 6px;
          font-size: 12px;
          line-height: 1.56;
        }

        .support-card--lead p {
          font-size: 12.7px;
          line-height: 1.62;
        }

        .support-impact-list {
          gap: 6px;
          margin-top: 8px;
        }

        .support-impact-item {
          gap: 6px;
          padding: 6px 8px;
        }

        .support-contact-grid {
          grid-template-columns: 90px minmax(0, 1fr);
          gap: 7px;
          margin-top: 8px;
        }

        .support-qr-card {
          width: 72px;
          height: 72px;
        }

        .support-qr-card img {
          width: 60px;
          height: 60px;
        }

        .support-contact-card {
          padding: 8px 10px;
        }

        .support-personal-note {
          margin-top: 8px !important;
          font-size: 11.4px !important;
          line-height: 1.58 !important;
        }

        .support-signature-wrap {
          margin: 6px 0 8px;
        }

        .support-signature-card {
          padding: 12px 20px;
          border-radius: 16px;
        }

        .support-signature-card img {
          width: ${supportPagePrintSignatureWidth};
        }

        .support-closing {
          padding-top: 8px;
          font-size: 12.3px;
          line-height: 1.62;
        }

        .page-number-mode-css .print-footer {
          display: flex;
          position: fixed;
          /* Fixed print footer must sit against the physical page end, not inside the content
             box margin. Offsetting by the configured page margins prevents the visible dead band
             under the footer and keeps the large strip anchored at the real bottom edge. */
          left: calc(-1 * ${pageMarginLeft} + ${fixedFooterBottomInset});
          right: calc(-1 * ${pageMarginRight} + ${fixedFooterBottomInset});
          bottom: calc(-1 * ${pageMarginBottom} + ${fixedFooterBottomInset});
          z-index: 2;
        }
      }
    </style>
  </head>
  <body class="page-number-mode-${useStaticSectionPageNumbers ? "static-sections" : "css"}">
    <div class="screen-background" aria-hidden="true"></div>
    <div class="screen-wash" aria-hidden="true"></div>
    <div class="page-background-print" aria-hidden="true"></div>
    <div class="page-chrome-print" aria-hidden="true">
      <span class="page-frame"></span>
      <span class="page-fold"></span>
    </div>
    <!-- Printed pages keep the same shared footer composition as detached preview/result pages.
         The print lane repeats this footer on every physical page while the screen sections below
         render numbered footers inline for the browser preview. -->
    ${
      useFixedPrintFooter
        ? renderAssessmentFileFooter({
            footerLine: preview.fileSurface.footerLine,
            sealAssetUrl,
            pageNumberText: "",
            variant: "print",
            enableDynamicPageNumber: pageNumberMode === "css",
          })
        : ""
    }
    <main class="sheet">
      <span class="sheet-frame" aria-hidden="true"></span>
      <span class="sheet-fold" aria-hidden="true"></span>

      <section class="page-section page-section--cover">
        <section class="first-page-shell">
          <section class="cover-shell">
            <div class="hero-faculty-badge" aria-hidden="true">
              <span class="hero-faculty-badge-card">
                <img src="${escapeHtml(facultyBadgeAssetUrl)}" alt="" />
              </span>
            </div>

            <div class="hero-qr">
              <span class="hero-qr-card">
                <img src="${escapeHtml(qrCodeDataUrl)}" alt="${escapeHtml(
                  contentLanguage === "ar" ? "رمز QR لمنصة زوتوبيا" : "QR code for Zootopia Club",
                )}" />
              </span>
            </div>

            <header class="cover-brand">
              <img class="brand-logo" src="${escapeHtml(preview.fileSurface.logoAssetUrl)}" alt="${escapeHtml(preview.fileSurface.platformName)}" />
              <div class="cover-copy">
                <span class="brand-eyebrow">${escapeHtml(preview.fileSurface.platformTagline)}</span>
                <span class="brand-name">${escapeHtml(preview.fileSurface.platformName)}</span>
                <span class="eyebrow">${escapeHtml(pdfEyebrow)}</span>
                <h1>${escapeHtml(preview.title)}</h1>
                <div class="summary-panel">
                  <span class="summary-chip">${escapeHtml(summaryLabel)}</span>
                  <p class="summary">${escapeHtml(preview.summary)}</p>
                </div>
              </div>
            </header>

            <section class="meta-ribbon">${metadata}</section>
            ${compositionBadges ? `<section class="composition-ribbon">${compositionBadges}</section>` : ""}
          </section>

          ${
            firstPageQuestionCards
              ? `
                <section class="first-page-questions">
                  ${firstPageQuestionCards}
                </section>
              `
              : ""
          }
        </section>
        ${
          firstQuestionPage.usesOverflowFallback
            ? `<p class="overflow-note">Long-content safety fallback applied on this page to preserve clean borders and prevent card overlap.</p>`
            : ""
        }
        ${renderAssessmentFileFooter({
          footerLine: preview.fileSurface.footerLine,
          sealAssetUrl,
          pageNumberText: "1",
          variant: "screen",
        })}
      </section>

      ${followingQuestionPageSections}

      <!-- This closing support page is intentionally appended after every real assessment page.
           Future agents should keep it as the final standalone sheet, preserve its Arabic-only
           hierarchy, and continue sourcing its copy/paths from the shared file-surface contract. -->
      <section class="page-section support-page" dir="rtl" lang="ar">
        <div class="support-page-composition">
          <div class="support-page-inner">
            <div class="support-grid">
              <div class="support-main">
                <header>
                  <span class="support-eyebrow">${escapeHtml(supportPage.eyebrow)}</span>
                  <h2 class="support-title">${escapeHtml(supportPage.title)}</h2>
                  <p class="support-subtitle">${escapeHtml(supportPage.subtitle)}</p>
                  <div class="support-chip-row">
                    ${supportHeroChips}
                  </div>
                </header>

                <article class="support-card support-card--lead">
                  <p>${escapeHtml(supportPage.emotionalNote)}</p>
                </article>

                <article class="support-card">
                  <h3>${escapeHtml(supportPage.continuityTitle)}</h3>
                  <p>${escapeHtml(supportPage.continuityBody)}</p>
                </article>

                <article class="support-card">
                  <h3>${escapeHtml(supportPage.costTitle)}</h3>
                  <div class="support-cost-grid">
                    ${supportCostItems}
                  </div>
                </article>
              </div>

              <aside class="support-side">
                <article class="support-card">
                  <h3>${escapeHtml(supportPage.impactTitle)}</h3>
                  <div class="support-impact-list">
                    ${supportImpactItems}
                  </div>
                </article>

                <article class="support-card">
                  <h3>${escapeHtml(supportPage.contactTitle)}</h3>
                  <p>${escapeHtml(supportPage.contactBody)}</p>
                  <div class="support-contact-grid">
                    <div class="support-qr-panel">
                      <span class="support-qr-label">${escapeHtml(supportPage.qrLabel)}</span>
                      <span class="support-qr-card">
                        <img
                          src="${escapeHtml(qrCodeDataUrl)}"
                          alt="${escapeHtml("رمز QR للدعم والتواصل مع مطور المنصة")}" 
                        />
                      </span>
                    </div>
                    <div class="support-contact-stack">
                      ${supportContactCards}
                    </div>
                  </div>
                  <p class="support-personal-note">${escapeHtml(supportPage.personalContactNote)}</p>
                </article>
              </aside>
            </div>

            <div class="support-signature-wrap">
              <span class="support-signature-card">
                <img src="${escapeHtml(supportPage.signatureAssetUrl)}" alt="" />
              </span>
            </div>
            <p class="support-closing">${escapeHtml(supportPage.closingLine)}</p>
          </div>
          ${renderAssessmentFileFooter({
            footerLine: preview.fileSurface.footerLine,
            sealAssetUrl,
            pageNumberText: String(supportPageNumber),
            variant: "screen",
          })}
        </div>
      </section>

      <p class="print-hint">${escapeHtml(printHint)}</p>
    </main>
    ${
      autoPrint
        ? `<script>
      /* The print surface should auto-open the browser dialog only when a human intentionally
         visits the print view. Server-generated PDF rendering reuses the same HTML without this
         side effect so the backend can capture real PDF bytes deterministically. */
      window.addEventListener("load", () => {
        window.setTimeout(() => window.print(), 120);
      });
    </script>`
        : ""
    }
  </body>
</html>`;
}
