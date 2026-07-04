/** Legal Result status transitions and invariants. */

export type ResultStatus =
  | "held"
  | "assigned"
  | "accepted"
  | "declined"
  | "expired"
  | "captured";

export type ResultState = {
  status: ResultStatus;
  filling_template_id: number | null;
  /** Null for in-store review-only Results (no authorization hold). */
  payment_intent_id: string | null;
};

export type Transition =
  | { action: "assign"; filling_template_id: number }
  | { action: "accept" }
  | { action: "decline" }
  | { action: "expire" }
  | { action: "capture" };

export type TransitionResult =
  | { ok: true; status: ResultStatus; releaseHold: boolean }
  | { ok: false; error: string };

/**
 * Apply a lifecycle transition. Pure — caller persists status and releases the hold when releaseHold.
 */
export function transitionResult(
  state: ResultState,
  transition: Transition,
): TransitionResult {
  switch (transition.action) {
    case "assign": {
      if (state.status !== "held") {
        return { ok: false, error: `Cannot assign from status ${state.status}` };
      }
      if (!transition.filling_template_id) {
        return { ok: false, error: "Assign requires a Filling Template" };
      }
      return { ok: true, status: "assigned", releaseHold: false };
    }
    case "accept": {
      if (state.status !== "assigned") {
        return { ok: false, error: `Cannot accept from status ${state.status}` };
      }
      return { ok: true, status: "accepted", releaseHold: false };
    }
    case "decline": {
      if (state.status !== "assigned") {
        return { ok: false, error: `Cannot decline from status ${state.status}` };
      }
      return {
        ok: true,
        status: "declined",
        releaseHold: state.payment_intent_id != null,
      };
    }
    case "expire": {
      if (state.status !== "held") {
        return { ok: false, error: `Cannot expire from status ${state.status}` };
      }
      return {
        ok: true,
        status: "expired",
        releaseHold: state.payment_intent_id != null,
      };
    }
    case "capture": {
      if (state.status !== "accepted") {
        return { ok: false, error: `Cannot capture from status ${state.status}` };
      }
      if (!state.payment_intent_id) {
        return {
          ok: false,
          error: "Capture requires a payment intent (review-only Results have no hold)",
        };
      }
      return { ok: true, status: "captured", releaseHold: false };
    }
  }
}
