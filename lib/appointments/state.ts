/** Pure reminder state machine — no I/O. */

import { addSgtDays, sgtParts } from "./slots";

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
      // From `pending` too: a guest the day-before never reached (it failed, or
      // they booked after that day's run) gets the morning-of as a catch-up.
      if (status !== "reminded" && status !== "pending") {
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

/**
 * Morning-of cron eligibility: still silent after the day-before, or never
 * reached by one (`pending` on the day itself — the send failed, or the booking
 * came in after the run that would have sent it).
 */
export function isMorningOfEligible(status: ReminderStatus): boolean {
  return status === "reminded" || status === "pending";
}

/**
 * The SGT hour the daily reminders run fires: vercel.json `0 1 * * *` is 01:00
 * UTC. Hobby crons land anywhere inside that hour, which is fine here — see
 * missedReminder.
 */
export const REMINDER_RUN_HOUR_SGT = 9;

/**
 * Which reminder a booking made at `nowMs` would never get from the daily run,
 * so the booking path has to send it itself:
 *
 *   - same day → "morning_of". If today's run is past it never sees this event;
 *     if not, it finds the row already sent and skips it.
 *   - tomorrow, booked at or after the run hour → "day_before". Today's run
 *     already listed tomorrow, and tomorrow's run treats it as today.
 *   - otherwise null, and a later run sends the day-before as usual.
 *
 * Hobby fires inside the hour, never before it, so a booking for tomorrow made
 * before the hour is always still ahead of today's run.
 */
export function missedReminder(
  startMs: number,
  nowMs: number,
): "day_before" | "morning_of" | null {
  if (!(startMs > nowMs)) return null;
  const s = sgtParts(startMs);
  const n = sgtParts(nowMs);
  if (s.y === n.y && s.m === n.m && s.d === n.d) return "morning_of";
  const t = addSgtDays(n.y, n.m, n.d, 1);
  const tomorrow = s.y === t.y && s.m === t.m && s.d === t.d;
  return tomorrow && n.hour >= REMINDER_RUN_HOUR_SGT ? "day_before" : null;
}
