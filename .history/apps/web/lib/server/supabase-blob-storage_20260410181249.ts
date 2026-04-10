import "server-only";

import { getSupabaseAdminClient, hasSupabaseAdminRuntime } from "@/lib/server/supabase-admin";

/* SUPABASE STORAGE OWNERSHIP MODEL:
   
   All file access is server-authenticated via Supabase admin client (service role key).
   Ownership enforcement happens at TWO layers:
   
   1. SERVER CODE LAYER (this file + callers):
      - ownerUid is embedded in the path: {namespace}/{ownerUid}/{resource}/...
      - assertOwnerScopedStoragePath() validates path matches owner before any I/O
      - Ownership source: session.user.uid (authenticated identity, not request params)
   
   2. SUPABASE AUTH LAYER (future enhancement, Phase 2):
      - Private bucket with no public access
      - Optional RLS policies to bind storage object ACLs to Postgres user rows
      - Future: Client-side storage access would be gated by matching user.id row
   
   Current Phase 1 State:
   - Phase 1: Server-only access via admin client (all storage I/O server-authenticated)
   - Phase 2: Add RLS policies to enable secure client-side storage access (if needed)
   - Phase 3: Migrate to proper Supabase Storage Authorization with @supabase/ssr
   
   Why this layering is safe:
   - Client cannot directly access storage (browser forbidden by bucket config)
   - Server validates ownership at path level before every read/write/delete
   - Supabase admin client always uses service role (cannot be compromised by client token)
   - Even if path is leaked, storage access still requires valid session + path scope match
   
   Ownership Binding Example:
   1. User logs in → session.user.uid = "abc123"
   2. POST /api/uploads → createDocumentRecord({ ownerUid: user.uid, ... })
   3. buildDocumentStoragePath({ ownerUid: "abc123", documentId: "doc1", ... })
   4. Result: "documents/abc123/doc1/file.pdf"
   5. assertOwnerScopedStoragePath("documents/abc123/doc1/file.pdf", user.uid, ["documents"]) → passes
   6. uploadZootopiaPrivateObject({ path: "documents/abc123/doc1/file.pdf", ... })
   7. Supabase Storage persists with owner metadata (future: in object tags or custom headers)
   
   Future agents: Preserve the path structure and ownership check order.
   Do NOT:
   - Accept owner paths from client
   - Skip assertOwnerScopedStoragePath
   - Use public bucket for user-owned temporary files
   - Add client-side storage access without proper RLS policies in Phase 2+
*/

/** Private bucket created by `supabase/migrations/20260410120000_zootopia_platform_entities.sql`. */
const ZOOTOPIA_PRIVATE_BUCKET = "zootopia-private";

export function hasRemoteBlobStorage() {
  return hasSupabaseAdminRuntime();
}

export async function uploadZootopiaPrivateObject(input: {
  path: string;
  body: Buffer;
  contentType: string;
}) {
  /* SUPABASE STORAGE WRITE (Owner-Scoped):
     
     CRITICAL: The path parameter MUST have already passed assertOwnerScopedStoragePath().
     This function does NOT re-check ownership; it assumes the caller did.
     
     Ownership invariant:
     - path must be: {namespace}/{ownerUid}/...
     - ownerUid must match authenticated session.uid
     - assertOwnerScopedStoragePath(path, session.uid, allowedNamespaces) must have passed
     
     Failure modes:
     - Path doesn't start with ownerUid: caller should have caught this (assertOwnerScopedStoragePath)
     - ownerUid is different user: metadata validation should have prevented this
     - Unsupported namespace: assertOwnerScopedStoragePath checks allowedNamespaces
     
     This upsert=true behavior means:
     - If file exists at path, content is replaced
     - If file doesn't exist, it's created
     - All operations happen within owner's namespace (path-scoped)
     
     Future: Add optional owner metadata tag if Supabase Object Tagging is available.
  */
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.storage
    .from(ZOOTOPIA_PRIVATE_BUCKET)
    .upload(input.path, input.body, {
      contentType: input.contentType,
      upsert: true,
    });

  if (error) {
    throw error;
  }
}

export async function downloadZootopiaPrivateObject(path: string): Promise<Buffer | null> {
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase.storage.from(ZOOTOPIA_PRIVATE_BUCKET).download(path);
    if (error || !data) {
      return null;
    }

    return Buffer.from(await data.arrayBuffer());
  } catch {
    return null;
  }
}

export async function deleteZootopiaPrivateObject(path: string): Promise<void> {
  try {
    const supabase = getSupabaseAdminClient();
    await supabase.storage.from(ZOOTOPIA_PRIVATE_BUCKET).remove([path]);
  } catch {
    // Best-effort cleanup; callers already treat missing objects as acceptable.
  }
}
