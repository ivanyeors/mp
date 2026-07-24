/**
 * RMA eligibility (ADR 0011). Pure function over data only, so the customer UI
 * (to decide whether to show "Request a return") and the server insert (which
 * never trusts the client) share exactly one rule set.
 */

export const DEFAULT_RETURN_WINDOW_DAYS = 30;

export interface EligibilityOrder {
  /** Return window is measured from delivery; null = not delivered yet. */
  delivered_at?: string | null;
  /** `orders.order_status`; 'refunded' means fully refunded. */
  status?: string | null;
}

export interface EligibilityItem {
  /** Quantity originally ordered for this line. */
  quantity: number;
}

export interface EligibilityInput {
  order: EligibilityOrder;
  item: EligibilityItem;
  /** Quantity of this line already tied up in a non-terminal RMA. */
  alreadyReturnedQty: number;
  /** Quantity the customer wants to return. Defaults to 1 (UI "can I return?"). */
  requestedQty?: number;
  returnWindowDays: number;
  now: Date;
}

export interface EligibilityResult {
  eligible: boolean;
  reason?: string;
  /** Max quantity of this line still returnable (>= 0). */
  availableQty: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function evaluateEligibility(input: EligibilityInput): EligibilityResult {
  const { order, item, alreadyReturnedQty, returnWindowDays, now } = input;
  const requestedQty = input.requestedQty ?? 1;
  const availableQty = Math.max(0, item.quantity - alreadyReturnedQty);

  if (order.status === "refunded") {
    return { eligible: false, reason: "This order has already been fully refunded.", availableQty };
  }
  if (!order.delivered_at) {
    return { eligible: false, reason: "This order hasn't been delivered yet.", availableQty };
  }

  const deliveredAt = new Date(order.delivered_at);
  const windowEnds = new Date(deliveredAt.getTime() + returnWindowDays * DAY_MS);
  if (now.getTime() > windowEnds.getTime()) {
    return {
      eligible: false,
      reason: `The ${returnWindowDays}-day return window closed on ${windowEnds
        .toISOString()
        .slice(0, 10)}.`,
      availableQty,
    };
  }

  if (availableQty <= 0) {
    return { eligible: false, reason: "All of this item is already part of a return.", availableQty };
  }
  if (requestedQty < 1) {
    return { eligible: false, reason: "Select at least one item to return.", availableQty };
  }
  if (requestedQty > availableQty) {
    return {
      eligible: false,
      reason: `Only ${availableQty} of this item can still be returned.`,
      availableQty,
    };
  }

  return { eligible: true, availableQty };
}
