/**
 * Telegram RBAC: who may act on review cards and customer message cards in the
 * measurements group.
 *
 * Same shape as lib/auth/permissions.ts — the role → action matrix lives in
 * code so it is deterministic and unit-testable; the people, their role and
 * whether they are active live in `telegram_operators`, managed from
 * Staff Management → Telegram access.
 *
 * Everyone in the group can SEE the cards. Only a linked, active operator
 * whose role grants the action can press a button that changes something.
 */

export const TELEGRAM_ACTIONS = ["google_review.reply", "shop_review.moderate", "social_inbox.reply"] as const;
export type TelegramAction = (typeof TELEGRAM_ACTIONS)[number];

export const TELEGRAM_ROLES = ["review_manager", "shop_moderator", "inbox_agent"] as const;
export type TelegramRole = (typeof TELEGRAM_ROLES)[number];

/**
 * Review managers speak for the business on Google Maps, so they can also
 * moderate the website's own reviews and answer customer messages. Shop
 * moderators only approve or reject website reviews — nothing they do is
 * visible outside mpillow.com. Inbox agents only answer Facebook, Instagram
 * and TikTok messages (PRD-social-inbox).
 */
export const TELEGRAM_ROLE_ACTIONS: Record<TelegramRole, TelegramAction[]> = {
  review_manager: ["google_review.reply", "shop_review.moderate", "social_inbox.reply"],
  shop_moderator: ["shop_review.moderate"],
  inbox_agent: ["social_inbox.reply"],
};

export const TELEGRAM_ROLE_LABELS: Record<TelegramRole, string> = {
  review_manager: "Review manager",
  shop_moderator: "Shop moderator",
  inbox_agent: "Inbox agent",
};

export const TELEGRAM_ROLE_DESCRIPTIONS: Record<TelegramRole, string> = {
  review_manager:
    "Posts replies to Google reviews, approves or rejects shop reviews, and answers Facebook, Instagram and TikTok messages.",
  shop_moderator: "Approves or rejects shop reviews only.",
  inbox_agent: "Answers Facebook, Instagram and TikTok messages only.",
};

export function isTelegramRole(value: unknown): value is TelegramRole {
  return typeof value === "string" && (TELEGRAM_ROLES as readonly string[]).includes(value);
}

export function telegramRoleCan(role: TelegramRole, action: TelegramAction): boolean {
  return TELEGRAM_ROLE_ACTIONS[role]?.includes(action) ?? false;
}
