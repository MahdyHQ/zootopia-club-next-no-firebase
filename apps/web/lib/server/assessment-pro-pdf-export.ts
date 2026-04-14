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
  AssessmentPdfBufferError,
  buildAssessmentPdfBuffer,
} from "@/lib/server/assessment-pdf-download";
import {
  ASSESSMENT_PRINT_LAYOUT_VERSION,
  buildAssessmentPrintHtml,
} from "@/lib/server/assessment-print-renderer";
import { appendAdminLog, saveAssessmentGeneration } from "@/lib/server/repository";
import { getServerRuntimeOrigin } from "@/lib/server/runtime-base-url";

export const ASSESSMENT_PRO_PDF_LANE_VERSION = `pro-${ASSESSMENT_PRINT_LAYOUT_VERSION}`;

export type AssessmentProPdfFailureStage =
  | "artifact-load"
  | "qr-build"
  | "html-render"
  | "pdf-buffer"
  | "artifact-store"
  | "generation-save"
  | "audit-log";

export class AssessmentProPdfExportError extends Error {
  readonly stage: AssessmentProPdfFailureStage;
  readonly errorCode: string;
  readonly context: Record<string, unknown>;
  readonly causeError: unknown;

  constructor(input: {
    stage: AssessmentProPdfFailureStage;
    message: string;
    errorCode: string;
    context?: Record<string, unknown>;
    causeError: unknown;
  }) {
    super(input.message);
    this.name = "AssessmentProPdfExportError";
    this.stage = input.stage;
    this.errorCode = input.errorCode;
    this.context = input.context ?? {};
    this.causeError = input.causeError;
  }
}

function getErrorCode(error: unknown) {
  if (error instanceof AssessmentProPdfExportError || error instanceof AssessmentPdfBufferError) {
    return error.errorCode;
  }

  if (typeof error === "object" && error && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code.trim()) {
      return code;
    }
  }

  if (error instanceof Error && error.name) {
    return error.name;
  }

  return "UNKNOWN";
}

