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
  noop: boolean;
  intent: SideEffectIntent;
  error?: string;
};

export const LIVE_STATUSES: readonly ReminderStatus[] = [
  "pending",
  "reminded",
  "offering_slots",
  "morning_sent",
  "confirmed",
  "rescheduled",
];

const RULES: Record<
  ReminderAction["type"],
  { from: readonly ReminderStatus[]; to: ReminderStatus; intent: SideEffectIntent; idempotentAt?: ReminderStatus }
> = {
  invalid_phone: { from: ["pending"], to: "skipped_invalid_phone", intent: "none", idempotentAt: "skipped_invalid_phone" },
  day_before_sent: { from: ["pending", "rescheduled"], to: "reminded", intent: "send_day_before", idempotentAt: "reminded" },
  confirm: { from: ["reminded", "offering_slots", "morning_sent", "rescheduled"], to: "confirmed", intent: "ack_confirm", idempotentAt: "confirmed" },
  request_reschedule: { from: ["reminded", "morning_sent", "offering_slots", "confirmed", "rescheduled"], to: "offering_slots", intent: "offer_slots" },
  slot_picked: { from: ["offering_slots"], to: "rescheduled", intent: "confirm_reschedule", idempotentAt: "rescheduled" },
  slots_rejected: { from: ["offering_slots"], to: "cancelled", intent: "cancel_and_rebook", idempotentAt: "cancelled" },
  cancel: { from: LIVE_STATUSES, to: "cancelled", intent: "cancel_and_rebook", idempotentAt: "cancelled" },
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

export function isMorningOfEligible(status: ReminderStatus): boolean {
  return RULES.morning_of_sent.from.includes(status);
}

export function isDayBeforeEligible(status: ReminderStatus): boolean {
  return RULES.day_before_sent.from.includes(status);
}

export const REMINDER_RUN_HOUR_SGT = 9;

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
