export interface ReconcilableOrder {
  subtotal: number;
  discount_amount: number;
  shipping_amount: number;
  tax_amount: number | null;
}

export interface SessionTotals {
  amountTotal: number;
  amountTax: number;
}

export interface ReconcileResult {
  ok: boolean;
  expectedTotal: number;
  sessionTotal: number;
  delta: number;
  writeBack: { tax_amount: number; total: number };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function sessionTotals(session: {
  amount_total?: number | null;
  total_details?: { amount_tax?: number | null } | null;
}): SessionTotals {
  return {
    amountTotal: (session.amount_total ?? 0) / 100,
    amountTax: (session.total_details?.amount_tax ?? 0) / 100,
  };
}

export function reconcileOrderTotal(
  order: ReconcilableOrder,
  totals: SessionTotals,
  tolerance = 0.01
): ReconcileResult {
  const preTax = round2(order.subtotal - order.discount_amount + order.shipping_amount);
  const tax = totals.amountTax > 0 ? totals.amountTax : order.tax_amount ?? 0;
  const expectedTotal = round2(preTax + tax);
  const sessionTotal = round2(totals.amountTotal);
  const delta = round2(sessionTotal - expectedTotal);

  return {
    ok: Math.abs(delta) <= tolerance,
    expectedTotal,
    sessionTotal,
    delta,
    writeBack: { tax_amount: round2(tax), total: sessionTotal },
  };
}
