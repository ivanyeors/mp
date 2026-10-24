import type { SocialPlatform } from "@/lib/social-inbox/platforms";

/**
 * A platform webhook, normalised. Meta (Messenger + Instagram) and TikTok
 * payloads are parsed into these by `meta.ts` and `tiktok.ts`; everything after
 * that — storing, carding, echoes — is platform-agnostic (`ingest.ts`).
 */

export type AttachmentKind =
  | "image"
  | "video"
  | "audio"
  | "file"
  | "sticker"
  | "share"
  | "location"
  | "story_mention"
  | "story_reply"
  | "unsupported";

export type InboundAttachment = {
  kind: AttachmentKind;
  /** A URL Telegram can fetch (Meta CDN), or null when the platform needs auth (TikTok). */
  url: string | null;
  title?: string | null;
};

type Base = {
  platform: SocialPlatform;
  /** Who we reply to: Messenger PSID, Instagram-scoped id, or TikTok conversation id. */
  externalId: string;
  /** The platform's message id — the dedupe key. */
  messageId: string;
};

export type SocialEvent =
  | (Base & {
      /** The customer wrote to us. */
      kind: "message";
      text: string | null;
      attachments: InboundAttachment[];
      sentAt: string;
      /** A handle the payload carries (TikTok); Meta's comes from a profile lookup. */
      username?: string | null;
    })
  | (Base & {
      /** Our account sent this — through us, or from the platform's own app. */
      kind: "echo";
      text: string | null;
      attachments: InboundAttachment[];
      sentAt: string;
    })
  | (Base & {
      /** The customer unsent a message. */
      kind: "unsend";
    });
