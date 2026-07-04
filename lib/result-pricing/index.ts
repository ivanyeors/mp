/** Sell totals for a Result from Costings MSRP. Fillings never affect sell price. */

export type PricedLine = {
  msrp: number;
  quantity: number;
};

export type PriceResultInput = {
  /** Composed sellable MSRP for assigned size×tier / length (product_prices). */
  composedSellableMsrp: number;
  preferenceLines: PricedLine[];
  addonLines: PricedLine[];
  shipping?: number;
  tax?: number;
};

export type PriceResultOutput = {
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
};

function lineSum(lines: PricedLine[]): number {
  return lines.reduce((sum, l) => sum + l.msrp * l.quantity, 0);
}

/**
 * Authorized / final sell total: composed MSRP + preference/add-on MSRPs + shipping + tax.
 * Filling Template lines are intentionally omitted — they affect COGS only.
 */
export function priceResult(input: PriceResultInput): PriceResultOutput {
  const subtotal =
    input.composedSellableMsrp +
    lineSum(input.preferenceLines) +
    lineSum(input.addonLines);
  const shipping = input.shipping ?? 0;
  const tax = input.tax ?? 0;
  return { subtotal, shipping, tax, total: subtotal + shipping + tax };
}