function summarizeError(error: unknown) {
  if (error instanceof AssessmentPdfBufferError) {
    return {
      name: error.name,
      stage: error.stage,
      errorCode: error.errorCode,
      message: error.message,
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return {
    value: String(error),
  };
}

function createAssessmentProPdfExportError(input: {
  stage: AssessmentProPdfFailureStage;
  message: string;
  error: unknown;
  context?: Record<string, unknown>;
}) {
  if (input.error instanceof AssessmentProPdfExportError) {
    return input.error;
  }

  return new AssessmentProPdfExportError({
    stage: input.stage,
    message: input.message,
    errorCode: getErrorCode(input.error),
    context: input.context,
    causeError: input.error,
  });
}

function logAssessmentProPdfEvent(
  level: "info" | "error",
  event: string,
  details: Record<string, unknown>,
) {
  const payload = {
    lane: "pro",
    layoutVersion: ASSESSMENT_PRO_PDF_LANE_VERSION,
    ...details,
    event,
  };

  if (level === "error") {
    console.error("[assessment-pro-pdf]", payload);
    return;
  }

  console.info("[assessment-pro-pdf]", payload);
}

export function describeAssessmentProPdfFailure(error: unknown) {
  if (error instanceof AssessmentProPdfExportError) {
    return {
      stage: error.stage,
      errorCode: error.errorCode,
      context: error.context,
      cause: summarizeError(error.causeError),
      message: error.message,
    };
  }

  if (error instanceof AssessmentPdfBufferError) {
    return {
      stage: "pdf-buffer",
      errorCode: error.errorCode,
      context: {
        pdfStage: error.stage,
      },
      cause: summarizeError(error.causeError),
      message: error.message,
    };
  }

  return {
    stage: "unknown",
    errorCode: getErrorCode(error),
    cause: summarizeError(error),
  };
}

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
  const logContext = {
    artifactKey,
    assessmentId: input.generation.id,
    locale: input.uiContext.locale,
    ownerUid: input.user.uid,
    themeMode: input.themeMode,
  };
  let existingBuffer: Buffer | null = null;

  if (existingArtifact) {
    try {
      existingBuffer = await loadAssessmentArtifact(existingArtifact, input.user.uid);
    } catch (error) {
      throw createAssessmentProPdfExportError({
        stage: "artifact-load",
        message: "Assessment Pro PDF cached artifact could not be loaded.",
        error,
        context: {
          ...logContext,
          hasExistingArtifact: true,
        },
      });
    }
  }

  const canReuseExistingArtifact =
    existingArtifact?.fileName === expectedArtifactFileName &&
    existingArtifact?.versionTag === ASSESSMENT_PRO_PDF_LANE_VERSION &&
    Boolean(existingBuffer);

  logAssessmentProPdfEvent("info", "route-context-resolved", {
    ...logContext,
    canReuseExistingArtifact,
    hasExistingArtifact: Boolean(existingArtifact),
  });

  if (!canReuseExistingArtifact) {
    const qrCodeDataUrl = await buildAssessmentFileQrDataUrl().catch((error) => {
      throw createAssessmentProPdfExportError({
        stage: "qr-build",
        message: "Assessment Pro PDF QR asset generation failed.",
        error,
        context: logContext,
      });
    });
    const documentBaseUrl = getServerRuntimeOrigin();
    const html = await Promise.resolve().then(() =>
      buildAssessmentPrintHtml({
        preview: input.preview,
        themeMode: input.themeMode,
        qrCodeDataUrl,
        autoPrint: false,
        pageNumberMode: "static-sections",
        /* The Pro lane renders through Puppeteer/Chromium, so public assets need an absolute base
           URL at capture time. Keep this lane-specific concern out of the Fast browser-print lane.
           Use the canonical runtime origin so host-header spoofing cannot influence Puppeteer fetches. */
        documentBaseUrl,
      }),
    ).catch((error) => {
      throw createAssessmentProPdfExportError({
        stage: "html-render",
        message: "Assessment Pro PDF HTML render failed.",
        error,
        context: {
          ...logContext,
          documentBaseUrl,
        },
      });
    });
    const pdfBuffer = await buildAssessmentPdfBuffer({
      html,
    }).catch((error) => {
      throw createAssessmentProPdfExportError({
        stage: "pdf-buffer",
        message: "Assessment Pro PDF capture failed.",
        error,
        context: {
          ...logContext,
          documentBaseUrl,
          ...(error instanceof AssessmentPdfBufferError
            ? {
                pdfStage: error.stage,
              }
            : {}),
        },
      });
    });
    logAssessmentProPdfEvent("info", "pdf-buffer-generated", {
      ...logContext,
      byteLength: pdfBuffer.byteLength,
      documentBaseUrl,
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
    }).catch((error) => {
      throw createAssessmentProPdfExportError({
        stage: "artifact-store",
        message: "Assessment Pro PDF artifact upload failed.",
        error,
        context: {
          ...logContext,
          fileName: expectedArtifactFileName,
        },
      });
    });

    if (storedArtifact) {
      await saveAssessmentGeneration({
        ...input.generation,
        artifacts: {
          ...(input.generation.artifacts ?? {}),
          [storedArtifact.key]: storedArtifact,
        },
        updatedAt: new Date().toISOString(),
      }).catch((error) => {
        throw createAssessmentProPdfExportError({
          stage: "generation-save",
          message: "Assessment Pro PDF artifact metadata save failed.",
          error,
          context: {
            ...logContext,
            storedArtifactKey: storedArtifact.key,
          },
        });
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
    }).catch((error) => {
      throw createAssessmentProPdfExportError({
        stage: "audit-log",
        message: "Assessment Pro PDF admin log write failed.",
        error,
        context: logContext,
      });
    });

    logAssessmentProPdfEvent("info", "artifact-generated", {
      ...logContext,
      byteLength: pdfBuffer.byteLength,
      fileName: expectedArtifactFileName,
      persistedArtifact: Boolean(storedArtifact),
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
  }).catch((error) => {
    throw createAssessmentProPdfExportError({
      stage: "audit-log",
      message: "Assessment Pro PDF cache-hit admin log write failed.",
      error,
      context: {
        ...logContext,
        cacheHit: true,
      },
    });
  });

  logAssessmentProPdfEvent("info", "artifact-reused", {
    ...logContext,
    byteLength: (existingBuffer as Uint8Array).byteLength,
    fileName: downloadFileName,
  });

  return new Response(new Uint8Array(existingBuffer as Uint8Array), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${downloadFileName}"`,
    },
  });
}
