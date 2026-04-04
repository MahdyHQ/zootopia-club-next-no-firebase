import { isProfileCompletionRequired } from "@/lib/return-to";
import { apiError } from "@/lib/server/api";
import {
  getAssessmentArtifactRecordKey,
  loadAssessmentArtifact,
  persistAssessmentExportArtifact,
} from "@/lib/server/assessment-artifact-storage";
import {
  buildAssessmentDocxExport,
  buildAssessmentExportFileBase,
} from "@/lib/server/assessment-exporter";
import { buildAssessmentPreview } from "@/lib/server/assessment-preview";
import {
  appendAdminLog,
  getAssessmentGenerationForOwner,
  saveAssessmentGeneration,
} from "@/lib/server/repository";
import { getRequestUiContext } from "@/lib/server/request-context";
import { getAuthenticatedSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getAuthenticatedSessionUser();
  if (!user) {
    return apiError("UNAUTHENTICATED", "Sign in is required for assessments.", 401);
  }
  if (isProfileCompletionRequired(user)) {
    return apiError(
      "PROFILE_INCOMPLETE",
      "Complete your profile in Settings before accessing assessment output.",
      403,
    );
  }

  const { id } = await context.params;
  const generation = await getAssessmentGenerationForOwner(id, user.uid, {
    includeExpired: true,
  });

  if (!generation) {
    return apiError("ASSESSMENT_NOT_FOUND", "Assessment generation not found.", 404);
  }

  if (generation.status === "expired") {
    return apiError(
      "ASSESSMENT_EXPIRED",
      "Assessment generation has expired and is no longer available.",
      410,
    );
  }

  const uiContext = await getRequestUiContext();
  const preview = buildAssessmentPreview({
    generation,
    locale: uiContext.locale,
    messages: uiContext.messages,
  });
  const fileBase = buildAssessmentExportFileBase(preview);
  const artifactKey = getAssessmentArtifactRecordKey({
    kind: "export-docx",
    locale: uiContext.locale,
  });
  const existingArtifact = generation.artifacts?.[artifactKey];
  const existingBuffer = existingArtifact
    ? await loadAssessmentArtifact(existingArtifact, user.uid)
    : null;

  if (!existingArtifact || !existingBuffer) {
    const buffer = await buildAssessmentDocxExport(preview);
    const storedArtifact = await persistAssessmentExportArtifact({
      ownerUid: user.uid,
      generationId: generation.id,
      kind: "export-docx",
      locale: uiContext.locale,
      fileName: `${fileBase}.docx`,
      fileExtension: "docx",
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      body: buffer,
      createdAt: new Date().toISOString(),
      expiresAt: generation.expiresAt,
    });

    if (storedArtifact) {
      await saveAssessmentGeneration({
        ...generation,
        artifacts: {
          ...(generation.artifacts ?? {}),
          [storedArtifact.key]: storedArtifact,
        },
        updatedAt: new Date().toISOString(),
      });
    }

    await appendAdminLog({
      actorUid: user.uid,
      actorRole: user.role,
      ownerUid: user.uid,
      ownerRole: user.role,
      action: "assessment-export-docx",
      resourceType: "assessment-export",
      resourceId: generation.id,
      route: "/api/assessment/export/docx/[id]",
    });

    return new Response(new Uint8Array(buffer), {
      headers: {
        "content-type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "content-disposition": `attachment; filename="${fileBase}.docx"`,
      },
    });
  }

  await appendAdminLog({
    actorUid: user.uid,
    actorRole: user.role,
    ownerUid: user.uid,
    ownerRole: user.role,
    action: "assessment-export-docx",
    resourceType: "assessment-export",
    resourceId: generation.id,
    route: "/api/assessment/export/docx/[id]",
  });

  return new Response(new Uint8Array(existingBuffer), {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "content-disposition": `attachment; filename="${fileBase}.docx"`,
    },
  });
}
