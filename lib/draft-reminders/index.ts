/**
 * Reminders to a guest who stopped customising (ADR 0050): 1 day, 1 week and
 * 1 month after they last saved their Draft Result, then no more (owner,
 * 2026-11-08). Each carries the Draft's continue link.
 *
 * The pure half: which Drafts are owed which reminder today. The IO is
 * ./server.ts, chained onto the daily `results-sla` cron.
 *
 * - **Who.** A guest's own Draft: the email came from the configurator's first
 *   question (ADR 0049, recorded with `data.configurator`), it is an Mpillow,
 *   no Staff member measured it or sent its Assist link (Staff follow those up
 *   themselves), and it has an access token for the link. One per email: the
 *   one they saved last.
 * - **Consent.** Only to a Customer whose `marketing_email` is `subscribed`:
 *   the box beside the email on the first question, ticked by default. The
 *   reminder is about something they started, not bought, so it is treated as
 *   marketing, as the Check-up reminder is (lib/aftercare/checkup.ts). Their
 *   Unsubscribe link stops it with the rest, and an address a campaign bounced
 *   from, or that reported one as spam, gets none (as `marketing_campaign_blocker`).
 * - **When.** Counted from the Draft's last save (`updated_at`), so a guest who
 *   comes back and stops again is reminded from then. Each reminder has a
 *   window, which closes when the next one opens: a day the job did not run
 *   never makes two arrive together, and a Draft older than the last window
 *   (37 days) is never written to.
 * - **Stop.** After the 1-month one. Sooner when the Draft is held or paid
 *   (it is no longer a Draft), when they started a Result that was since
 *   held or paid, or when they unsubscribe.
 */

export type DraftReminderStep = "1d" | "1w" | "1m";

export type DraftReminder = {
  step: DraftReminderStep;
  /** Days after the last save the reminder becomes due. */
  afterDays: number;
  /** `customer_emails.template`, which is also the registry id (lib/email/registry.ts). */
  template: string;
};

export const DRAFT_REMINDERS: readonly DraftReminder[] = [
  { step: "1d", afterDays: 1, template: "results.draft_reminder_1d" },
  { step: "1w", afterDays: 7, template: "results.draft_reminder_1w" },
  { step: "1m", afterDays: 30, template: "results.draft_reminder_1m" },
];

/** How long the last reminder stays due once it is. */
export const LAST_REMINDER_WINDOW_DAYS = 7;

/** No Draft saved longer ago than this is read: every window has closed. */
export const DRAFT_REMINDER_HORIZON_DAYS =
  DRAFT_REMINDERS[DRAFT_REMINDERS.length - 1].afterDays + LAST_REMINDER_WINDOW_DAYS;

/** The master switch in `site_settings`; on unless set to off. */
export const DRAFT_REMINDERS_ENABLED_KEY = "draft_reminders_enabled";

export function parseDraftRemindersEnabled(value: string | null | undefined): boolean {
  if (value == null || value === "") return true;
  return value === "1" || value.toLowerCase() === "true" || value === "yes";
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The reminder whose window `now` falls in, counted from the last save; null outside every window. */
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

/** The `mp_config_responses` columns the job reads. */
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

/** A guest's own Draft, with what its link needs. */
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

/**
 * Today's reminders. `drafts` may hold anything the job read; only guest
 * Drafts are considered, and of those one per email.
 */
export function planDraftReminders(input: {
  drafts: readonly DraftReminderRow[];
  /** Per email: when its latest held, paid or submitted Result was started. */
  resultStartedByEmail: ReadonlyMap<string, string>;
  /** Per email: the Customer, for consent and the ledger. */
  customersByEmail: ReadonlyMap<string, { id: string; marketing_email: string | null }>;
  /** Per Draft: the reminder templates already sent, or being sent. */
  sentByDraft: ReadonlyMap<string, ReadonlySet<string>>;
  /** Customers an email bounced from or who reported one as spam. */
  suppressed?: ReadonlySet<string>;
  now: Date;
  /** Outside production, only allowlisted addresses (lib/aftercare/channels.ts). */
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
    // This one, or a later one, already went: never send an earlier one after.
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
  // Oldest save first, so a capped run reaches the longest-waiting guest.
  planned.sort((a, b) => Date.parse(a.draft.updated_at) - Date.parse(b.draft.updated_at));
  return { planned, skipped };
}
