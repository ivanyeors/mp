export type DraftReminderStep = "1d" | "1w" | "1m";

export type DraftReminder = {
  step: DraftReminderStep;
  afterDays: number;
  template: string;
};

export const DRAFT_REMINDERS: readonly DraftReminder[] = [
  { step: "1d", afterDays: 1, template: "results.draft_reminder_1d" },
  { step: "1w", afterDays: 7, template: "results.draft_reminder_1w" },
  { step: "1m", afterDays: 30, template: "results.draft_reminder_1m" },
];

export const LAST_REMINDER_WINDOW_DAYS = 7;

export const DRAFT_REMINDER_HORIZON_DAYS =
  DRAFT_REMINDERS[DRAFT_REMINDERS.length - 1].afterDays + LAST_REMINDER_WINDOW_DAYS;

export const DRAFT_REMINDERS_ENABLED_KEY = "draft_reminders_enabled";

export function parseDraftRemindersEnabled(value: string | null | undefined): boolean {
  if (value == null || value === "") return true;
  return value === "1" || value.toLowerCase() === "true" || value === "yes";
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function dueDraftReminder(lastSavedAt: Date, now: Date): DraftReminder | null {
  const days = (now.getTime() - lastSavedAt.getTime()) / DAY_MS;
  for (let i = DRAFT_REMINDERS.length - 1; i >= 0; i -= 1) {
    const reminder = DRAFT_REMINDERS[i];
    if (days < reminder.afterDays) continue;
    const closes = DRAFT_REMINDERS[i + 1]?.afterDays ?? reminder.afterDays + LAST_REMINDER_WINDOW_DAYS;
    return days < closes ? reminder : null;
  }
  return null;
}

export type DraftReminderRow = {
  id: string;
  status: string | null;
  product_type: string | null;
  source: string | null;
  measured_by_type: string | null;
  customer_email: string | null;
  access_token: string | null;
  data: unknown;
  created_at: string;
  updated_at: string;
};

export const DRAFT_REMINDER_SELECT =
  "id, status, product_type, source, measured_by_type, customer_email, access_token, data, created_at, updated_at";

export function isGuestDraft(row: DraftReminderRow): boolean {
  const data = row.data && typeof row.data === "object" && !Array.isArray(row.data) ? (row.data as Record<string, unknown>) : {};
  return (
    row.status == null &&
    (row.product_type ?? "pillow") === "pillow" &&
    row.source !== "staff_assisted" &&
    row.measured_by_type !== "staff" &&
    (data.configurator === "full" || data.configurator === "basic") &&
    Boolean(row.customer_email?.trim()) &&
    Boolean(row.access_token)
  );
}

export const emailKey = (email: string) => email.trim().toLowerCase();

export type DraftReminderSkip =
  | "older_draft"
  | "not_due"
  | "already_sent"
  | "went_on_to_buy"
  | "no_marketing_consent"
  | "suppressed"
  | "not_allowed_outside_production";

export type PlannedDraftReminder = {
  draft: DraftReminderRow;
  email: string;
  customerId: string;
  reminder: DraftReminder;
};

export function emptyDraftReminderSkips(): Record<DraftReminderSkip, number> {
  return {
    older_draft: 0,
    not_due: 0,
    already_sent: 0,
    went_on_to_buy: 0,
    no_marketing_consent: 0,
    suppressed: 0,
    not_allowed_outside_production: 0,
  };
}

export function planDraftReminders(input: {
  drafts: readonly DraftReminderRow[];
  resultStartedByEmail: ReadonlyMap<string, string>;
  customersByEmail: ReadonlyMap<string, { id: string; marketing_email: string | null }>;
  sentByDraft: ReadonlyMap<string, ReadonlySet<string>>;
  suppressed?: ReadonlySet<string>;
  now: Date;
  allowed: (email: string) => boolean;
}): { planned: PlannedDraftReminder[]; skipped: Record<DraftReminderSkip, number> } {
  const skipped = emptyDraftReminderSkips();

  const latest = new Map<string, DraftReminderRow>();
  for (const draft of input.drafts) {
    if (!isGuestDraft(draft)) continue;
    const key = emailKey(draft.customer_email!);
    const held = latest.get(key);
    if (!held) {
      latest.set(key, draft);
      continue;
    }
    skipped.older_draft += 1;
    if (Date.parse(draft.updated_at) > Date.parse(held.updated_at)) latest.set(key, draft);
  }

  const planned: PlannedDraftReminder[] = [];
  for (const [email, draft] of latest) {
    const reminder = dueDraftReminder(new Date(draft.updated_at), input.now);
    if (!reminder) {
      skipped.not_due += 1;
      continue;
    }
    const sent = input.sentByDraft.get(draft.id);
    const at = DRAFT_REMINDERS.findIndex((r) => r.step === reminder.step);
    if (sent && DRAFT_REMINDERS.slice(at).some((r) => sent.has(r.template))) {
      skipped.already_sent += 1;
      continue;
    }
    const resultStarted = input.resultStartedByEmail.get(email);
    if (resultStarted && Date.parse(resultStarted) >= Date.parse(draft.created_at)) {
      skipped.went_on_to_buy += 1;
      continue;
    }
    const customer = input.customersByEmail.get(email);
    if (!customer || customer.marketing_email !== "subscribed") {
      skipped.no_marketing_consent += 1;
      continue;
    }
    if (input.suppressed?.has(customer.id)) {
      skipped.suppressed += 1;
      continue;
    }
    if (!input.allowed(email)) {
      skipped.not_allowed_outside_production += 1;
      continue;
    }
    planned.push({ draft, email, customerId: customer.id, reminder });
  }
  planned.sort((a, b) => Date.parse(a.draft.updated_at) - Date.parse(b.draft.updated_at));
  return { planned, skipped };
}
