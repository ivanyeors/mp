export const STRIPE_AUTH_HOLD_DAYS = 7;

export type SlaSettings = {
  workingDays: number;
  reminderIntervalDays: number;
  remindTelegram: boolean;
  remindEmail: boolean;
  opsEmail: string | null;
  authExpiryBufferHours: number;
  authHoldEnabled: boolean;
};

export const DEFAULT_SLA_SETTINGS: SlaSettings = {
  workingDays: 5,
  reminderIntervalDays: 1,
  remindTelegram: true,
  remindEmail: true,
  opsEmail: null,
  // ponytail: 48h so a once-daily Hobby cron (max ~25h lag) still beats Stripe's 7d auth.
  authExpiryBufferHours: 48,
  authHoldEnabled: true,
};

export const SLA_SETTING_KEYS = [
  "results_sla_working_days",
  "results_sla_reminder_interval_days",
  "results_sla_remind_telegram",
  "results_sla_remind_email",
  "results_sla_ops_email",
  "results_sla_auth_expiry_buffer_hours",
  "results_auth_hold_enabled",
] as const;

function parseBool(v: string | undefined, fallback: boolean): boolean {
  if (v == null || v === "") return fallback;
  return v === "1" || v.toLowerCase() === "true" || v === "yes";
}

function parsePositiveInt(v: string | undefined, fallback: number): number {
  if (v == null || v === "") return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}

export function parseSlaSettings(stored: Record<string, string>): SlaSettings {
  const d = DEFAULT_SLA_SETTINGS;
  const ops = stored.results_sla_ops_email?.trim();
  return {
    workingDays: parsePositiveInt(stored.results_sla_working_days, d.workingDays),
    reminderIntervalDays: parsePositiveInt(
      stored.results_sla_reminder_interval_days,
      d.reminderIntervalDays,
    ),
    remindTelegram: parseBool(stored.results_sla_remind_telegram, d.remindTelegram),
    remindEmail: parseBool(stored.results_sla_remind_email, d.remindEmail),
    opsEmail: ops || null,
    authExpiryBufferHours: parsePositiveInt(
      stored.results_sla_auth_expiry_buffer_hours,
      d.authExpiryBufferHours,
    ),
    authHoldEnabled: parseBool(stored.results_auth_hold_enabled, d.authHoldEnabled),
  };
}

export function slaSettingsToStored(s: SlaSettings): Record<string, string> {
  return {
    results_sla_working_days: String(s.workingDays),
    results_sla_reminder_interval_days: String(s.reminderIntervalDays),
    results_sla_remind_telegram: s.remindTelegram ? "true" : "false",
    results_sla_remind_email: s.remindEmail ? "true" : "false",
    results_sla_ops_email: s.opsEmail ?? "",
    results_sla_auth_expiry_buffer_hours: String(s.authExpiryBufferHours),
    results_auth_hold_enabled: s.authHoldEnabled ? "true" : "false",
  };
}

export function addWorkingDays(from: Date, days: number): Date {
  if (days < 1) return new Date(from.getTime());
  const d = new Date(from.getTime());
  let left = days;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) left -= 1;
  }
  return d;
}

export function authExpiresAt(heldAt: Date): Date {
  return new Date(heldAt.getTime() + STRIPE_AUTH_HOLD_DAYS * 24 * 60 * 60 * 1000);
}

export function expiryDeadline(heldAt: Date, settings: SlaSettings): Date {
  const sla = addWorkingDays(heldAt, settings.workingDays);
  const authCut =
    authExpiresAt(heldAt).getTime() - settings.authExpiryBufferHours * 60 * 60 * 1000;
  return new Date(Math.min(sla.getTime(), authCut));
}

export type HeldResultTick = {
  id: string;
  heldAt: Date;
  lastReminderAt: Date | null;
};

export type TickAction = "expire" | "remind" | "none";

export function planHeldTick(
  row: HeldResultTick,
  settings: SlaSettings,
  now: Date = new Date(),
  hasHold = true,
): TickAction {
  if (hasHold && now.getTime() >= expiryDeadline(row.heldAt, settings).getTime()) {
    return "expire";
  }

  const anyChannel =
    settings.remindTelegram || (settings.remindEmail && Boolean(settings.opsEmail));
  if (!anyChannel) return "none";

  const intervalMs = settings.reminderIntervalDays * 24 * 60 * 60 * 1000;
  const last = row.lastReminderAt?.getTime() ?? row.heldAt.getTime();
  if (now.getTime() - last >= intervalMs) return "remind";
  return "none";
}
