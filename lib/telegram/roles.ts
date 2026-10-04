/**
 * Telegram RBAC: who may act on review cards in the measurements group.
 *
 * Same shape as lib/auth/permissions.ts — the role → action matrix lives in
 * code so it is deterministic and unit-testable; the people, their role and
 * whether they are active live in `telegram_operators`, managed from
 * Users & permissions → Telegram.
 *
 * Everyone in the group can SEE the cards. Only a linked, active operator
 * whose role grants the action can press a button that changes something.
 */

export const TELEGRAM_ACTIONS = ["google_review.reply", "shop_review.moderate"] as const;
export type TelegramAction = (typeof TELEGRAM_ACTIONS)[number];

export const TELEGRAM_ROLES = ["review_manager", "shop_moderator"] as const;
export type TelegramRole = (typeof TELEGRAM_ROLES)[number];

/**
 * Review managers speak for the business on Google Maps, so they can also
 * moderate the website's own reviews. Shop moderators only approve or reject
 * website reviews — nothing they do is visible outside mpillow.com.
 */
export const TELEGRAM_ROLE_ACTIONS: Record<TelegramRole, TelegramAction[]> = {
  review_manager: ["google_review.reply", "shop_review.moderate"],
  shop_moderator: ["shop_review.moderate"],
};

export const TELEGRAM_ROLE_LABELS: Record<TelegramRole, string> = {
  review_manager: "Review manager",
  shop_moderator: "Shop moderator",
};

export const TELEGRAM_ROLE_DESCRIPTIONS: Record<TelegramRole, string> = {
  review_manager: "Posts replies to Google reviews and approves or rejects shop reviews.",
  shop_moderator: "Approves or rejects shop reviews only.",
};

export function isTelegramRole(value: unknown): value is TelegramRole {
  return typeof value === "string" && (TELEGRAM_ROLES as readonly string[]).includes(value);
}

export function telegramRoleCan(role: TelegramRole, action: TelegramAction): boolean {
  return TELEGRAM_ROLE_ACTIONS[role]?.includes(action) ?? false;
}
