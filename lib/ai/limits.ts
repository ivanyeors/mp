/**
 * The per-Staff AI writing limits (PRD-campaign-email-editor slices 09 and
 * 16): the allowances on General → AI writing, counted in the shared database
 * limiter (`rateLimitExceeded`, lib/rate-limit.ts), so every instance sees the
 * same tally. Every AI writing call checks them after the permission and the
 * settings, before Claude is asked; each call counts one, refused or not.
 *
 * The limiter's windows are fixed (they reset on the window's boundary from
 * the epoch), so the time a refused call can run again is that boundary: the
 * next ten minutes past, or midnight UTC for the day, which is 8 am in
 * Singapore.
 */
import { formatAdminTime } from "@/lib/format/admin-date";
import { rateLimitExceeded, type RateLimitOptions } from "@/lib/rate-limit";
import { aiWritingRateLimits, type AiWritingSettings } from "./writing-settings";

/** Pure — when the fixed window `now` falls in ends: when a refused call can run again. */
export function aiWritingRetryAt(windowMs: number, now: Date): Date {
  return new Date((Math.floor(now.getTime() / windowMs) + 1) * windowMs);
}

/** The day `d` falls on in Singapore, as YYYY-MM-DD. */
const sgDay = (d: Date) => new Date(d.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);

/** Pure — the refusal, with when to try again: "…Try again after 4:10 pm." or "…after 8:00 am tomorrow." */
export function aiWritingLimitMessage(retryAt: Date, now: Date, lead = "You've drafted a lot today"): string {
  const day = sgDay(retryAt) === sgDay(now) ? "" : " tomorrow";
  return `${lead}. Try again after ${formatAdminTime(retryAt.toISOString())}${day}.`;
}

/**
 * The limits for one call by `staffKey` (the Member's id): null when it may
 * run, else the refusal. Both allowances are counted. `exceeded` is the
 * limiter, a seam for tests.
 */
export async function aiWritingLimited(
  settings: Pick<AiWritingSettings, "limit10min" | "limitDay">,
  staffKey: string,
  {
    now = new Date(),
    exceeded = rateLimitExceeded,
    lead,
  }: { now?: Date; exceeded?: (opts: RateLimitOptions) => Promise<boolean>; lead?: string } = {},
): Promise<string | null> {
  const limits = aiWritingRateLimits(settings, staffKey);
  const over = await Promise.all(limits.map((l) => exceeded({ ...l, now: now.getTime() })));
  const used = limits.filter((_, i) => over[i]);
  if (!used.length) return null;
  // The longest wait: a day used up outlasts ten minutes.
  const retryAt = new Date(Math.max(...used.map((l) => aiWritingRetryAt(l.windowMs, now).getTime())));
  return aiWritingLimitMessage(retryAt, now, lead);
}
