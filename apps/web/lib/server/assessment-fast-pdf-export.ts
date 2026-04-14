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
  buildAssessmentPrintRenderDiagnostics,
  buildAssessmentPrintHtml,
} from "@/lib/server/assessment-print-renderer";
import { appendAdminLog, saveAssessmentGeneration } from "@/lib/server/repository";

export const ASSESSMENT_FAST_PDF_LANE_VERSION = `fast-${ASSESSMENT_PRINT_LAYOUT_VERSION}`;

export type AssessmentFastPdfFailureStage =
  | "artifact-load"
  | "qr-build"
  | "html-render"
  | "render-shape"
  | "artifact-store"
  | "generation-save"
  | "audit-log";

export class AssessmentFastPdfExportError extends Error {
  readonly stage: AssessmentFastPdfFailureStage;
  readonly errorCode: string;
  readonly context: Record<string, unknown>;
  readonly causeError: unknown;

  constructor(input: {
    stage: AssessmentFastPdfFailureStage;
    message: string;
    errorCode: string;
    context?: Record<string, unknown>;
    causeError: unknown;
  }) {
    super(input.message);
    this.name = "AssessmentFastPdfExportError";
    this.stage = input.stage;
    this.errorCode = input.errorCode;
    this.context = input.context ?? {};
    this.causeError = input.causeError;
  }
}

function getErrorCode(error: unknown) {
  if (error instanceof AssessmentFastPdfExportError) {
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

function createAssessmentFastPdfExportError(input: {
  stage: AssessmentFastPdfFailureStage;
  message: string;
  error: unknown;
  context?: Record<string, unknown>;
}) {
  if (input.error instanceof AssessmentFastPdfExportError) {
    return input.error;
  }

  return new AssessmentFastPdfExportError({
    stage: input.stage,
    message: input.message,
    errorCode: getErrorCode(input.error),
    context: input.context,
    causeError: input.error,
  });
}

function logAssessmentFastPdfEvent(
  level: "info" | "error",
  event: string,
  details: Record<string, unknown>,
) {
  const payload = {
    lane: "fast",
    layoutVersion: ASSESSMENT_FAST_PDF_LANE_VERSION,
    ...details,
    event,
  };

  if (level === "error") {
    console.error("[assessment-fast-pdf]", payload);
    return;
  }

  console.info("[assessment-fast-pdf]", payload);
}

export function describeAssessmentFastPdfFailure(error: unknown) {
  if (error instanceof AssessmentFastPdfExportError) {
    return {
      stage: error.stage,
      errorCode: error.errorCode,
      context: error.context,
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
      throw createAssessmentFastPdfExportError({
        stage: "artifact-load",
        message: "Assessment Fast PDF cached artifact could not be loaded.",
        error,
        context: {
          ...logContext,
          hasExistingArtifact: true,
        },
      });
    }
  }
  const existingHtml = existingBuffer
    ? new TextDecoder().decode(existingBuffer)
    : null;
  const existingRenderDiagnostics = buildAssessmentPrintRenderDiagnostics({
    preview: input.preview,
    html: existingHtml,
  });
  const canReuseExistingArtifact =
    existingArtifact?.fileName === expectedFileName &&
    existingArtifact?.versionTag === ASSESSMENT_FAST_PDF_LANE_VERSION &&
    Boolean(existingHtml) &&
    (!existingRenderDiagnostics.bodyLoaded ||
      existingRenderDiagnostics.htmlHasExpectedContentBlocks === true);

  logAssessmentFastPdfEvent("info", "route-context-resolved", {
    ...logContext,
    canReuseExistingArtifact,
    currentArtifactVersion: existingArtifact?.versionTag ?? null,
    hasExistingArtifact: Boolean(existingArtifact),
    renderDiagnostics: existingRenderDiagnostics,
  });

  if (!canReuseExistingArtifact) {
    const qrCodeDataUrl = await buildAssessmentFileQrDataUrl().catch((error) => {
      throw createAssessmentFastPdfExportError({
        stage: "qr-build",
        message: "Assessment Fast PDF QR asset generation failed.",
        error,
        context: logContext,
      });
    });
    const html = await Promise.resolve().then(() =>
      buildAssessmentPrintHtml({
        preview: input.preview,
        themeMode: input.themeMode,
        qrCodeDataUrl,
        pageNumberMode: "static-sections",
      }),
    ).catch((error) => {
      throw createAssessmentFastPdfExportError({
        stage: "html-render",
        message: "Assessment Fast PDF HTML render failed.",
        error,
        context: logContext,
      });
    });
    const renderDiagnostics = buildAssessmentPrintRenderDiagnostics({
      preview: input.preview,
      html,
    });
    logAssessmentFastPdfEvent("info", "html-rendered", {
      ...logContext,
      renderDiagnostics,
    });
    /* The Fast lane serves cached HTML directly to the browser print dialog. Refuse to reuse or
       persist a shell-only surface when the live generation still has questions, otherwise blank
       HTML artifacts can survive indefinitely and make both export buttons look broken. */
    if (renderDiagnostics.bodyLoaded && !renderDiagnostics.htmlHasExpectedContentBlocks) {
      throw createAssessmentFastPdfExportError({
        stage: "render-shape",
        message: "Assessment Fast PDF HTML rendered without assessment body markers.",
        error: new Error("ASSESSMENT_FAST_PDF_RENDER_BODY_MISSING"),
        context: {
          ...logContext,
          renderDiagnostics,
        },
      });
    }
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
    }).catch((error) => {
      throw createAssessmentFastPdfExportError({
        stage: "artifact-store",
        message: "Assessment Fast PDF artifact upload failed.",
        error,
        context: {
          ...logContext,
          fileName: expectedFileName,
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
        throw createAssessmentFastPdfExportError({
          stage: "generation-save",
          message: "Assessment Fast PDF artifact metadata save failed.",
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
      action: "assessment-export-pdf-fast",
      resourceType: "assessment-export",
      resourceId: input.generation.id,
      route: "/api/assessment/export/pdf/fast/[id]",
      metadata: {
        lane: "fast",
        themeMode: input.themeMode,
        layoutVersion: ASSESSMENT_FAST_PDF_LANE_VERSION,
      },
    }).catch((error) => {
      throw createAssessmentFastPdfExportError({
        stage: "audit-log",
        message: "Assessment Fast PDF admin log write failed.",
        error,
        context: logContext,
      });
    });

    logAssessmentFastPdfEvent("info", "artifact-generated", {
      ...logContext,
      fileName: expectedFileName,
      persistedArtifact: Boolean(storedArtifact),
      renderDiagnostics,
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
  }).catch((error) => {
    throw createAssessmentFastPdfExportError({
      stage: "audit-log",
      message: "Assessment Fast PDF cache-hit admin log write failed.",
      error,
      context: {
        ...logContext,
        cacheHit: true,
      },
    });
  });

  logAssessmentFastPdfEvent("info", "artifact-reused", {
    ...logContext,
    fileName: expectedFileName,
    renderDiagnostics: existingRenderDiagnostics,
  });

  return new Response(existingHtml as string, {
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
}
