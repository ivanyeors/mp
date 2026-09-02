import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

/**
 * Browser Supabase client shared by the admin pages that query inventory,
 * BOM and pricing tables directly.
 *
 * Cookie-aware (via @supabase/ssr) so requests run as the signed-in staff
 * member under the `authenticated` role, which the "Staff read …" RLS
 * policies gate on `is_admin_user()`. The previous plain `createClient` ran
 * every read as `anon`, which only worked because those tables had RLS off.
 *
 * `createBrowserClient` returns a per-tab singleton in the browser and a
 * throwaway client during server rendering, so importing it at module level
 * from "use client" files is safe.
 */
export const supabaseClient = createBrowserClient(supabaseUrl, supabaseAnonKey);
