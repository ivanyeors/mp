/**
 * What actually charged when a Result settles, and which intent the Order should
 * name as its payment reference.
 *
 * Pure, and separate from the accept route, because getting it wrong is silent.
 * `order_payments` is what `summarize()` reads to decide how much may be
 * refunded: a charge row for money that never moved raises that ceiling, and a
 * missing one drops it so that any refund satisfies `refunded >= captured` and
 * flips a partially-refunded order to fully refunded — zeroing `amount_captured`
 * and voiding partner Commissions.
 *
 * Two shapes reach here (ADR 0016):
 *   - an Authorization hold, captured, optionally plus a Balance payment top-up;
 *   - no hold at all, settled by a Balance payment for the whole total.
 */

export type SettlementCharge = {
  amount: number;
  stripeObjectId: string | null;
};

export type Settlement = {
  /** One entry per intent that actually moved money. Never a zero-amount row. */
  charges: SettlementCharge[];
  /** The intent the Order names. Null only when nothing charged. */
  paymentReference: string | null;
  /** Total actually taken, for `orders.amount_captured`. */
  amountCaptured: number;
};

export function settleResult(input: {
  /** Captured from the hold. Zero when there is no hold. */
  holdCaptureAmount: number;
  holdIntentId: string | null;
  /** Paid by Balance payment. Zero when the hold covered the total. */
  topUpPaid: number;
  topUpIntentId: string | null;
}): Settlement {
  // A capture with no intent is money that never moved; ledgering it as a
  // charge would mark the Order paid for it.
  if (input.holdCaptureAmount > 0 && !input.holdIntentId) {
    throw new Error("A hold capture needs the payment intent it captured");
  }
  const charges: SettlementCharge[] = [];
  if (input.holdCaptureAmount > 0) {
    charges.push({
      amount: input.holdCaptureAmount,
      stripeObjectId: input.holdIntentId,
    });
  }
  if (input.topUpPaid > 0) {
    charges.push({ amount: input.topUpPaid, stripeObjectId: input.topUpIntentId });
  }

  return {
    charges,
    // The hold is the reference when it captured; otherwise the Balance payment
    // is the only charge there was.
    paymentReference:
      input.holdCaptureAmount > 0 ? input.holdIntentId : input.topUpIntentId,
    amountCaptured: input.holdCaptureAmount + input.topUpPaid,
  };
}
