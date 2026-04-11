import "server-only";

import {
  getAssessmentArtifactRecordKey,
  loadAssessmentArtifact,
  persistAssessmentExportArtifact,
} from "@/lib/server/assessment-artifact-storage";
import { buildAssessmentGeneratedFileName } from "@/lib/server/export-file-naming";
import { buildAssessmentFileQrDataUrl } from "@/lib/server/assessment-file-qr";
import type { AssessmentExportRouteContext } from "@/lib/server/assessment-export-route-context";
import {
  ASSESSMENT_PRINT_LAYOUT_VERSION,
  buildAssessmentPrintHtml,
} from "@/lib/server/assessment-print-renderer";
import { appendAdminLog, saveAssessmentGeneration } from "@/lib/server/repository";

export const ASSESSMENT_FAST_PDF_LANE_VERSION = `fast-${ASSESSMENT_PRINT_LAYOUT_VERSION}`;

export async function buildAssessmentFastPdfResponse(input: AssessmentExportRouteContext) {
  const artifactKey = getAssessmentArtifactRecordKey({
    kind: "export-print-html",
    locale: input.uiContext.locale,
    themeMode: input.themeMode,
  });
  const expectedFileName = buildAssessmentGeneratedFileName({
    generation: input.generation,
    extension: "html",
  });
  const existingArtifact = input.generation.artifacts?.[artifactKey];
  const existingBuffer = existingArtifact
    ? await loadAssessmentArtifact(existingArtifact, input.user.uid)
    : null;
  const canReuseExistingArtifact =
    existingArtifact?.fileName === expectedFileName &&
    existingArtifact?.versionTag === ASSESSMENT_FAST_PDF_LANE_VERSION &&
    Boolean(existingBuffer);

  if (!canReuseExistingArtifact) {
    const qrCodeDataUrl = await buildAssessmentFileQrDataUrl();
    const html = buildAssessmentPrintHtml({
      preview: input.preview,
      themeMode: input.themeMode,
      qrCodeDataUrl,
      pageNumberMode: "static-sections",
    });
    const storedArtifact = await persistAssessmentExportArtifact({
      ownerUid: input.user.uid,
      generationId: input.generation.id,
      kind: "export-print-html",
      locale: input.uiContext.locale,
      themeMode: input.themeMode,
      /* The Fast lane owns only the lightweight print-surface HTML artifact. Keep this cached
         separately from the Pro PDF bytes so future premium rendering work can expand without
         inheriting the fast lane's cache identity or browser-print contract. */
      fileName: expectedFileName,
      versionTag: ASSESSMENT_FAST_PDF_LANE_VERSION,
      fileExtension: "html",
      contentType: "text/html; charset=utf-8",
      body: html,
      createdAt: new Date().toISOString(),
    });

    if (storedArtifact) {
      await saveAssessmentGeneration({
        ...input.generation,
        artifacts: {
          ...(input.generation.artifacts ?? {}),
          [storedArtifact.key]: storedArtifact,
        },
        updatedAt: new Date().toISOString(),
      });
    }

    await appendAdminLog({
      actorUid: input.user.uid,
      actorRole: input.user.role,
      ownerUid: input.user.uid,
      ownerRole: input.user.role,
      action: "assessment-export-pdf-fast",
      resourceType: "assessment-export",
      resourceId: input.generation.id,
      route: "/api/assessment/export/pdf/fast/[id]",
      metadata: {
        lane: "fast",
        themeMode: input.themeMode,
        layoutVersion: ASSESSMENT_FAST_PDF_LANE_VERSION,
      },
    });

    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
    });
  }

  await appendAdminLog({
    actorUid: input.user.uid,
    actorRole: input.user.role,
    ownerUid: input.user.uid,
    ownerRole: input.user.role,
    action: "assessment-export-pdf-fast",
    resourceType: "assessment-export",
    resourceId: input.generation.id,
    route: "/api/assessment/export/pdf/fast/[id]",
    metadata: {
      lane: "fast",
      themeMode: input.themeMode,
      layoutVersion: ASSESSMENT_FAST_PDF_LANE_VERSION,
    },
  });

  return new Response(new TextDecoder().decode(existingBuffer as Uint8Array), {
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
}
