export type SettlementCharge = {
  amount: number;
  stripeObjectId: string | null;
};

export type Settlement = {
  charges: SettlementCharge[];
  paymentReference: string | null;
  amountCaptured: number;
};

export function settleResult(input: {
  holdCaptureAmount: number;
  holdIntentId: string | null;
  topUpPaid: number;
  topUpIntentId: string | null;
}): Settlement {
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
    paymentReference:
      input.holdCaptureAmount > 0 ? input.holdIntentId : input.topUpIntentId,
    amountCaptured: input.holdCaptureAmount + input.topUpPaid,
  };
}
