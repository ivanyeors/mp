import { formatAdminTime } from "@/lib/format/admin-date";
import { rateLimitExceeded, type RateLimitOptions } from "@/lib/rate-limit";
import { aiWritingRateLimits, type AiWritingSettings } from "./writing-settings";

export function aiWritingRetryAt(windowMs: number, now: Date): Date {
  return new Date((Math.floor(now.getTime() / windowMs) + 1) * windowMs);
}

const sgDay = (d: Date) => new Date(d.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);

export function aiWritingLimitMessage(retryAt: Date, now: Date, lead = "You've drafted a lot today"): string {
  const day = sgDay(retryAt) === sgDay(now) ? "" : " tomorrow";
  return `${lead}. Try again after ${formatAdminTime(retryAt.toISOString())}${day}.`;
}

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
  const retryAt = new Date(Math.max(...used.map((l) => aiWritingRetryAt(l.windowMs, now).getTime())));
  return aiWritingLimitMessage(retryAt, now, lead);
}
