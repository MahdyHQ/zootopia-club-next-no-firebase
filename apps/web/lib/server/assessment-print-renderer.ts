import "server-only";

import type {
  AssessmentPreviewThemeMode,
  NormalizedAssessmentPreview,
} from "@/lib/assessment-preview-model";
import { getProtectedSignatureCopy } from "@/lib/branding/protected-signature";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function buildAssessmentPrintHtml(input: {
  preview: NormalizedAssessmentPreview;
  themeMode: AssessmentPreviewThemeMode;
  qrCodeDataUrl: string;
}) {
  const { preview, themeMode, qrCodeDataUrl } = input;
  const dark = themeMode === "dark";
  const signature = getProtectedSignatureCopy(preview.locale);
  const backgroundUrl = dark
    ? preview.fileSurface.backgroundDarkUrl
    : preview.fileSurface.backgroundLightUrl;
  const questionCards = preview.questions
    .map(
      (question) => `
        <article class="question-card">
          <div class="question-header">
            <span class="question-index">${question.index + 1}</span>
            ${question.typeLabel ? `<span class="question-type">${escapeHtml(question.typeLabel)}</span>` : ""}
          </div>
          <h2 class="question-title">${escapeHtml(question.stem)}</h2>
          ${
            question.choiceLines.length > 0
              ? `
                <div class="choice-list">
                  ${question.choiceLines
                    .map(
                      (choiceLine) => `<div class="choice-item">${escapeHtml(choiceLine)}</div>`,
                    )
                    .join("")}
                </div>
              `
              : ""
          }
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
            <div class="answer-label">${escapeHtml(preview.locale === "ar" ? "الإجابة" : "Answer")}</div>
            <p>${escapeHtml(question.answer)}</p>
          </div>
          ${
            question.rationale
              ? `
                <div class="rationale-card">
                  <div class="answer-label">${escapeHtml(preview.locale === "ar" ? "التبرير" : "Rationale")}</div>
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
      `.trim(),
    )
    .join("\n");
  const metadata = preview.metadata
    .map(
      (item) => `
        <div class="meta-item">
          <span class="meta-label">${escapeHtml(item.label)}</span>
          <span class="meta-value">${escapeHtml(item.value)}</span>
        </div>
      `.trim(),
    )
    .join("\n");

  return `<!doctype html>
<html lang="${preview.locale}" dir="${preview.direction}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(preview.title)}</title>
    <style>
      :root {
        color-scheme: ${dark ? "dark" : "light"};
        --ink: ${dark ? "#f8fafc" : "#0f172a"};
        --muted: ${dark ? "#cbd5e1" : "#475569"};
        --line: ${dark ? "rgba(226, 232, 240, 0.12)" : "rgba(15, 23, 42, 0.12)"};
        --accent: ${dark ? "#5eead4" : "#0f766e"};
        --accent-soft: ${dark ? "rgba(94, 234, 212, 0.14)" : "rgba(15, 118, 110, 0.1)"};
        --surface: ${dark ? "rgba(2, 12, 24, 0.88)" : "rgba(255, 255, 255, 0.9)"};
        --surface-strong: ${dark ? "rgba(2, 12, 24, 0.94)" : "rgba(255, 255, 255, 0.96)"};
        --surface-soft: ${dark ? "rgba(15, 23, 42, 0.34)" : "rgba(248, 250, 252, 0.92)"};
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        padding: 24px;
        background: ${dark ? "#020617" : "#e2e8f0"};
        color: var(--ink);
        font-family: "Segoe UI", Tahoma, Arial, sans-serif;
      }

      .screen-background,
      .page-background-print {
        position: fixed;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .screen-background {
        z-index: 0;
        opacity: ${dark ? "0.16" : "0.2"};
      }

      .screen-wash {
        position: fixed;
        inset: 0;
        z-index: 0;
        background: ${dark ? "rgba(2, 12, 24, 0.78)" : "rgba(255, 255, 255, 0.72)"};
      }

      .page-background-print,
      .page-chrome-print,
      .print-footer {
        display: none;
      }

      .sheet {
        position: relative;
        z-index: 1;
        max-width: 920px;
        margin: 0 auto;
        overflow: hidden;
        border: 1px solid var(--line);
        border-radius: 28px;
        padding: 32px;
        background:
          linear-gradient(${dark ? "180deg, rgba(2, 12, 24, 0.72), rgba(2, 12, 24, 0.9)" : "180deg, rgba(255, 255, 255, 0.62), rgba(255, 255, 255, 0.92)"}),
          url("${escapeHtml(backgroundUrl)}");
        background-position: center;
        background-size: cover;
        box-shadow: ${dark ? "0 28px 80px rgba(2, 6, 23, 0.5)" : "0 24px 64px rgba(15, 23, 42, 0.14)"};
      }

      .sheet-corner {
        position: absolute;
        width: 46px;
        height: 46px;
        border-color: ${dark ? "rgba(153, 246, 228, 0.44)" : "rgba(15, 118, 110, 0.28)"};
        border-style: solid;
        border-width: 0;
        border-radius: 16px;
      }

      .sheet-corner--top-left {
        top: 20px;
        left: 20px;
        border-top-width: 1.5px;
        border-left-width: 1.5px;
      }

      .sheet-corner--top-right {
        top: 20px;
        right: 20px;
        border-top-width: 1.5px;
        border-right-width: 1.5px;
      }

      .sheet-corner--bottom-left {
        left: 20px;
        bottom: 20px;
        border-bottom-width: 1.5px;
        border-left-width: 1.5px;
      }

      .sheet-corner--bottom-right {
        right: 20px;
        bottom: 20px;
        border-right-width: 1.5px;
        border-bottom-width: 1.5px;
      }

      .header-rail {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 20px;
        margin-bottom: 18px;
      }

      .brand-lockup {
        display: flex;
        align-items: center;
        gap: 14px;
        min-width: 0;
      }

      .brand-logo {
        width: 64px;
        height: 64px;
        flex: none;
        border-radius: 20px;
        box-shadow: 0 10px 24px rgba(15, 23, 42, 0.16);
      }

      .brand-eyebrow {
        display: block;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--muted);
      }

      .brand-name {
        display: block;
        margin-top: 6px;
        font-size: 24px;
        font-weight: 700;
        line-height: 1.2;
        color: var(--ink);
      }

      .qr-card {
        display: inline-flex;
        align-items: center;
        gap: 12px;
        flex: none;
        border: 1px solid var(--line);
        border-radius: 22px;
        padding: 12px;
        background: var(--surface-strong);
        box-shadow: 0 12px 28px rgba(15, 23, 42, 0.14);
      }

      .qr-card img {
        width: 88px;
        height: 88px;
        border-radius: 18px;
        background: white;
        padding: 6px;
      }

      .qr-eyebrow {
        display: block;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--muted);
      }

      .qr-link {
        display: block;
        margin-top: 6px;
        font-size: 14px;
        font-weight: 700;
        color: var(--ink);
      }

      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 14px;
        border-radius: 999px;
        background: var(--accent-soft);
        color: var(--accent);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      h1 {
        margin: 18px 0 8px;
        font-size: 32px;
        line-height: 1.15;
      }

      .summary {
        margin: 0;
        font-size: 16px;
        line-height: 1.8;
        color: var(--muted);
      }

      .meta-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
        margin: 24px 0 28px;
      }

      .meta-item {
        border: 1px solid var(--line);
        background: var(--surface-soft);
        border-radius: 18px;
        padding: 14px 16px;
      }

      .meta-label {
        display: block;
        font-size: 12px;
        font-weight: 700;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }

      .meta-value {
        display: block;
        margin-top: 8px;
        font-size: 14px;
        font-weight: 600;
      }

      .question-card {
        border: 1px solid var(--line);
        border-radius: 22px;
        padding: 22px;
        margin-bottom: 18px;
        background: var(--surface-soft);
        break-inside: avoid;
        page-break-inside: avoid;
      }

      .question-header {
        display: flex;
        align-items: center;
        justify-content: ${preview.direction === "rtl" ? "flex-end" : "space-between"};
        gap: 10px;
        margin-bottom: 12px;
      }

      .question-index {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 34px;
        height: 34px;
        border-radius: 999px;
        background: var(--accent-soft);
        color: var(--accent);
        font-weight: 700;
      }

      .question-type {
        display: inline-flex;
        align-items: center;
        padding: 6px 10px;
        border-radius: 999px;
        background: ${dark ? "rgba(255, 255, 255, 0.08)" : "rgba(15, 23, 42, 0.05)"};
        color: var(--muted);
        font-size: 12px;
        font-weight: 700;
      }

      .question-title {
        margin: 0;
        font-size: 20px;
        line-height: 1.65;
        white-space: pre-wrap;
      }

      .choice-list {
        display: grid;
        gap: 10px;
        margin-top: 16px;
      }

      .choice-item {
        border: 1px solid var(--line);
        border-radius: 16px;
        padding: 12px 14px;
        background: var(--surface-strong);
        font-size: 14px;
        font-weight: 600;
        line-height: 1.65;
      }

      .supplemental-copy {
        margin-top: 14px;
      }

      .supplemental-copy p {
        margin: 0 0 8px;
        font-size: 14px;
        line-height: 1.7;
        color: var(--muted);
      }

      .answer-card,
      .rationale-card {
        border: 1px solid var(--line);
        border-radius: 18px;
        background: var(--surface-strong);
        padding: 16px;
        margin-top: 16px;
      }

      .answer-label {
        font-size: 12px;
        font-weight: 700;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }

      .answer-card p,
      .rationale-card p {
        margin: 10px 0 0;
        font-size: 15px;
        line-height: 1.8;
        white-space: pre-wrap;
      }

      .tag-list {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 16px;
      }

      .tag-item {
        display: inline-flex;
        padding: 6px 10px;
        border-radius: 999px;
        background: ${dark ? "rgba(16, 185, 129, 0.16)" : "rgba(16, 185, 129, 0.1)"};
        color: ${dark ? "#d1fae5" : "#0f766e"};
        font-size: 12px;
        font-weight: 700;
      }

      .screen-footer,
      .print-footer {
        align-items: center;
        gap: 12px;
        border: 1px solid ${dark ? "rgba(94, 234, 212, 0.16)" : "rgba(15, 118, 110, 0.16)"};
        border-radius: 20px;
        padding: 12px 14px;
        background: ${dark ? "rgba(2, 12, 24, 0.9)" : "rgba(255, 255, 255, 0.92)"};
      }

      .screen-footer {
        display: flex;
        margin-top: 28px;
      }

      .signature-copy {
        min-width: 0;
        flex: 1;
      }

      .signature-label {
        display: block;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--accent);
      }

      .signature-text {
        margin: 6px 0 0;
        font-size: 13px;
        line-height: 1.8;
        color: var(--ink);
      }

      .print-hint {
        margin-top: 22px;
        font-size: 13px;
        color: var(--muted);
      }

      @page {
        margin: 18mm 14mm 24mm;
      }

      @media (max-width: 760px) {
        .header-rail {
          flex-direction: column;
        }

        .qr-card {
          width: 100%;
        }
      }

      @media print {
        body {
          background: white;
          padding: 0;
        }

        .screen-background,
        .screen-wash {
          display: none;
        }

        .page-background-print {
          display: block;
          z-index: 0;
          opacity: ${dark ? "0.16" : "0.2"};
        }

        .page-chrome-print {
          display: block;
          position: fixed;
          inset: 0;
          z-index: 1;
          pointer-events: none;
        }

        .page-chrome-print .sheet-corner {
          position: fixed;
        }

        .sheet {
          box-shadow: none;
          border: none;
          border-radius: 0;
          max-width: none;
          padding: 0;
          background: transparent;
        }

        .screen-footer,
        .print-hint {
          display: none;
        }

        /* This fixed footer repeats the shared Arabic signature copy on every printed page.
           Keep it lightweight and within the page margin so the print-first PDF lane gains
           all-pages branding without replacing the existing browser-print architecture. */
        .print-footer {
          display: flex;
          position: fixed;
          left: 14mm;
          right: 14mm;
          bottom: 6mm;
          z-index: 2;
        }
      }
    </style>
  </head>
  <body>
    <img class="screen-background" src="${escapeHtml(backgroundUrl)}" alt="" />
    <div class="screen-wash"></div>
    <img class="page-background-print" src="${escapeHtml(backgroundUrl)}" alt="" />
    <div class="page-chrome-print" aria-hidden="true">
      <span class="sheet-corner sheet-corner--top-left"></span>
      <span class="sheet-corner sheet-corner--top-right"></span>
      <span class="sheet-corner sheet-corner--bottom-left"></span>
      <span class="sheet-corner sheet-corner--bottom-right"></span>
    </div>
    <footer class="print-footer" dir="rtl">
      <div class="signature-copy">
        <span class="signature-label">${escapeHtml(signature.label)}</span>
        <p class="signature-text">${escapeHtml(preview.fileSurface.footerText)}</p>
      </div>
    </footer>
    <main class="sheet">
      <span class="sheet-corner sheet-corner--top-left" aria-hidden="true"></span>
      <span class="sheet-corner sheet-corner--top-right" aria-hidden="true"></span>
      <span class="sheet-corner sheet-corner--bottom-left" aria-hidden="true"></span>
      <span class="sheet-corner sheet-corner--bottom-right" aria-hidden="true"></span>

      <header class="header-rail">
        <div class="brand-lockup">
          <img class="brand-logo" src="${escapeHtml(preview.fileSurface.logoAssetUrl)}" alt="${escapeHtml(preview.fileSurface.platformName)}" />
          <div>
            <span class="brand-eyebrow">${escapeHtml(preview.fileSurface.platformTagline)}</span>
            <span class="brand-name">${escapeHtml(preview.fileSurface.platformName)}</span>
          </div>
        </div>
        <div class="qr-card">
          <img src="${escapeHtml(qrCodeDataUrl)}" alt="${escapeHtml(
            preview.locale === "ar" ? "رمز QR لمنصة زوتوبيا" : "QR code for Zootopia Club",
          )}" />
          <div>
            <span class="qr-eyebrow">QR</span>
            <span class="qr-link">${escapeHtml(
              preview.fileSurface.qrTargetUrl.replace(/^https?:\/\//, ""),
            )}</span>
          </div>
        </div>
      </header>

      <div class="eyebrow">${escapeHtml(preview.locale === "ar" ? "تصدير PDF" : "PDF export")}</div>
      <h1>${escapeHtml(preview.title)}</h1>
      <p class="summary">${escapeHtml(preview.summary)}</p>
      <section class="meta-grid">${metadata}</section>
      <section>${questionCards}</section>

      <footer class="screen-footer" dir="rtl">
        <div class="signature-copy">
          <span class="signature-label">${escapeHtml(signature.label)}</span>
          <p class="signature-text">${escapeHtml(preview.fileSurface.footerText)}</p>
        </div>
      </footer>

      <p class="print-hint">${escapeHtml(
        preview.locale === "ar"
          ? "استخدم نافذة الطباعة في المتصفح ثم اختر Save as PDF."
          : "Use your browser print dialog and choose Save as PDF.",
      )}</p>
    </main>
    <script>
      window.addEventListener("load", () => {
        window.setTimeout(() => window.print(), 120);
      });
    </script>
  </body>
</html>`;
}
