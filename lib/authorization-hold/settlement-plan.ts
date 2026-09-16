/**
 * How a Result settles: capture from the Authorization hold, take a Balance
 * payment, or both (ADR 0016).
 *
 * Pure, and split out of `lib/authorization-hold/index.ts` — which loads the
 * Stripe SDK — so callers that only need to DESCRIBE the split can read it
 * without pulling a client they will never call. The "your build has been
 * updated" email is the one that matters: it tells the customer what their card
 * covers and what is left to pay, and it must say exactly what Accept will do.
 * Re-deriving that arithmetic in the template is how an email comes to promise
 * a number the checkout then contradicts.
 *
 * Re-exported from `lib/authorization-hold`, so existing imports are unchanged.
 */

export type CapturePlan =
  | { kind: "capture"; amount: number }
  | { kind: "top_up"; holdCapture: number; topUp: number };

/**
 * Decide how to settle final vs authorized hold.
 * Never captures above authorized — excess requires a separate Balance payment.
 *
 * A Result with no Authorization hold passes `authorizedAmount = 0` and takes the
 * same branch for its whole total: a full payment is a top-up from a hold of zero
 * (ADR 0016). That keeps one settlement path rather than two.
 */
export function planCapture(finalAmount: number, authorizedAmount: number): CapturePlan {
  if (finalAmount <= 0) {
    throw new Error("final amount must be positive");
  }
  if (authorizedAmount <= 0) {
    return { kind: "top_up", holdCapture: 0, topUp: finalAmount };
  }
  if (finalAmount <= authorizedAmount) {
    return { kind: "capture", amount: finalAmount };
  }
  return {
    kind: "top_up",
    holdCapture: authorizedAmount,
    topUp: Math.round((finalAmount - authorizedAmount) * 100) / 100,
  };
}
