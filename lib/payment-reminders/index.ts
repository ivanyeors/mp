export type PaymentReminderSettings = {
  enabled: boolean;
  firstDelayDays: number;
  intervalDays: number;
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

function parseDays(v: string | undefined, fallback: number): number {
  if (v == null || v === "") return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

function parseCount(v: string | undefined, fallback: number): number {
  if (v == null || v === "") return fallback;
  const n = Number(v);
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
  assignedAt: Date;
  lastReminderAt: Date | null;
  remindersSent: number;
  notAfter?: Date | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

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

export function planPaymentReminder(
  state: PaymentReminderState,
  settings: PaymentReminderSettings,
  now: Date,
): "remind" | "none" {
  const due = nextReminderDue(state, settings);
  if (!due) return "none";
  if (state.notAfter && now.getTime() >= state.notAfter.getTime()) return "none";
  return now.getTime() >= due.getTime() ? "remind" : "none";
}
