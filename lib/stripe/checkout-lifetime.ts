/**
 * How long a shop Checkout Session stays payable (pre-launch hardening,
 * 2026-10-26; Stripe's default is 24 hours, and it allows 30 minutes to 24).
 *
 * An open checkout holds what its order reserved until it is paid or expires:
 * a use of its discount code, its Partner pricing units, and its points. A
 * short life means an abandoned checkout gives them back within the hour
 * instead of holding a limited code's last use for a day.
 */
export const SHOP_CHECKOUT_LIFETIME_MS = 60 * 60 * 1000;

/**
 * How far back an unpaid order still counts as an open checkout: the lifetime
 * plus a margin for the moments between writing the order and Stripe opening
 * its session, so an order never stops counting while it can still be paid.
 */
export const OPEN_CHECKOUT_WINDOW_MS = SHOP_CHECKOUT_LIFETIME_MS + 5 * 60 * 1000;
