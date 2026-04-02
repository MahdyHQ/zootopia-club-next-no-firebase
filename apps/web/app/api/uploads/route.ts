import { isProfileCompletionRequired } from "@/lib/return-to";
import { apiError, apiSuccess } from "@/lib/server/api";
import { createDocumentRecord } from "@/lib/server/document-runtime";
import { saveDocument } from "@/lib/server/repository";
import { getAuthenticatedSessionUser } from "@/lib/server/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getAuthenticatedSessionUser();
  if (!user) {
    return apiError("UNAUTHENTICATED", "Sign in is required for uploads.", 401);
  }
  if (isProfileCompletionRequired(user)) {
    return apiError(
      "PROFILE_INCOMPLETE",
      "Complete your profile in Settings before uploading files.",
      403,
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return apiError("FILE_REQUIRED", "A file upload is required.", 400);
  }

  try {
    const { document, warnings } = await createDocumentRecord({
      ownerUid: user.uid,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      buffer: Buffer.from(await file.arrayBuffer()),
    });

    await saveDocument(document);

    return apiSuccess(
      {
        document,
        warnings,
      },
      201,
    );
  } catch (error) {
    return apiError(
      "UPLOAD_FAILED",
      error instanceof Error ? error.message : "Upload failed.",
      400,
    );
  }
}
