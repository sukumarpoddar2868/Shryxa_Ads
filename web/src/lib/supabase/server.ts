import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { Database } from "./types";

/**
 * Server-only Supabase client using the service-role key.
 * Bypasses RLS — never import this from a Client Component.
 */
let client: SupabaseClient<Database> | null = null;

export function db(): SupabaseClient<Database> {
  if (client) return client;
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env();
  client = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
