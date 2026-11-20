import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

const buckets = new Map<string, Map<string, number[]>>();

export interface RateLimitOptions {
  bucket: string;
  key: string;
  windowMs: number;
  max: number;
  now?: number;
}

export function isRateLimited(opts: RateLimitOptions): boolean {
  const now = opts.now ?? Date.now();
  let bucket = buckets.get(opts.bucket);
  if (!bucket) {
    bucket = new Map<string, number[]>();
    buckets.set(opts.bucket, bucket);
  }
  const recent = (bucket.get(opts.key) ?? []).filter((t) => now - t < opts.windowMs);
  recent.push(now);
  bucket.set(opts.key, recent);
  return recent.length > opts.max;
}

const MAX_SHARED_WINDOW_MS = 24 * 60 * 60 * 1000;

let warnedFallback = false;

export async function rateLimitExceeded(opts: RateLimitOptions): Promise<boolean> {
  const windowMs = Math.min(opts.windowMs, MAX_SHARED_WINDOW_MS);
  try {
    const { data, error } = await supabaseAdmin().rpc("rate_limit_hit", {
      p_bucket: opts.bucket,
      p_key: opts.key,
      p_window_seconds: Math.max(1, Math.round(windowMs / 1000)),
      p_max: opts.max,
    });
    if (error) throw new Error(error.message);
    return data === true;
  } catch (e) {
    if (!warnedFallback) {
      warnedFallback = true;
      console.error("[rate-limit] shared store unavailable, counting per instance:", e instanceof Error ? e.message : e);
    }
    return isRateLimited({ ...opts, windowMs });
  }
}

export async function tooManyRequests(
  limits: RateLimitOptions[],
  message = "Too many requests. Please wait a few minutes and try again.",
): Promise<NextResponse | null> {
  const results = await Promise.all(limits.map((limit) => rateLimitExceeded(limit)));
  return results.some(Boolean) ? NextResponse.json({ error: message }, { status: 429 }) : null;
}

export function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export function resetRateLimits(): void {
  buckets.clear();
  warnedFallback = false;
}
