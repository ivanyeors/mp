import { PREVIEW_CARD_PREFIX, formatCardDate } from "@/lib/reviews/cards";
import { PLATFORM_APPS, PLATFORM_NAMES, type SocialPlatform } from "@/lib/social-inbox/platforms";
import type { InboundAttachment } from "@/lib/social-inbox/types";

/**
 * What the bot posts to the measurements group for customer messages. Plain
 * text like the review cards — no parse_mode, nothing to escape.
 *
 * Every message the bot posts about a conversation starts with one of a few
 * fixed prefixes, so the Telegram router can tell, without a database read,
 * that a staff reply to it belongs to the inbox. The row that message was
 * stored on then names the conversation.
 */

export const INBOX_CARD_HEADERS: Record<SocialPlatform, string> = {
  facebook: "💬 FACEBOOK MESSAGE",
  instagram: "💬 INSTAGRAM DM",
  tiktok: "💬 TIKTOK DM",
};

/** After a reply from Telegram went out to the customer. */
export const SENT_NOTE_PREFIX = "📤 Sent to ";
/** Someone answered from the platform's own app instead. */
export const ECHO_NOTE_PREFIX = "↪️ Answered in ";
/** A staff reply that starts with this stays in the group. */
export const TEAM_NOTE_PREFIX = "//";

const ECHO_SOURCES: Record<SocialPlatform, string> = {
  facebook: "Meta Business Suite",
  instagram: "Instagram or Business Suite",
  tiktok: "TikTok",
};

/** Telegram's limits: a message, and a photo caption. */
export const TELEGRAM_MAX_CHARS = 4096;
export const TELEGRAM_MAX_CAPTION = 1024;

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function customerLabel(
  platform: SocialPlatform,
  customer: { displayName: string | null; username: string | null },
): string {
  const name = customer.displayName?.trim() || null;
  const handle = customer.username?.trim().replace(/^@/, "") || null;
  if (platform === "facebook") return name ?? "A Facebook user";
  if (name && handle && name !== handle) return `${name} (@${handle})`;
  if (handle) return `@${handle}`;
  return name ?? (platform === "instagram" ? "An Instagram user" : "A TikTok user");
}

function attachmentLine(a: InboundAttachment, platform: SocialPlatform, shownAsPhoto: boolean): string | null {
  const openIn = `open ${PLATFORM_APPS[platform]} to see it`;
  const withUrl = (label: string) => (a.url ? `${label}: ${a.url}` : `${label} — ${openIn}`);
  switch (a.kind) {
    case "image":
      return shownAsPhoto ? null : withUrl("📷 Photo");
    case "video":
      return withUrl("🎥 Video");
    case "audio":
      return withUrl("🎤 Voice message");
    case "file":
      return withUrl("📎 File");
    case "sticker":
      return "🙂 Sticker";
    case "location":
      return "📍 Shared a location";
    case "share":
      return withUrl(`🔗 Shared ${a.title?.trim() ? `“${clip(a.title.trim(), 120)}”` : "a post"}`);
    case "story_mention":
      return withUrl("📣 Mentioned us in their story");
    case "story_reply":
      return withUrl("↩️ Replying to our story");
    default:
      return `❔ A message type we can't show here — ${openIn}`;
  }
}

export type InboxCardInput = {
  platform: SocialPlatform;
  customer: { displayName: string | null; username: string | null };
  text: string | null;
  attachments: InboundAttachment[];
  sentAt: string | null;
  /** The card is the caption of this attachment's photo. */
  photoIndex?: number | null;
};

/**
 * The card for one customer message, within `maxChars` (4096 for a text
 * message, 1024 for a photo caption). The message is clipped, never the
 * header or the instructions, so the card always sends and always says how to
 * answer.
 */
export function renderInboxCard(input: InboxCardInput, maxChars = TELEGRAM_MAX_CHARS): string {
  const head = [`${INBOX_CARD_HEADERS[input.platform]} · ${customerLabel(input.platform, input.customer)}`];
  const when = formatCardDate(input.sentAt);
  if (when) head.push(when);

  const extras = input.attachments
    .map((a, i) => attachmentLine(a, input.platform, i === input.photoIndex))
    .filter((l): l is string => !!l);
  const footer = `↩️ Reply to this message to answer on ${PLATFORM_NAMES[input.platform]}. Start with ${TEAM_NOTE_PREFIX} for a team-only note.`;

  const build = (body: string | null, extraLines: string[]) =>
    [...head, "", ...(body ? [body] : []), ...extraLines, "", footer].join("\n").replace(/\n{3,}/g, "\n\n");

  const text = input.text?.trim() ? input.text.trim() : null;
  let card = build(text ? `“${text}”` : null, extras);
  if (card.length <= maxChars) return card;

  // Attachment lines go first (long CDN URLs), then the message is clipped.
  const extrasShort = extras.map((l) => l.split(": http")[0]);
  card = build(text ? `“${text}”` : null, extrasShort);
  if (card.length <= maxChars || !text) return card.slice(0, maxChars);
  const room = maxChars - build("“”", extrasShort).length;
  return build(`“${clip(text, Math.max(20, room))}”`, extrasShort).slice(0, maxChars);
}

export function renderSentNote(
  platform: SocialPlatform,
  customer: { displayName: string | null; username: string | null },
  by: string,
): string {
  return `${SENT_NOTE_PREFIX}${customerLabel(platform, customer)} on ${PLATFORM_NAMES[platform]} by ${by}. Reply to this to send another message.`;
}

export function renderEchoNote(platform: SocialPlatform, text: string | null, attachments: InboundAttachment[]): string {
  const body = text?.trim() ? `“${clip(text.trim(), 1500)}”` : attachments.length ? "(an attachment)" : "(a message)";
  return `${ECHO_NOTE_PREFIX}${ECHO_SOURCES[platform]}: ${body}`;
}

export const UNSENT_NOTE = "🗑 The customer unsent this message.";

/** The platform a preview card stands for, from its second line; null for anything else. */
export function inboxPreviewPlatform(text: string | undefined): SocialPlatform | null {
  if (!text?.startsWith(PREVIEW_CARD_PREFIX)) return null;
  const second = text.split("\n")[1] ?? "";
  for (const [platform, header] of Object.entries(INBOX_CARD_HEADERS) as [SocialPlatform, string][]) {
    if (second.startsWith(header)) return platform;
  }
  return null;
}

/** Is this a message the bot posts about a conversation (card, sent note, echo note)? No I/O. */
export function isInboxBotText(text: string | undefined): boolean {
  if (!text) return false;
  if (Object.values(INBOX_CARD_HEADERS).some((h) => text.startsWith(h))) return true;
  if (text.startsWith(SENT_NOTE_PREFIX) || text.startsWith(ECHO_NOTE_PREFIX)) return true;
  return inboxPreviewPlatform(text) !== null;
}
