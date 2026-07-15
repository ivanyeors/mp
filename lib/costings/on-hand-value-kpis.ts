/** As-of-now on-hand stock value KPIs (Costings home; same math as former Analytics strip). */

export type OnHandPricedUnit = {
  cost: number | null;
  msrp: number | null;
  onHand: number;
};

export type OnHandValueKpis = {
  costValue: number;
  msrpValue: number;
  marginValue: number;
  weightedMarginPct: number | null;
  totalItems: number;
};

/** Inventory at cost / potential MSRP / unrealized margin / weighted margin % from active items × prices × on_hand. */
export function computeOnHandValueKpis(items: OnHandPricedUnit[]): OnHandValueKpis {
  let costValue = 0;
  let msrpValue = 0;
  for (const item of items) {
    // ponytail: clamp negatives like prior Analytics; revisit if signed on_hand becomes intentional
    const qty = Math.max(item.onHand, 0);
    costValue += (item.cost ?? 0) * qty;
    msrpValue += (item.msrp ?? 0) * qty;
  }
  const marginValue = Math.max(0, msrpValue - costValue);
  const weightedMarginPct = msrpValue > 0 ? (marginValue / msrpValue) * 100 : null;
  return {
    costValue,
    msrpValue,
    marginValue,
    weightedMarginPct,
    totalItems: items.length,
  };
}
