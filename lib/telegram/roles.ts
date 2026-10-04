/**
 * Telegram actions: what a linked person can do on review cards in the
 * measurements group (ADR 0023).
 *
 * Each action is a permission catalog key (`telegram.*` in
 * lib/auth/permissions.ts), so a role grants it on Users & permissions →
 * Roles like any page. A Telegram link (a Staff profile's bound Telegram
 * account) lists the actions turned on for that person; a tap needs both.
 *
 * Everyone in the group can SEE the cards. Only a linked person whose link and
 * whose login's role both grant the action can press a button that changes
 * something.
 */
import { catalogForSurface, isPermission, permissionEntry, type Permission } from "@/lib/auth/permissions";

export type TelegramAction = Extract<Permission, `telegram.${string}`>;

export const TELEGRAM_ACTIONS = catalogForSurface("telegram").map((e) => e.key) as TelegramAction[];

export function isTelegramAction(value: unknown): value is TelegramAction {
  return isPermission(value) && value.startsWith("telegram.");
}

export function telegramActionLabel(action: TelegramAction): string {
  return permissionEntry(action).label;
}

export const TELEGRAM_ACTION_DESCRIPTIONS: Record<TelegramAction, string> = {
  "telegram.google-review-reply":
    "Post replies to Google reviews (and edit a draft by replying to its card). Speaks for the business on Google Maps.",
  "telegram.shop-review-moderate": "Approve or reject reviews left on the website. Nothing outside mpillow.com.",
};

/** "Reply to Google reviews, Moderate shop reviews", or "no actions". */
export function describeActions(actions: readonly TelegramAction[]): string {
  return actions.length ? actions.map(telegramActionLabel).join(", ") : "no actions";
}
