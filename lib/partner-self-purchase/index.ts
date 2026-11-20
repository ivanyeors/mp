export type SelfPurchaseKind = "flat" | "percent";

export interface SelfPurchaseRate {
  kind: SelfPurchaseKind | null;
  amount: number;
  unitCap: number;
  unitsUsed: number;
}

export interface CommissionableLine {
  unitPrice: number;
  quantity: number;
}

export interface SelfPurchaseDiscount {
  discountAmount: number;
  discountedUnits: number;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function remainingSelfPurchaseUnits(rate: Pick<SelfPurchaseRate, "unitCap" | "unitsUsed">): number {
  return Math.max(0, rate.unitCap - rate.unitsUsed);
}

export function computeSelfPurchaseDiscount(
  rate: SelfPurchaseRate,
  lines: CommissionableLine[],
): SelfPurchaseDiscount {
  const remaining = remainingSelfPurchaseUnits(rate);
  if (!rate.kind || rate.amount <= 0 || remaining <= 0) {
    return { discountAmount: 0, discountedUnits: 0 };
  }

  let unitsLeft = remaining;
  let discountAmount = 0;
  let discountedUnits = 0;
  for (const line of lines) {
    if (unitsLeft <= 0) break;
    const units = Math.min(line.quantity, unitsLeft);
    const perUnitOff =
      rate.kind === "percent"
        ? (line.unitPrice * rate.amount) / 100
        : Math.min(rate.amount, line.unitPrice);
    discountAmount += perUnitOff * units;
    discountedUnits += units;
    unitsLeft -= units;
  }
  return { discountAmount: round2(discountAmount), discountedUnits };
}
