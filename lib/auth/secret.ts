import { createHash, timingSafeEqual } from "node:crypto";

const digest = (s: string) => createHash("sha256").update(s).digest();

/**
 * Constant-time compare of a presented secret against the configured one.
 * Fails closed: an unset or empty `expected` never matches, so a missing env
 * var refuses instead of opening the route.
 *
 * Both sides are hashed first so the buffers are always equal length —
 * `timingSafeEqual` never throws and the compare leaks no length.
 */
export function secretMatches(expected: string | undefined, got: string | null): boolean {
  if (!expected || got == null) return false;
  return timingSafeEqual(digest(expected), digest(got));
}
