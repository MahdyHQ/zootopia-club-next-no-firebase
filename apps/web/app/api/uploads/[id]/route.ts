import { isProfileCompletionRequired } from "@/lib/return-to";
import { apiError } from "@/lib/server/api";
import { loadDocumentBinaryFromStorage } from "@/lib/server/document-runtime";
import { appendAdminLog, getDocumentByIdForOwner } from "@/lib/server/repository";
import { getAuthenticatedSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getAuthenticatedSessionUser();
  if (!user) {
    return apiError("UNAUTHENTICATED", "Sign in is required for document downloads.", 401);
  }
  if (isProfileCompletionRequired(user)) {
    return apiError(
      "PROFILE_INCOMPLETE",
      "Complete your profile in Settings before accessing uploaded files.",
      403,
    );
  }

  const { id } = await context.params;
  const document = await getDocumentByIdForOwner(id, user.uid);
  if (!document) {
    return apiError("DOCUMENT_NOT_FOUND", "The requested document was not found.", 404);
  }

  const buffer = await loadDocumentBinaryFromStorage(document);
  if (!buffer) {
    return apiError(
      "DOCUMENT_BINARY_UNAVAILABLE",
      "The original uploaded file is no longer available.",
      404,
    );
  }

  await appendAdminLog({
    actorUid: user.uid,
    actorRole: user.role,
    ownerUid: user.uid,
    ownerRole: user.role,
    action: "document-downloaded",
    resourceType: "document",
    resourceId: document.id,
    route: "/api/uploads/[id]",
    metadata: {
      fileName: document.fileName,
    },
  });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type": document.mimeType || "application/octet-stream",
      "content-disposition": `attachment; filename="${document.fileName}"`,
    },
  });
}
