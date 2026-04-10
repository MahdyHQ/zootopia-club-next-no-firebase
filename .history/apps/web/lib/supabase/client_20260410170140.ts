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
 * Next.js guidance; session persistence stays disabled so Auth.js remains the single
 * source of session truth and Supabase tokens are transient to active sign-in flows.
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
      persistSession: false,
      autoRefreshToken: false,
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
