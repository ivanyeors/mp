import type { SocialPlatform } from "@/lib/social-inbox/platforms";

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
  url: string | null;
  title?: string | null;
};

type Base = {
  platform: SocialPlatform;
  externalId: string;
  messageId: string;
};

export type SocialEvent =
  | (Base & {
      kind: "message";
      text: string | null;
      attachments: InboundAttachment[];
      sentAt: string;
      username?: string | null;
    })
  | (Base & {
      kind: "echo";
      text: string | null;
      attachments: InboundAttachment[];
      sentAt: string;
    })
  | (Base & {
      kind: "unsend";
    });
