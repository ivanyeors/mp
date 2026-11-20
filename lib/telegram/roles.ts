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
  "telegram.shop-review-reply":
    "Write or remove our public reply under a website review, by replying to its card. Speaks for the business on mpillow.com.",
  "telegram.social-inbox-reply":
    "Answer Facebook, Instagram and TikTok messages by replying to their cards. Speaks to customers for the business.",
};

export function describeActions(actions: readonly TelegramAction[]): string {
  return actions.length ? actions.map(telegramActionLabel).join(", ") : "no actions";
}
