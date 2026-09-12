/** Legal Result status transitions and invariants. */

export type ResultStatus =
  | "held"
  | "assigned"
  | "accepted"
  | "declined"
  | "expired"
  | "captured"
  | "cancelled";

export type ResultState = {
  status: ResultStatus;
  filling_template_id: number | null;
  /**
   * Null when no Authorization hold was taken — an Assisted customisation, or an
   * in-store measurement. Those Results are not unsellable: they settle by
   * Balance payment at Accept (ADR 0016).
   */
  payment_intent_id: string | null;
  /**
   * Whether a Balance payment has actually been paid (`topup_paid_at` is set).
   * Only `capture` reads it, and only when there is no hold to capture.
   */
  balance_paid?: boolean;
};

export type Transition =
  | { action: "assign"; filling_template_id: number }
  | { action: "accept" }
  | { action: "decline" }
  | { action: "expire" }
  | { action: "capture" }
  | { action: "cancel" };

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
      // Deliberately no payment-intent check. It looks symmetrical with the one
      // in `capture` and is not: `assigned` is reachable only through Staff
      // assignment with a confirmed Filling Template, so a hold guard here
      // refuses nothing that assign has not already refused. And for a Result
      // with no hold, Accept is the step that *creates* the Balance payment
      // Checkout — it has to run before any money exists (ADR 0016).
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
      // The one guard standing between this system and an Order with no money
      // behind it. Since `accept` dropped its own check, nothing else asserts
      // that a customer actually paid. Money arrives one of two ways: a captured
      // Authorization hold, or a paid Balance payment. Requiring one of them is
      // not a style choice — do not "simplify" it away (ADR 0016).
      if (!state.payment_intent_id && !state.balance_paid) {
        return {
          ok: false,
          error:
            "Capture requires a captured hold or a paid Balance payment — this Result has neither",
        };
      }
      return { ok: true, status: "captured", releaseHold: false };
    }
    case "cancel": {
      // Staff void. Legal from both open states: the SLA cron only expires `held`,
      // so an `assigned` Result whose customer goes quiet is otherwise unreachable
      // by any human. Terminal states stay terminal.
      if (state.status !== "held" && state.status !== "assigned") {
        return { ok: false, error: `Cannot cancel from status ${state.status}` };
      }
      return {
        ok: true,
        status: "cancelled",
        releaseHold: state.payment_intent_id != null,
      };
    }
  }
}
