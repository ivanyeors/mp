import { createHash, timingSafeEqual } from "node:crypto";

const digest = (s: string) => createHash("sha256").update(s).digest();

export function secretMatches(expected: string | undefined, got: string | null): boolean {
  if (!expected || got == null) return false;
  return timingSafeEqual(digest(expected), digest(got));
}
