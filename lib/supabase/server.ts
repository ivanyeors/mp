import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

let cached: SupabaseClient | null = null;

export const supabaseAdmin = (): SupabaseClient => {
  if (!cached) {
    cached = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return cached;
};
