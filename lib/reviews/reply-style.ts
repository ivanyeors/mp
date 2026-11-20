export const REPLY_STYLES = ["thank_you", "constructive", "service_recovery"] as const;
export type ReplyStyle = (typeof REPLY_STYLES)[number];

export const REPLY_STYLE_NAMES: Record<ReplyStyle, string> = {
  thank_you: "Thank-you",
  constructive: "Constructive",
  service_recovery: "Service recovery",
};

export function replyStyleFor(starRating: number | null | undefined): ReplyStyle {
  if (starRating == null) return "constructive";
  if (starRating <= 2) return "service_recovery";
  if (starRating === 3) return "constructive";
  return "thank_you";
}
