/**
 * Best-effort per-instance rate limiting.
 *
 * ponytail: an in-process Map, so on a platform that runs several instances this
 * dampens a flood rather than stopping one. That is the honest ceiling. The
 * upgrade path is shared storage (Redis/Upstash) behind the same signature —
 * swap the store, leave every call site alone.
 *
 * Lifted from app/api/support/contact/route.ts, which was the only limiter in the
 * codebase and is now one of its callers.
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

/** The caller's IP, by the header chain this app sits behind. */
export function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

/** Test seam — drops all counters. */
export function resetRateLimits(): void {
  buckets.clear();
}
