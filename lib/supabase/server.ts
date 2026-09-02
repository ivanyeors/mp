import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

let cached: SupabaseClient | null = null;

/**
 * Service-role Supabase client for server code. Bypasses RLS, so only call it
 * from route handlers, server actions and server components that have already
 * authorised the caller.
 *
 * The client is a process-level singleton: it holds no session state, and
 * constructing one per call (the previous behaviour) rebuilt the fetch,
 * PostgREST and auth wrappers on every request that touched the database.
 */
export const supabaseAdmin = (): SupabaseClient => {
  if (!cached) {
    cached = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return cached;
};
