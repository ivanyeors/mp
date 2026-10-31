/**
 * `part` of `whole` as a share to print. Never "0%" for some, nor "100%" for
 * not all: "<1%" and ">99%" keep one customer visible in the figures, as a
 * bar's minimum width does in a chart. Used by the Customers page's charts
 * (the Customer lifecycle and the Shopify migration).
 */
export function shareLabel(part: number, whole: number): string {
  if (whole <= 0 || part <= 0) return "0%";
  if (part >= whole) return "100%";
  const pct = (part / whole) * 100;
  if (pct < 1) return "<1%";
  if (pct > 99) return ">99%";
  return `${Math.round(pct)}%`;
}
