import type { Stripe } from "@stripe/stripe-js";

/**
 * Apple Pay from the checkout form (ADR 0052, "Apple Pay beside the checkout
 * button"). Browser only, but free of React so it can be tested on its own.
 *
 * The Apple Pay button sits on the form, before any Order exists, so it runs in
 * Stripe's deferred mode: the sheet shows the page's total, and approving it
 * only makes a PaymentMethod. The Order and its Checkout Session are made after
 * that, by the same `/api/shop/checkout` as every other path, and the Session
 * is then paid with that PaymentMethod. Fulfilment, expiry, reconcile and
 * refunds still read a Checkout Session and cannot tell the difference.
 */

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
