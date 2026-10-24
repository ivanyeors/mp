import { describe, expect, it, vi } from "vitest";
import { reviewRequestTimelineEntries } from "@/lib/aftercare/review-request-timeline";
import { reviewFakeDb, type ReviewFakeDb } from "./review-request-fake-db";

/**
 * The Review request on the Customer timeline (CRM slice 07, through slice
 * 03's adapter registry): *Review requested (email, WhatsApp)*, then *Review
 * link clicked*. The route test (timeline-route.test.ts) shows it merged with
 * every other source and gated by `customers`.
 */

const h = vi.hoisted(() => ({ db: {} as Record<string, Array<Record<string, unknown>>> }));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => reviewFakeDb(h.db as ReviewFakeDb) }));

const { reviewRequestsAdapter } = await import("@/lib/crm/timeline/sources/review-requests");
const { TIMELINE_ADAPTERS } = await import("@/lib/crm/timeline/registry");

const request = {
  customer_id: "ann",
  created_at: "2026-10-20T02:00:00.000Z",
  first_clicked_at: null as string | null,
  click_count: 0,
};

describe("reviewRequestTimelineEntries", () => {
  it("is empty for a Customer never asked", () => {
    expect(reviewRequestTimelineEntries({ request: null, sends: [] })).toEqual([]);
  });

  it("names the channels that delivered, at the earlier send", () => {
    expect(
      reviewRequestTimelineEntries({
        request,
        sends: [
          { channel: "whatsapp", status: "sent", sent_at: "2026-10-20T02:00:03.000Z" },
          { channel: "email", status: "sent", sent_at: "2026-10-20T02:00:01.000Z" },
        ],
      }),
    ).toEqual([
      {
        id: "review_request.sent:ann",
        at: "2026-10-20T02:00:01.000Z",
        kind: "review_request.sent",
        ref: { type: "review_request", id: "ann" },
        summary: "Review requested (email, WhatsApp)",
      },
    ]);
  });

  it("leaves out a channel that failed", () => {
    const [entry] = reviewRequestTimelineEntries({
      request,
      sends: [
        { channel: "email", status: "sent", sent_at: "2026-10-20T02:00:01.000Z" },
        { channel: "whatsapp", status: "failed", sent_at: null },
      ],
    });
    expect(entry.summary).toBe("Review requested (email)");
  });

  it("says so when nothing was delivered yet", () => {
    const [entry] = reviewRequestTimelineEntries({ request, sends: [{ channel: "email", status: "failed", sent_at: null }] });
    expect(entry).toMatchObject({ at: request.created_at, summary: "Review request not delivered yet" });
  });

  it("adds the click, newest first, with the count when there were several", () => {
    const clicked = { ...request, first_clicked_at: "2026-10-21T09:00:00+00:00", click_count: 3 };
    const entries = reviewRequestTimelineEntries({
      request: clicked,
      sends: [{ channel: "email", status: "sent", sent_at: "2026-10-20T02:00:01.000Z" }],
    });
    expect(entries.map((e) => [e.id, e.summary])).toEqual([
      ["review_request.clicked:ann", "Review link clicked (3 times)"],
      ["review_request.sent:ann", "Review requested (email)"],
    ]);
    const once = reviewRequestTimelineEntries({ request: { ...clicked, click_count: 1 }, sends: [] });
    expect(once.find((e) => e.kind === "review_request.clicked")!.summary).toBe("Review link clicked");
  });
});

describe("the review requests adapter", () => {
  it("is registered under Reviews, for customers", () => {
    expect(TIMELINE_ADAPTERS).toContain(reviewRequestsAdapter);
    expect(reviewRequestsAdapter).toMatchObject({ permission: "customers", group: { key: "reviews" } });
  });

  it("reads this Customer's request and its ledgers only, and keeps entries at or before the cursor", async () => {
    h.db = {
      customer_review_requests: [
        { ...request, token_hash: "h", order_id: "o1", first_clicked_at: "2026-10-22T01:00:00.000Z", click_count: 1 },
      ],
      customer_emails: [
        { customer_id: "ann", template: "aftercare.review_request", entity_id: "ann", status: "sent", sent_at: "2026-10-20T02:00:01.000Z" },
        // Another email to the same Customer is not this adapter's.
        { customer_id: "ann", template: "account.claim_bonus", entity_id: "ann", status: "sent", sent_at: "2026-10-01T00:00:00.000Z" },
      ],
      customer_whatsapp: [],
    };
    const ann = { id: "ann", email: "ann@x.test" };
    const all = await reviewRequestsAdapter.load(ann, null, 50);
    expect(all.floor).toBeNull();
    expect(all.entries.map((e) => e.summary)).toEqual(["Review link clicked", "Review requested (email)"]);
    expect((await reviewRequestsAdapter.load(ann, "2026-10-21T00:00:00.000Z", 50)).entries).toHaveLength(1);
    expect(await reviewRequestsAdapter.load({ id: "ben", email: null }, null, 50)).toEqual({ entries: [], floor: null });
  });
});
