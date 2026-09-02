import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/ssr-server";

/**
 * Returns the currently signed-in Supabase auth user (or null) from a server
 * component, route handler, or server action. This is the canonical way to
 * read the session server-side for both shoppers and staff.
 *
 * Memoised per request with React `cache()`: a settings page render calls
 * this from the layout gate and again from the page guard, and each call is
 * a network round trip to Supabase Auth. Outside a request scope (tests,
 * scripts) `cache()` is a pass-through.
 */
export const getAuthUser = cache(async (): Promise<User | null> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ?? null;
});
