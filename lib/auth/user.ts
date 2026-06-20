import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/ssr-server";

/**
 * Returns the currently signed-in Supabase auth user (or null) from a server
 * component, route handler, or server action. This is the canonical way to
 * read the session server-side for both shoppers and staff.
 */
export async function getAuthUser(): Promise<User | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ?? null;
}
