export function buildAssessmentPreviewRoute(id: string) {
  return `/assessment/preview/${encodeURIComponent(id)}`;
}

export function buildAssessmentResultRoute(id: string) {
  return `/assessment/results/${encodeURIComponent(id)}`;
}

export function buildAssessmentResultApiRoute(id: string) {
  return `/api/assessment/results/${encodeURIComponent(id)}`;
}

export function buildAssessmentJsonExportRoute(id: string) {
  return `/api/assessment/export/json/${encodeURIComponent(id)}`;
}

export function buildAssessmentMarkdownExportRoute(id: string) {
  return `/api/assessment/export/markdown/${encodeURIComponent(id)}`;
}

export function buildAssessmentDocxExportRoute(id: string) {
  return `/api/assessment/export/docx/${encodeURIComponent(id)}`;
}

export function buildAssessmentPdfExportRoute(id: string) {
  return `/api/assessment/export/pdf/${encodeURIComponent(id)}`;
}
