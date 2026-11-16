import type { Stripe } from "@stripe/stripe-js";

/**
 * Apple Pay and Google Pay from the checkout form (ADR 0052, "Wallet buttons
 * beside the checkout button"). Browser only, but free of React so it can be
 * tested on its own.
 *
 * The wallet buttons sit on the form, before any Order exists, so they run in
 * Stripe's deferred mode: the sheet shows the page's total, and approving it
 * only makes a PaymentMethod. The Order and its Checkout Session are made after
 * that, by the same `/api/shop/checkout` as every other path, and the Session
 * is then paid with that PaymentMethod. Fulfilment, expiry, reconcile and
 * refunds still read a Checkout Session and cannot tell the difference.
 */

/** The wallets offered beside the checkout button, in the order they sit. */
export const WALLETS = ["applePay", "googlePay"] as const;
export type Wallet = (typeof WALLETS)[number];

export const WALLET_NAMES: Record<Wallet, string> = {
  applePay: "Apple Pay",
  googlePay: "Google Pay",
};

/**
 * How widely a wallet shows (Stripe's `paymentMethods` option for it).
 *
 * - `"auto"`, on phones and tablets: only where it is set up. An iPhone with a
 *   card in Wallet gets Apple Pay; an Android phone with Google Pay gets
 *   Google Pay. Neither shows on the other.
 * - `"always"`, on computers: wherever the browser can offer it, set up or
 *   not. Apple Pay in Safari, and in Chrome, Edge and Firefox by scanning a
 *   code with an iPhone; Google Pay in Chrome and Edge, and in Safari and
 *   Firefox. So a Mac or PC shows both, beside card and PayNow.
 *
 * Either way a wallet shows only once it is on in the Stripe Dashboard and the
 * domain is registered there.
 */
export type WalletDisplay = "auto" | "always";

/** A computer: its main pointer is a mouse or trackpad, not a finger. */
export const COMPUTER_MEDIA_QUERY = "(hover: hover) and (pointer: fine)";

/**
 * The wallet buttons to show beside the checkout button, in order, out of the
 * ones Stripe said can show: both on a wide screen, the first on a phone,
 * where the sticky bar has room for one beside the checkout button.
 */
export function walletsBeside(available: Iterable<Wallet>, wide: boolean): Wallet[] {
  const can = new Set(available);
  return WALLETS.filter((wallet) => can.has(wallet)).slice(0, wide ? WALLETS.length : 1);
}

/** Stripe's zero-decimal currencies: amounts in these are already whole units. */
const ZERO_DECIMAL = new Set([
  "BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA",
  "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF",
]);

function minorPerMajor(currency: string): number {
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? 1 : 100;
}

/** A major-unit amount (12.5 SGD) in the minor units Stripe counts in (1250). */
export function toMinorUnits(amount: number, currency: string): number {
  return Math.round(amount * minorPerMajor(currency));
}

/** Minor units (1250) back to the major-unit amount people read (12.5 SGD). */
export function fromMinorUnits(amount: number, currency: string): number {
  return amount / minorPerMajor(currency);
}

export type WalletConfirmResult =
  /** Confirmed: Stripe is taking this tab to the confirmation page. */
  | { type: "paid" }
  /**
   * The server priced the Order differently from what the sheet showed (tax
   * the page does not show, a partner discount, a price that moved). Nothing
   * was charged, and the Session is still open at its true total.
   */
  | { type: "total_changed"; total: number }
  /** Not charged: the Session could not load, or the payment was declined. */
  | { type: "failed"; message: string };

/**
 * Pay an on-page Checkout Session with the PaymentMethod an approved Apple Pay
 * sheet made. The shopper approved `authorizedMinor` and nothing else, so a
 * Session that totals anything else is never confirmed.
 */
export async function confirmWithWallet(
  stripe: Pick<Stripe, "initCheckoutElementsSdk">,
  opts: { clientSecret: string; paymentMethodId: string; authorizedMinor: number },
): Promise<WalletConfirmResult> {
  const checkout = stripe.initCheckoutElementsSdk({ clientSecret: opts.clientSecret });
  const loaded = await checkout.loadActions();
  if (loaded.type === "error") return { type: "failed", message: loaded.error.message };

  const session = loaded.actions.getSession();
  const totalMinor = session.total.total.minorUnitsAmount;
  if (totalMinor !== opts.authorizedMinor) {
    return { type: "total_changed", total: totalMinor / session.minorUnitsAmountDivisor };
  }

  // Stripe's documented use of `paymentMethod`: "a previously collected
  // PaymentMethod", used instead of anything a Payment Element holds.
  const result = await loaded.actions.confirm({ paymentMethod: opts.paymentMethodId });
  if (result.type === "error") return { type: "failed", message: result.error.message };
  return { type: "paid" };
}
