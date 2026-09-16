/**
 * Customer-facing payment reminders for an assigned Result (ADR 0016 balance).
 *
 * Deliberately its own module rather than more fields on `SlaSettings`. The SLA
 * settings answer "how long may an operator sit on a submission" and drive
 * Telegram and the ops inbox; these answer "how often do we chase a customer who
 * has been quoted a price". They were one setting and one `last_reminder_at`
 * column until now, which meant the first customer chase could arrive a whole
 * operator-interval late and neither cadence could move without the other.
 *
 * Pure and dependency-free, like `lib/sla-reminders`, so the schedule can be
 * unit-tested over plain objects instead of through the cron.
 */

export type PaymentReminderSettings = {
  /** Master switch. Off means the cron never mails a balance-due nudge. */
  enabled: boolean;
  /** Days after the build was assigned before the FIRST reminder. */
  firstDelayDays: number;
  /** Days between subsequent reminders. */
  intervalDays: number;
  /**
   * Stop after this many. A customer who has ignored three emails is a phone
   * call, not a fourth email, and an uncapped loop would mail them forever —
   * an assigned Result with no hold has nothing that expires it.
   */
  maxReminders: number;
};

export const DEFAULT_PAYMENT_REMINDER_SETTINGS: PaymentReminderSettings = {
  enabled: true,
  firstDelayDays: 3,
  intervalDays: 3,
  maxReminders: 3,
};

export const PAYMENT_REMINDER_SETTING_KEYS = [
  "results_payment_reminder_enabled",
  "results_payment_reminder_first_days",
  "results_payment_reminder_interval_days",
  "results_payment_reminder_max",
] as const;

function parseBool(v: string | undefined, fallback: boolean): boolean {
  if (v == null || v === "") return fallback;
  return v === "1" || v.toLowerCase() === "true" || v === "yes";
}

/** Non-negative: a 0-day first delay means "chase on the next tick". */
function parseDays(v: string | undefined, fallback: number): number {
  if (v == null || v === "") return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

function parseCount(v: string | undefined, fallback: number): number {
  if (v == null || v === "") return fallback;
  const n = Number(v);
  // 0 is meaningful — "never chase" without flipping the master switch.
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

export function parsePaymentReminderSettings(
  stored: Record<string, string>,
): PaymentReminderSettings {
  const d = DEFAULT_PAYMENT_REMINDER_SETTINGS;
  return {
    enabled: parseBool(stored.results_payment_reminder_enabled, d.enabled),
    firstDelayDays: parseDays(
      stored.results_payment_reminder_first_days,
      d.firstDelayDays,
    ),
    intervalDays: Math.max(
      1,
      parseDays(stored.results_payment_reminder_interval_days, d.intervalDays),
    ),
    maxReminders: parseCount(stored.results_payment_reminder_max, d.maxReminders),
  };
}

export function paymentReminderSettingsToStored(
  s: PaymentReminderSettings,
): Record<string, string> {
  return {
    results_payment_reminder_enabled: s.enabled ? "true" : "false",
    results_payment_reminder_first_days: String(s.firstDelayDays),
    results_payment_reminder_interval_days: String(s.intervalDays),
    results_payment_reminder_max: String(s.maxReminders),
  };
}

export type PaymentReminderState = {
  /** When the operator assigned the build. Falls back to created_at for old rows. */
  assignedAt: Date;
  /** Last balance-due email, or null if none has gone out yet. */
  lastReminderAt: Date | null;
  /** How many have gone out. */
  remindersSent: number;
  /**
   * Hard stop, or null when there is none.
   *
   * For a Result backed by an Authorization hold this is when that hold dies.
   * Past it, "review and pay — nothing charged yet" is a false promise: Accept
   * captures the hold, and capturing a dead one 502s. Nothing expires an
   * ASSIGNED row (the SLA force-expire only covers `held`), so the schedule has
   * to know to stop on its own.
   */
  notAfter?: Date | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** When the next reminder is due, or null when the schedule is finished. */
export function nextReminderDue(
  state: PaymentReminderState,
  settings: PaymentReminderSettings,
): Date | null {
  if (!settings.enabled) return null;
  if (state.remindersSent >= settings.maxReminders) return null;
  const anchor = state.lastReminderAt ?? state.assignedAt;
  const days = state.lastReminderAt ? settings.intervalDays : settings.firstDelayDays;
  const due = new Date(anchor.getTime() + days * DAY_MS);
  if (state.notAfter && due.getTime() >= state.notAfter.getTime()) return null;
  return due;
}

/**
 * One tick of the schedule.
 *
 * The cron runs daily, so "due" is generous by design: a reminder that came due
 * at any point before `now` is sent on this tick rather than skipped.
 */
export function planPaymentReminder(
  state: PaymentReminderState,
  settings: PaymentReminderSettings,
  now: Date,
): "remind" | "none" {
  const due = nextReminderDue(state, settings);
  if (!due) return "none";
  // Checked against `now` as well as against the due date: a cron that arrives
  // late must not send a reminder that came due while the hold was alive but is
  // being acted on after it died.
  if (state.notAfter && now.getTime() >= state.notAfter.getTime()) return "none";
  return now.getTime() >= due.getTime() ? "remind" : "none";
}
