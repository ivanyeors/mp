import { describe, expect, it } from "vitest";
import {
  DRAFT_REMINDER_HORIZON_DAYS,
  dueDraftReminder,
  isGuestDraft,
  parseDraftRemindersEnabled,
  planDraftReminders,
  type DraftReminderRow,
} from "@/lib/draft-reminders";

const NOW = new Date("2026-11-20T02:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();

function draft(over: Partial<DraftReminderRow> = {}): DraftReminderRow {
  return {
    id: "d1",
    status: null,
    product_type: "pillow",
    source: "online_customization",
    measured_by_type: "by_user",
    customer_email: "wei@example.com",
    access_token: "tok",
    data: { name: "Wei Ling", configurator: "full" },
    created_at: ago(2),
    updated_at: ago(1.5),
    ...over,
  };
}

const subscribed = new Map([["wei@example.com", { id: "c1", marketing_email: "subscribed" }]]);

function plan(over: Partial<Parameters<typeof planDraftReminders>[0]> = {}) {
  return planDraftReminders({
    drafts: [draft()],
    resultStartedByEmail: new Map(),
    customersByEmail: subscribed,
    sentByDraft: new Map(),
    now: NOW,
    allowed: () => true,
    ...over,
  });
}

describe("dueDraftReminder", () => {
  const at = (days: number) => dueDraftReminder(new Date(NOW.getTime() - days * DAY), NOW)?.step ?? null;

  it("is nothing for the first day", () => {
    expect(at(0)).toBeNull();
    expect(at(0.99)).toBeNull();
  });

  it("is each reminder in its window, which closes when the next opens", () => {
    expect(at(1)).toBe("1d");
    expect(at(6.99)).toBe("1d");
    expect(at(7)).toBe("1w");
    expect(at(29.99)).toBe("1w");
    expect(at(30)).toBe("1m");
    expect(at(36.99)).toBe("1m");
  });

  it("stops after the month's window", () => {
    expect(DRAFT_REMINDER_HORIZON_DAYS).toBe(37);
    expect(at(37)).toBeNull();
    expect(at(400)).toBeNull();
  });
});

describe("isGuestDraft", () => {
  it("is a guest's own Mpillow Draft with an email, a token and its configurator", () => {
    expect(isGuestDraft(draft())).toBe(true);
    expect(isGuestDraft(draft({ data: { configurator: "basic" } }))).toBe(true);
  });

  it.each([
    ["held", { status: "held" }],
    ["an Mbolster", { product_type: "bolster" }],
    ["sent by a Staff member's Assist link", { source: "staff_assisted" }],
    ["measured by Staff", { measured_by_type: "staff" }],
    ["started before the first question took an email", { data: { name: "Wei Ling" } }],
    ["without an email", { customer_email: " " }],
    ["without a token for the link", { access_token: null }],
  ] as const)("is not one %s", (_label, over) => {
    expect(isGuestDraft(draft(over as Partial<DraftReminderRow>))).toBe(false);
  });
});

describe("planDraftReminders", () => {
  it("plans the reminder that is due, to the Customer that consented", () => {
    const { planned } = plan();
    expect(planned).toHaveLength(1);
    expect(planned[0]).toMatchObject({ email: "wei@example.com", customerId: "c1", reminder: { step: "1d" } });
  });

  it("reminds about the Draft saved last when an email has several", () => {
    const { planned, skipped } = plan({
      drafts: [
        draft({ id: "old", updated_at: ago(8) }),
        draft({ id: "new", customer_email: "Wei@Example.com", updated_at: ago(1.2) }),
      ],
    });
    expect(planned.map((p) => p.draft.id)).toEqual(["new"]);
    expect(skipped.older_draft).toBe(1);
  });

  it("sends nothing outside every window", () => {
    expect(plan({ drafts: [draft({ updated_at: ago(0.5) })] }).skipped.not_due).toBe(1);
    expect(plan({ drafts: [draft({ updated_at: ago(40) })] }).skipped.not_due).toBe(1);
  });

  it("never sends one already sent, nor an earlier one after a later", () => {
    const sent1d = new Map([["d1", new Set(["results.draft_reminder_1d"])]]);
    expect(plan({ sentByDraft: sent1d }).skipped.already_sent).toBe(1);
    const sent1w = new Map([["d1", new Set(["results.draft_reminder_1w"])]]);
    expect(plan({ sentByDraft: sent1w }).skipped.already_sent).toBe(1);
    const week = plan({ drafts: [draft({ updated_at: ago(8) })], sentByDraft: sent1d });
    expect(week.planned[0].reminder.step).toBe("1w");
  });

  it("skips the day's reminder for a Draft first seen in the week's window", () => {
    expect(plan({ drafts: [draft({ updated_at: ago(10) })] }).planned[0].reminder.step).toBe("1w");
  });

  it("stops once a Result started since the Draft was held or paid", () => {
    const started = new Map([["wei@example.com", ago(1)]]);
    expect(plan({ resultStartedByEmail: started }).skipped.went_on_to_buy).toBe(1);
    const before = new Map([["wei@example.com", ago(90)]]);
    expect(plan({ resultStartedByEmail: before }).planned).toHaveLength(1);
  });

  it.each([["not_subscribed"], ["unsubscribed"], [null]])("sends nothing to a Customer whose consent is %s", (status) => {
    const customers = new Map([["wei@example.com", { id: "c1", marketing_email: status }]]);
    expect(plan({ customersByEmail: customers }).skipped.no_marketing_consent).toBe(1);
  });

  it("sends nothing to an address a campaign bounced from or that reported spam", () => {
    expect(plan({ suppressed: new Set(["c1"]) }).skipped.suppressed).toBe(1);
  });

  it("sends nothing to an email with no Customer", () => {
    expect(plan({ customersByEmail: new Map() }).skipped.no_marketing_consent).toBe(1);
  });

  it("sends nothing outside production to an address not allowlisted", () => {
    expect(plan({ allowed: () => false }).skipped.not_allowed_outside_production).toBe(1);
  });

  it("puts the longest-waiting guest first, so a capped run reaches them", () => {
    const customers = new Map([
      ["a@example.com", { id: "ca", marketing_email: "subscribed" }],
      ["b@example.com", { id: "cb", marketing_email: "subscribed" }],
    ]);
    const { planned } = plan({
      drafts: [
        draft({ id: "b", customer_email: "b@example.com", updated_at: ago(1.1) }),
        draft({ id: "a", customer_email: "a@example.com", updated_at: ago(3) }),
      ],
      customersByEmail: customers,
    });
    expect(planned.map((p) => p.draft.id)).toEqual(["a", "b"]);
  });
});

describe("parseDraftRemindersEnabled", () => {
  it("is on unless switched off", () => {
    expect(parseDraftRemindersEnabled(undefined)).toBe(true);
    expect(parseDraftRemindersEnabled("")).toBe(true);
    expect(parseDraftRemindersEnabled("true")).toBe(true);
    expect(parseDraftRemindersEnabled("false")).toBe(false);
  });
});
