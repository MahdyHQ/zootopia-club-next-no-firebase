import "server-only";

import {
  getAssessmentArtifactRecordKey,
  loadAssessmentArtifact,
  persistAssessmentExportArtifact,
} from "@/lib/server/assessment-artifact-storage";
import { buildAssessmentGeneratedFileName } from "@/lib/server/export-file-naming";
import { buildAssessmentFileQrDataUrl } from "@/lib/server/assessment-file-qr";
import type { AssessmentExportRouteContext } from "@/lib/server/assessment-export-route-context";
import { buildAssessmentPdfBuffer } from "@/lib/server/assessment-pdf-download";
import {
  ASSESSMENT_PRINT_LAYOUT_VERSION,
  buildAssessmentPrintHtml,
} from "@/lib/server/assessment-print-renderer";
import { appendAdminLog, saveAssessmentGeneration } from "@/lib/server/repository";
import { getServerRuntimeOrigin } from "@/lib/server/runtime-base-url";

export const ASSESSMENT_PRO_PDF_LANE_VERSION = `pro-${ASSESSMENT_PRINT_LAYOUT_VERSION}`;

export async function buildAssessmentProPdfResponse(input: AssessmentExportRouteContext) {
  const expectedArtifactFileName = buildAssessmentGeneratedFileName({
    generation: input.generation,
    extension: "pdf",
  });
  const downloadFileName = expectedArtifactFileName;
  const artifactKey = getAssessmentArtifactRecordKey({
    kind: "export-pdf",
    locale: input.uiContext.locale,
    themeMode: input.themeMode,
  });
  const existingArtifact = input.generation.artifacts?.[artifactKey];
  const existingBuffer = existingArtifact
    ? await loadAssessmentArtifact(existingArtifact, input.user.uid)
    : null;
  const canReuseExistingArtifact =
    existingArtifact?.fileName === expectedArtifactFileName &&
    existingArtifact?.versionTag === ASSESSMENT_PRO_PDF_LANE_VERSION &&
    Boolean(existingBuffer);

  if (!canReuseExistingArtifact) {
    const qrCodeDataUrl = await buildAssessmentFileQrDataUrl();
    const documentBaseUrl = getServerRuntimeOrigin();
    const html = buildAssessmentPrintHtml({
      preview: input.preview,
      themeMode: input.themeMode,
      qrCodeDataUrl,
      autoPrint: false,
      pageNumberMode: "static-sections",
      /* The Pro lane renders through Puppeteer/Chromium, so public assets need an absolute base
         URL at capture time. Keep this lane-specific concern out of the Fast browser-print lane.
         Use the canonical runtime origin so host-header spoofing cannot influence Puppeteer fetches. */
      documentBaseUrl,
    });
    const pdfBuffer = await buildAssessmentPdfBuffer({
      html,
    });
    const storedArtifact = await persistAssessmentExportArtifact({
      ownerUid: input.user.uid,
      generationId: input.generation.id,
      kind: "export-pdf",
      locale: input.uiContext.locale,
      themeMode: input.themeMode,
      /* The Pro lane owns its own downloadable PDF artifact and version tag. Preserve this
         boundary so future premium charts, graphs, and richer branded layouts can invalidate or
         expand the Pro cache without colliding with the Fast lane's HTML artifact namespace. */
      fileName: expectedArtifactFileName,
      versionTag: ASSESSMENT_PRO_PDF_LANE_VERSION,
      fileExtension: "pdf",
      contentType: "application/pdf",
      body: pdfBuffer,
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
      action: "assessment-export-pdf-pro",
      resourceType: "assessment-export",
      resourceId: input.generation.id,
      route: "/api/assessment/export/pdf/pro/[id]",
      metadata: {
        lane: "pro",
        themeMode: input.themeMode,
        layoutVersion: ASSESSMENT_PRO_PDF_LANE_VERSION,
      },
    });

    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${downloadFileName}"`,
      },
    });
  }

  await appendAdminLog({
    actorUid: input.user.uid,
    actorRole: input.user.role,
    ownerUid: input.user.uid,
    ownerRole: input.user.role,
    action: "assessment-export-pdf-pro",
    resourceType: "assessment-export",
    resourceId: input.generation.id,
    route: "/api/assessment/export/pdf/pro/[id]",
    metadata: {
      lane: "pro",
      themeMode: input.themeMode,
      layoutVersion: ASSESSMENT_PRO_PDF_LANE_VERSION,
    },
  });

  return new Response(new Uint8Array(existingBuffer as Uint8Array), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${downloadFileName}"`,
    },
  });
}
