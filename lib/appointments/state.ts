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
  | { type: "cancel" }
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

/**
 * Every status a guest's appointment can still change from. Confirmed and
 * rescheduled are not the end: the guest can still cancel, or ask for another
 * time, and a rescheduled visit is still due its reminders.
 */
export const LIVE_STATUSES: readonly ReminderStatus[] = [
  "pending",
  "reminded",
  "offering_slots",
  "morning_sent",
  "confirmed",
  "rescheduled",
];

/**
 * Per action: the statuses it moves from, where it lands, and the status that
 * makes a repeat a harmless no-op (a second tap, a retried webhook).
 */
const RULES: Record<
  ReminderAction["type"],
  { from: readonly ReminderStatus[]; to: ReminderStatus; intent: SideEffectIntent; idempotentAt?: ReminderStatus }
> = {
  invalid_phone: { from: ["pending"], to: "skipped_invalid_phone", intent: "none", idempotentAt: "skipped_invalid_phone" },
  // From `rescheduled` too: a visit moved to a later day is reminded the day
  // before its new date, like any other.
  day_before_sent: { from: ["pending", "rescheduled"], to: "reminded", intent: "send_day_before", idempotentAt: "reminded" },
  confirm: { from: ["reminded", "offering_slots", "morning_sent", "rescheduled"], to: "confirmed", intent: "ack_confirm", idempotentAt: "confirmed" },
  // Again from `offering_slots` sends a fresh list; from `confirmed` or
  // `rescheduled`, the guest's plans changed after all.
  request_reschedule: { from: ["reminded", "morning_sent", "offering_slots", "confirmed", "rescheduled"], to: "offering_slots", intent: "offer_slots" },
  slot_picked: { from: ["offering_slots"], to: "rescheduled", intent: "confirm_reschedule", idempotentAt: "rescheduled" },
  slots_rejected: { from: ["offering_slots"], to: "cancelled", intent: "cancel_and_rebook", idempotentAt: "cancelled" },
  // The guest typed "cancel", declined the invite, or the event left the
  // calendar — whoever removed it, the guest hears it is off.
  cancel: { from: LIVE_STATUSES, to: "cancelled", intent: "cancel_and_rebook", idempotentAt: "cancelled" },
  // From `pending` too: a guest the day-before never reached (it failed, or
  // they booked after that day's run) gets the morning-of as a catch-up.
  morning_of_sent: { from: ["reminded", "pending", "rescheduled"], to: "morning_sent", intent: "send_morning_of", idempotentAt: "morning_sent" },
};

export function transitionReminder(
  status: ReminderStatus,
  action: ReminderAction,
): TransitionResult {
  const rule = RULES[action.type];
  if (!rule) {
    return { ok: false, status, noop: true, intent: "none", error: "unknown action" };
  }
  if (rule.idempotentAt === status) {
    return { ok: true, status, noop: true, intent: "none" };
  }
  if (!rule.from.includes(status)) {
    return {
      ok: false,
      status,
      noop: true,
      intent: "none",
      error: `cannot ${action.type} from ${status}`,
    };
  }
  return { ok: true, status: rule.to, noop: false, intent: rule.intent };
}

/**
 * Morning-of cron eligibility: still silent after the day-before, never reached
 * by one (`pending` on the day itself — the send failed, or the booking came in
 * after the run that would have sent it), or moved to today over WhatsApp.
 */
export function isMorningOfEligible(status: ReminderStatus): boolean {
  return RULES.morning_of_sent.from.includes(status);
}

/** Should the day-before go to a row in this status? */
export function isDayBeforeEligible(status: ReminderStatus): boolean {
  return RULES.day_before_sent.from.includes(status);
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
