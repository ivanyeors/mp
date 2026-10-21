import { describe, expect, it, vi } from "vitest";
import { checkupTimelineEntries, type CheckupSendRow } from "@/lib/aftercare/checkup-timeline";
import { reviewFakeDb, type ReviewFakeDb } from "./review-request-fake-db";

/**
 * Check-up reminders on the Customer timeline (CRM slice 08, through slice
 * 03's adapter registry): one entry per Order and milestone, *Check-up
 * reminder sent (email, WhatsApp)*, linking to the Order.
 */

const h = vi.hoisted(() => ({ db: {} as Record<string, Array<Record<string, unknown>>> }));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => reviewFakeDb(h.db as ReviewFakeDb) }));

const { checkupsAdapter } = await import("@/lib/crm/timeline/sources/checkups");
const { TIMELINE_ADAPTERS } = await import("@/lib/crm/timeline/registry");

const row = (over: Partial<CheckupSendRow>): CheckupSendRow => ({
  channel: "email",
  template: "aftercare.checkup_12m",
  entity_id: "o1",
  status: "sent",
  sent_at: "2026-10-21T02:00:01.000Z",
  created_at: "2026-10-21T02:00:00.000Z",
  ...over,
});

describe("checkupTimelineEntries", () => {
  it("is one entry per Order and milestone, naming the channels that delivered, at the earlier send", () => {
    expect(
      checkupTimelineEntries([
        row({ channel: "whatsapp", sent_at: "2026-10-21T02:00:03.000Z" }),
        row({}),
        row({ entity_id: "o1", template: "aftercare.checkup_24m", sent_at: "2027-10-21T02:00:01.000Z" }),
      ]),
    ).toEqual([
      {
        id: "checkup.sent:o1:24",
        at: "2027-10-21T02:00:01.000Z",
        kind: "checkup.sent",
        ref: { type: "order", id: "o1", href: "/settings/orders/o1" },
        summary: "Check-up reminder sent (email)",
        detail: "2 years after delivery",
      },
      {
        id: "checkup.sent:o1:12",
        at: "2026-10-21T02:00:01.000Z",
        kind: "checkup.sent",
        ref: { type: "order", id: "o1", href: "/settings/orders/o1" },
        summary: "Check-up reminder sent (email, WhatsApp)",
        detail: "1 year after delivery",
      },
    ]);
  });

  it("leaves out a channel that failed, and says so when nothing was delivered yet", () => {
    expect(checkupTimelineEntries([row({}), row({ channel: "whatsapp", status: "failed", sent_at: null })])[0].summary).toBe(
      "Check-up reminder sent (email)",
    );
    const [pending] = checkupTimelineEntries([row({ status: "failed", sent_at: null })]);
    expect(pending).toMatchObject({ at: "2026-10-21T02:00:00.000Z", summary: "Check-up reminder not delivered yet" });
  });

  it("ignores any other template, and names an odd period in months", () => {
    expect(checkupTimelineEntries([row({ template: "aftercare.review_request" })])).toEqual([]);
    expect(checkupTimelineEntries([row({ template: "aftercare.checkup_18m" })])[0].detail).toBe("18 months after delivery");
  });
});

describe("the check-ups adapter", () => {
  it("is registered under Aftercare, for customers", () => {
    expect(TIMELINE_ADAPTERS).toContain(checkupsAdapter);
    expect(checkupsAdapter).toMatchObject({ permission: "customers", group: { key: "aftercare" } });
  });

  it("reads this Customer's check-ups in both ledgers only, and keeps entries at or before the cursor", async () => {
    h.db = {
      customer_emails: [
        { customer_id: "ann", template: "aftercare.checkup_12m", entity_id: "o1", status: "sent", sent_at: "2026-10-21T02:00:01.000Z", created_at: "2026-10-21T02:00:00.000Z" },
        // Not a check-up, and not Ann's.
        { customer_id: "ann", template: "aftercare.review_request", entity_id: "ann", status: "sent", sent_at: "2026-10-01T00:00:00.000Z", created_at: "2026-10-01T00:00:00.000Z" },
        { customer_id: "ben", template: "aftercare.checkup_12m", entity_id: "o2", status: "sent", sent_at: "2026-10-21T02:00:01.000Z", created_at: "2026-10-21T02:00:00.000Z" },
      ],
      customer_whatsapp: [
        { customer_id: "ann", template: "aftercare.checkup_24m", entity_id: "o0", status: "sent", sent_at: "2026-09-01T02:00:00.000Z", created_at: "2026-09-01T02:00:00.000Z" },
      ],
    };
    const ann = { id: "ann", email: "ann@x.test" };
    const all = await checkupsAdapter.load(ann, null, 50);
    expect(all.floor).toBeNull();
    expect(all.entries.map((e) => e.id)).toEqual(["checkup.sent:o1:12", "checkup.sent:o0:24"]);
    expect((await checkupsAdapter.load(ann, "2026-10-01T00:00:00.000Z", 50)).entries.map((e) => e.id)).toEqual([
      "checkup.sent:o0:24",
    ]);
    expect(await checkupsAdapter.load({ id: "cat", email: null }, null, 50)).toEqual({ entries: [], floor: null });
  });
});
