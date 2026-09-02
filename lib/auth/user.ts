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

export type AuthIdentity = { id: string; email: string | null };

/**
 * Lightweight identity for authorisation checks: subject and email from the
 * session's JWT claims.
 *
 * `getClaims()` verifies the token locally against the project's public
 * signing keys when the project uses asymmetric JWT keys, avoiding the
 * round trip to Supabase Auth that `getUser()` always makes. On projects
 * still using the legacy shared secret it falls back to server verification,
 * so it is never less safe than `getAuthUser`. Request-memoised.
 */
export const getAuthIdentity = cache(async (): Promise<AuthIdentity | null> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims || typeof claims.sub !== "string") return null;
  const email = typeof claims.email === "string" ? claims.email : null;
  return { id: claims.sub, email };
});
