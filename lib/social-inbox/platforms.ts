/**
 * The three platforms whose customer messages reach the measurements Telegram
 * group, and the one rule they differ on most: how long after the customer's
 * last message a business may still reply through the API.
 *
 * - Facebook Messenger and Instagram (Meta): 24 hours. With Meta's Human Agent
 *   permission (App Review), a person may reply for 7 days with the
 *   HUMAN_AGENT tag — set META_HUMAN_AGENT_ENABLED once it is approved.
 * - TikTok: 48 hours.
 *
 * Past the window the platform refuses the message, so we refuse first and
 * say why; the platform's own app still lets a person answer.
 */

export const SOCIAL_PLATFORMS = ["facebook", "instagram", "tiktok"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export function isSocialPlatform(value: unknown): value is SocialPlatform {
  return typeof value === "string" && (SOCIAL_PLATFORMS as readonly string[]).includes(value);
}

/** How staff name the platform in a sentence: "answer on Instagram". */
export const PLATFORM_NAMES: Record<SocialPlatform, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
};

/** Where a person can still reply once the API window has closed. */
export const PLATFORM_APPS: Record<SocialPlatform, string> = {
  facebook: "Meta Business Suite (or the Facebook Page inbox)",
  instagram: "the Instagram app (or Meta Business Suite)",
  tiktok: "the TikTok app",
};

const HOUR_MS = 3_600_000;

export const REPLY_WINDOW_HOURS: Record<SocialPlatform, number> = {
  facebook: 24,
  instagram: 24,
  tiktok: 48,
};

/** Meta's Human Agent tag: a person may reply for 7 days instead of 24 hours. */
export const HUMAN_AGENT_WINDOW_HOURS = 7 * 24;

export function humanAgentEnabled(): boolean {
  return process.env.META_HUMAN_AGENT_ENABLED?.trim().toLowerCase() === "true";
}

export type ReplyWindow =
  | { ok: true; tag: "HUMAN_AGENT" | null }
  | { ok: false; message: string };

/**
 * May we reply now, and does Meta need the HUMAN_AGENT tag to accept it?
 * Pure: the caller passes the clock and whether Human Agent is approved.
 */
export function replyWindow(
  platform: SocialPlatform,
  lastInboundAt: string | null,
  now: Date,
  opts: { humanAgent: boolean },
): ReplyWindow {
  const last = lastInboundAt ? new Date(lastInboundAt).getTime() : Number.NaN;
  const name = PLATFORM_NAMES[platform];
  const app = PLATFORM_APPS[platform];
  if (Number.isNaN(last)) {
    return { ok: false, message: `${name} has no message from this customer to reply to. Answer from ${app}.` };
  }
  const ageHours = (now.getTime() - last) / HOUR_MS;
  const window = REPLY_WINDOW_HOURS[platform];
  if (ageHours <= window) return { ok: true, tag: null };

  const meta = platform === "facebook" || platform === "instagram";
  if (meta && opts.humanAgent && ageHours <= HUMAN_AGENT_WINDOW_HOURS) return { ok: true, tag: "HUMAN_AGENT" };

  const limit = meta && opts.humanAgent ? "7 days" : `${window} hours`;
  return {
    ok: false,
    message: `${name} only accepts replies from here within ${limit} of the customer's last message. Answer from ${app} instead.`,
  };
}

/**
 * Text limits the platform enforces on one message. Instagram counts UTF-8
 * bytes, not characters. TikTok's is left to the API to report.
 */
export function checkOutgoingText(platform: SocialPlatform, text: string): { ok: true } | { ok: false; message: string } {
  if (platform === "facebook" && text.length > 2000) {
    return { ok: false, message: `Messenger takes up to 2,000 characters — this is ${text.length}. Split it into two replies.` };
  }
  if (platform === "instagram") {
    const bytes = new TextEncoder().encode(text).length;
    if (bytes > 1000) {
      return { ok: false, message: "Instagram takes about 1,000 characters per message (fewer with emoji). Split it into two replies." };
    }
  }
  return { ok: true };
}
