/** Sell totals for a Result. Goods are priced by `priceComposedBuild`; this adds
 *  shipping and tax. Fillings never affect sell price. */

export type PricedLine = {
  msrp: number;
  quantity: number;
};

export type PriceResultInput = {
  /** Goods subtotal from `priceComposedBuild` — Costings row + component deltas + add-ons. */
  subtotal: number;
  shipping?: number;
  tax?: number;
};

export type PriceResultOutput = {
  subtotal: number;
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
 * `priceComposedBuild` owns that rule; this owns only shipping and tax.
 */
export function priceResult(input: PriceResultInput): PriceResultOutput {
  const shipping = input.shipping ?? 0;
  const tax = input.tax ?? 0;
  return { subtotal: input.subtotal, shipping, tax, total: input.subtotal + shipping + tax };
}
