export const SOCIAL_PLATFORMS = ["facebook", "instagram", "tiktok"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export function isSocialPlatform(value: unknown): value is SocialPlatform {
  return typeof value === "string" && (SOCIAL_PLATFORMS as readonly string[]).includes(value);
}

export const PLATFORM_NAMES: Record<SocialPlatform, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
};

export const PLATFORM_APPS: Record<SocialPlatform, string> = {
  facebook: "Meta Business Suite (or the Facebook Page inbox)",
  instagram: "the Instagram app (or Meta Business Suite)",
  tiktok: "the TikTok app",
};

const HOUR_MS = 3_600_000;

export const REPLY_WINDOW_HOURS: Record<SocialPlatform, number | null> = {
  facebook: 24,
  instagram: 24,
  tiktok: null,
};

export const HUMAN_AGENT_WINDOW_HOURS = 7 * 24;

export function humanAgentEnabled(): boolean {
  return process.env.META_HUMAN_AGENT_ENABLED?.trim().toLowerCase() === "true";
}

export type ReplyWindow =
  | { ok: true; tag: "HUMAN_AGENT" | null }
  | { ok: false; message: string };

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
  if (window === null || ageHours <= window) return { ok: true, tag: null };

  const meta = platform === "facebook" || platform === "instagram";
  if (meta && opts.humanAgent && ageHours <= HUMAN_AGENT_WINDOW_HOURS) return { ok: true, tag: "HUMAN_AGENT" };

  const limit = meta && opts.humanAgent ? "7 days" : `${window} hours`;
  return {
    ok: false,
    message: `${name} only accepts replies from here within ${limit} of the customer's last message. Answer from ${app} instead.`,
  };
}

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
