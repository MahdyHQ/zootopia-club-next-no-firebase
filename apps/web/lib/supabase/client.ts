"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getSupabasePublishableKey,
  getSupabaseUrl,
  hasSupabasePublicRuntime,
} from "@/lib/supabase/public-config";

let cachedClient: SupabaseClient | null = null;

export function isSupabaseWebConfigured() {
  return hasSupabasePublicRuntime();
}

/**
 * Browser Supabase client. Uses `createBrowserClient` from `@supabase/ssr` per Supabase
 * Next.js guidance. Auth.js still remains the app-session authority for route/data access,
 * while the browser Supabase session is retained to authorize private Realtime channels and
 * keep that channel token refreshed during active protected workspace usage.
 */
export function getSupabaseClient() {
  if (cachedClient) {
    return cachedClient;
  }

  const supabaseUrl = getSupabaseUrl();
  const publishableKey = getSupabasePublishableKey();

  if (!supabaseUrl || !publishableKey) {
    throw new Error("SUPABASE_WEB_CONFIG_MISSING");
  }

  cachedClient = createBrowserClient(supabaseUrl, publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });

  return cachedClient;
}

export function primeEphemeralSupabaseClient() {
  return Promise.resolve(getSupabaseClient());
}

export async function getEphemeralSupabaseClient() {
  return getSupabaseClient();
}
