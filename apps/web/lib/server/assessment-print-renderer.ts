import "server-only";

import type { NormalizedAssessmentPreview } from "@/lib/assessment-preview-model";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function buildAssessmentPrintHtml(preview: NormalizedAssessmentPreview) {
  const isRtl = preview.direction === "rtl";
  const questionCards = preview.questions
    .map(
      (question) => `
        <article class="question-card">
          <div class="question-header">
            <span class="question-index">${question.index + 1}</span>
            ${question.typeLabel ? `<span class="question-type">${escapeHtml(question.typeLabel)}</span>` : ""}
          </div>
          <h2 class="question-title">${escapeHtml(question.question)}</h2>
          <div class="answer-card">
            <div class="answer-label">${escapeHtml(preview.locale === "ar" ? "الإجابة" : "Answer")}</div>
            <p>${escapeHtml(question.answer)}</p>
          </div>
          ${
            question.rationale
              ? `<p class="rationale"><strong>${escapeHtml(preview.locale === "ar" ? "التبرير" : "Rationale")}:</strong> ${escapeHtml(question.rationale)}</p>`
              : ""
          }
          ${
            question.tags.length > 0
              ? `<p class="tags"><strong>${escapeHtml(preview.locale === "ar" ? "الوسوم" : "Tags")}:</strong> ${escapeHtml(question.tags.join(", "))}</p>`
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
        color-scheme: light;
        --ink: #101828;
        --muted: #475467;
        --line: #d0d5dd;
        --accent: #2563eb;
        --surface: #ffffff;
        --surface-soft: #f8fafc;
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        padding: 24px;
        background: linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%);
        color: var(--ink);
        font-family: "Segoe UI", Tahoma, Arial, sans-serif;
        direction: ${isRtl ? "rtl" : "ltr"};
      }

      .sheet {
        max-width: 920px;
        margin: 0 auto;
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: 24px;
        padding: 32px;
        box-shadow: 0 20px 60px rgba(15, 23, 42, 0.12);
      }

      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 14px;
        border-radius: 999px;
        background: rgba(37, 99, 235, 0.1);
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
        line-height: 1.7;
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
        page-break-inside: avoid;
      }

      .question-header {
        display: flex;
        align-items: center;
        justify-content: ${isRtl ? "flex-end" : "space-between"};
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
        background: rgba(37, 99, 235, 0.1);
        color: var(--accent);
        font-weight: 700;
      }

      .question-type {
        display: inline-flex;
        align-items: center;
        padding: 6px 10px;
        border-radius: 999px;
        background: rgba(15, 23, 42, 0.05);
        color: var(--muted);
        font-size: 12px;
        font-weight: 700;
      }

      .question-title {
        margin: 0 0 16px;
        font-size: 20px;
        line-height: 1.55;
      }

      .answer-card {
        border: 1px solid var(--line);
        border-radius: 18px;
        background: var(--surface-soft);
        padding: 16px;
      }

      .answer-label {
        font-size: 12px;
        font-weight: 700;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }

      .answer-card p,
      .rationale,
      .tags {
        margin: 10px 0 0;
        font-size: 15px;
        line-height: 1.7;
      }

      .print-hint {
        margin-top: 22px;
        font-size: 13px;
        color: var(--muted);
      }

      @media print {
        body {
          background: white;
          padding: 0;
        }

        .sheet {
          box-shadow: none;
          border: none;
          border-radius: 0;
          max-width: none;
          padding: 0;
        }

        .print-hint {
          display: none;
        }
      }
    </style>
  </head>
  <body>
    <main class="sheet">
      <div class="eyebrow">${escapeHtml(preview.locale === "ar" ? "تصدير PDF" : "PDF export")}</div>
      <h1>${escapeHtml(preview.title)}</h1>
      <p class="summary">${escapeHtml(preview.summary)}</p>
      <section class="meta-grid">${metadata}</section>
      <section>${questionCards}</section>
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
