/** Sell totals for a Result. Goods are priced by `priceComposedBuild`; Service fees by
 *  `resultServiceLines` (ADR 0024); this adds them, takes off a discount code
 *  (ADR 0033), then adds shipping and tax. Fillings never affect sell price. */

export type PricedLine = {
  msrp: number;
  quantity: number;
};

export type PriceResultInput = {
  /** Goods subtotal from `priceComposedBuild` — Costings row + component deltas + add-ons. */
  goods: number;
  /** Service fees (`resultServiceLines`) — Mpillow's labour, never goods. */
  services?: number;
  shipping?: number;
  tax?: number;
  /** A discount code's money off the goods (`resultCouponPricing`). Tax is worked on what is left. */
  discount?: number;
};

export type PriceResultOutput = {
  /** What ships. The free-shipping threshold and the commission base see only this. */
  goods: number;
  /** Service fees. Never shipped, never stock-deducted — but taxed like goods. */
  services: number;
  /** goods + services: what an Order's lines sum to. */
  subtotal: number;
  /** Off the goods, never more than them; the Order's `discount_amount`. */
  discount: number;
  shipping: number;
  tax: number;
  total: number;
};

/**
 * Authorized / final sell total.
 *
 * The subtotal is NOT "composed MSRP + every preference MSRP" any more. A Costings
 * row is the price of a whole configuration, so adding the chosen cover and case on
 * top double-charged for components the row already included — 473 for a 360 pillow.
 * `priceComposedBuild` owns that rule; this owns only the sums.
 */
export function priceResult(input: PriceResultInput): PriceResultOutput {
  const services = input.services ?? 0;
  const shipping = input.shipping ?? 0;
  const tax = input.tax ?? 0;
  const discount = Math.min(Math.max(0, input.discount ?? 0), Math.max(0, input.goods));
  const subtotal = input.goods + services;
  return {
    goods: input.goods,
    services,
    subtotal,
    discount,
    shipping,
    tax,
    total: subtotal - discount + shipping + tax,
  };
}
