/** Pure reminder state machine — no I/O. */

export type ReminderStatus =
  | "pending"
  | "reminded"
  | "confirmed"
  | "offering_slots"
  | "rescheduled"
  | "cancelled"
  | "morning_sent"
  | "skipped_invalid_phone";

export type ReminderAction =
  | { type: "invalid_phone" }
  | { type: "day_before_sent" }
  | { type: "confirm" }
  | { type: "request_reschedule" }
  | { type: "slot_picked" }
  | { type: "slots_rejected" }
  | { type: "morning_of_sent" };

export type SideEffectIntent =
  | "none"
  | "send_day_before"
  | "send_morning_of"
  | "offer_slots"
  | "confirm_reschedule"
  | "cancel_and_rebook"
  | "ack_confirm";

export type TransitionResult = {
  ok: boolean;
  status: ReminderStatus;
  /** True when status did not change (duplicate / illegal). */
  noop: boolean;
  intent: SideEffectIntent;
  error?: string;
};

const TERMINAL: ReminderStatus[] = [
  "confirmed",
  "rescheduled",
  "cancelled",
  "skipped_invalid_phone",
];

export function transitionReminder(
  status: ReminderStatus,
  action: ReminderAction,
): TransitionResult {
  // Idempotent confirms / cancels on terminal states
  if (action.type === "confirm" && status === "confirmed") {
    return { ok: true, status, noop: true, intent: "none" };
  }
  if (action.type === "slots_rejected" && status === "cancelled") {
    return { ok: true, status, noop: true, intent: "none" };
  }
  if (action.type === "slot_picked" && status === "rescheduled") {
    return { ok: true, status, noop: true, intent: "none" };
  }
  if (action.type === "morning_of_sent" && status === "morning_sent") {
    return { ok: true, status, noop: true, intent: "none" };
  }
  if (action.type === "day_before_sent" && status === "reminded") {
    return { ok: true, status, noop: true, intent: "none" };
  }

  if (TERMINAL.includes(status) && action.type !== "invalid_phone") {
    return {
      ok: false,
      status,
      noop: true,
      intent: "none",
      error: `cannot ${action.type} from ${status}`,
    };
  }

  switch (action.type) {
    case "invalid_phone":
      if (status !== "pending" && status !== "skipped_invalid_phone") {
        return {
          ok: false,
          status,
          noop: true,
          intent: "none",
          error: `cannot mark invalid phone from ${status}`,
        };
      }
      return {
        ok: true,
        status: "skipped_invalid_phone",
        noop: status === "skipped_invalid_phone",
        intent: "none",
      };

    case "day_before_sent":
      if (status !== "pending") {
        return {
          ok: false,
          status,
          noop: true,
          intent: "none",
          error: `cannot day_before_sent from ${status}`,
        };
      }
      return { ok: true, status: "reminded", noop: false, intent: "send_day_before" };

    case "confirm":
      if (status !== "reminded" && status !== "offering_slots" && status !== "morning_sent") {
        return {
          ok: false,
          status,
          noop: true,
          intent: "none",
          error: `cannot confirm from ${status}`,
        };
      }
      return { ok: true, status: "confirmed", noop: false, intent: "ack_confirm" };

    case "request_reschedule":
      if (status !== "reminded" && status !== "morning_sent") {
        return {
          ok: false,
          status,
          noop: true,
          intent: "none",
          error: `cannot request_reschedule from ${status}`,
        };
      }
      return {
        ok: true,
        status: "offering_slots",
        noop: false,
        intent: "offer_slots",
      };

    case "slot_picked":
      if (status !== "offering_slots") {
        return {
          ok: false,
          status,
          noop: true,
          intent: "none",
          error: `cannot slot_picked from ${status}`,
        };
      }
      return {
        ok: true,
        status: "rescheduled",
        noop: false,
        intent: "confirm_reschedule",
      };

    case "slots_rejected":
      if (status !== "offering_slots") {
        return {
          ok: false,
          status,
          noop: true,
          intent: "none",
          error: `cannot slots_rejected from ${status}`,
        };
      }
      return {
        ok: true,
        status: "cancelled",
        noop: false,
        intent: "cancel_and_rebook",
      };

    case "morning_of_sent":
      if (status !== "reminded") {
        return {
          ok: false,
          status,
          noop: true,
          intent: "none",
          error: `cannot morning_of_sent from ${status}`,
        };
      }
      return {
        ok: true,
        status: "morning_sent",
        noop: false,
        intent: "send_morning_of",
      };

    default:
      return {
        ok: false,
        status,
        noop: true,
        intent: "none",
        error: "unknown action",
      };
  }
}

/** Morning-of cron eligibility: still silent after day-before. */
export function isMorningOfEligible(status: ReminderStatus): boolean {
  return status === "reminded";
}
