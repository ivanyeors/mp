import { cache } from "react";
import type { JWK, User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/ssr-server";

export const getAuthUser = cache(async (): Promise<User | null> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ?? null;
});

export type AuthIdentity = { id: string; email: string | null };

type Jwks = { keys: JWK[] };

const JWKS_TTL_MS = 10 * 60 * 1000;
let jwksCache: { fetchedAt: number; jwks: Jwks } | null = null;

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
