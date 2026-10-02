/**
 * Which kind of reply a Google review gets, decided by its star rating in code
 * — not left to the model — so a 1★ review always gets a service-recovery
 * reply and the card can say which kind it is showing.
 *
 *   4–5★  thank-you         thank them specifically, one soft invitation
 *   3★    constructive      acknowledge what fell short, invite contact, no selling
 *   1–2★  service recovery  apologise, own it, offer one concrete next step,
 *                           ask them to contact support; no promotion at all
 *
 * A review with no rating gets the constructive reply: no selling, no assumptions.
 */

export const REPLY_STYLES = ["thank_you", "constructive", "service_recovery"] as const;
export type ReplyStyle = (typeof REPLY_STYLES)[number];

/** The name the drafting prompt defines each type under. */
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
