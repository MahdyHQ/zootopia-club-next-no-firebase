import "server-only";

import { getSupabaseAdminClient, hasSupabaseAdminRuntime } from "@/lib/server/supabase-admin";

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
