import { cache } from "react";
import type { JWK, User } from "@supabase/supabase-js";
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
type Jwks = { keys: JWK[] };

const JWKS_TTL_MS = 10 * 60 * 1000;
let jwksCache: { fetchedAt: number; jwks: Jwks } | null = null;

/**
 * Process-level cache of the project's public JWT signing keys.
 *
 * The server Supabase client is created per request, so the library's own
 * per-client JWKS cache never survives between requests and it would refetch
 * the key set every time. Caching here means a warm function verifies admin
 * sessions with no network call at all once the project runs on asymmetric
 * signing keys. Failures return null and getClaims falls back to its own
 * fetch (or to server verification for legacy symmetric keys).
 */
async function getCachedJwks(): Promise<Jwks | null> {
  const now = Date.now();
  if (jwksCache && now - jwksCache.fetchedAt < JWKS_TTL_MS) return jwksCache.jwks;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    const res = await fetch(`${url}/auth/v1/.well-known/jwks.json`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const jwks = (await res.json()) as Jwks;
    if (!Array.isArray(jwks.keys) || jwks.keys.length === 0) return null;
    jwksCache = { fetchedAt: now, jwks };
    return jwks;
  } catch {
    return null;
  }
}

export const getAuthIdentity = cache(async (): Promise<AuthIdentity | null> => {
  const supabase = await createSupabaseServerClient();
  const jwks = await getCachedJwks();
  const { data, error } = await supabase.auth.getClaims(undefined, jwks ? { jwks } : undefined);
  const claims = data?.claims;
  if (error || !claims || typeof claims.sub !== "string") return null;
  const email = typeof claims.email === "string" ? claims.email : null;
  return { id: claims.sub, email };
});
