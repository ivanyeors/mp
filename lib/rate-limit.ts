import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Rate limiting, two ways.
 *
 * - {@link rateLimitExceeded}: the shared allowance. Counted in the database
 *   (`rate_limit_hit`, migration 20261025120000), so every serverless instance
 *   sees the same tally. Use it on anything that spends money or sends a
 *   message: a flood spread across instances is stopped, not just slowed.
 * - {@link isRateLimited}: an in-process Map. On a platform that runs several
 *   instances it dampens a flood rather than stopping one, which is enough for
 *   cheap, high-volume paths (analytics beacons) and is the shared limiter's
 *   fallback.
 *
 * Lifted from the old Contact Us form's route (since replaced by the website
 * chat, app/api/support/chat), which was the only limiter in the codebase.
 */

const buckets = new Map<string, Map<string, number[]>>();

export interface RateLimitOptions {
  /** Separate counters per feature, so one busy endpoint cannot exhaust another. */
  bucket: string;
  key: string;
  windowMs: number;
  max: number;
  /** Injectable for tests; defaults to Date.now. */
  now?: number;
}

/** True when this call exceeds the allowance — the call itself is counted. */
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

/** The shared store sweeps windows older than a day, so none may be longer. */
const MAX_SHARED_WINDOW_MS = 24 * 60 * 60 * 1000;

let warnedFallback = false;

/**
 * True when this call exceeds the shared allowance — the call itself is
 * counted. Windows are fixed (they reset on the window boundary) and at most a
 * day long.
 *
 * When the database cannot answer (the migration not yet applied, a network
 * blip) this falls back to {@link isRateLimited} rather than refusing: a
 * limiter outage must never close checkout or booking.
 */
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

/**
 * A 429 when any of `limits` is used up (every one is counted), else null.
 * Key a side effect on its recipient as well as the caller's IP: rotating IPs
 * gets past an IP allowance, not a per-email or per-phone one.
 *
 *   const limited = await tooManyRequests([...], "Too many bookings.");
 *   if (limited) return limited;
 */
export async function tooManyRequests(
  limits: RateLimitOptions[],
  message = "Too many requests. Please wait a few minutes and try again.",
): Promise<NextResponse | null> {
  const results = await Promise.all(limits.map((limit) => rateLimitExceeded(limit)));
  return results.some(Boolean) ? NextResponse.json({ error: message }, { status: 429 }) : null;
}

/** The caller's IP, by the header chain this app sits behind. */
export function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

/** Test seam — drops all per-instance counters. */
export function resetRateLimits(): void {
  buckets.clear();
  warnedFallback = false;
}
