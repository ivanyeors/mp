import { describe, expect, it } from "vitest";
import {
  loadReviewRequestTimeline,
  reviewRequestTimelineEntries,
} from "@/lib/aftercare/review-request-timeline";
import { reviewFakeDb } from "./review-request-fake-db";

/**
 * The Review request on the Customer timeline (CRM slice 07, for slice 03's
 * adapter registry): *Review requested (email, WhatsApp)*, then *Review link
 * clicked*.
 */

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
    expect(entries.map((e) => [e.kind, e.summary])).toEqual([
      ["review_request.clicked", "Review link clicked (3 times)"],
      ["review_request.sent", "Review requested (email)"],
    ]);
    const once = reviewRequestTimelineEntries({ request: { ...clicked, click_count: 1 }, sends: [] });
    expect(once.find((e) => e.kind === "review_request.clicked")!.summary).toBe("Review link clicked");
  });
});

describe("loadReviewRequestTimeline (the adapter's load)", () => {
  const db = () => ({
    customer_review_requests: [{ ...request, token_hash: "h", order_id: "o1", first_clicked_at: "2026-10-22T01:00:00.000Z", click_count: 1 }],
    customer_emails: [
      { customer_id: "ann", template: "aftercare.review_request", entity_id: "ann", status: "sent", sent_at: "2026-10-20T02:00:01.000Z" },
      // Another email to the same Customer is not this adapter's.
      { customer_id: "ann", template: "account.welcome_voucher", entity_id: "ann", status: "sent", sent_at: "2026-10-01T00:00:00.000Z" },
    ],
    customer_whatsapp: [],
  });

  it("reads this Customer's rows, and pages by `before` and `limit`", async () => {
    const admin = reviewFakeDb(db());
    expect((await loadReviewRequestTimeline(admin, { id: "ann" }, null, 50)).map((e) => e.summary)).toEqual([
      "Review link clicked",
      "Review requested (email)",
    ]);
    expect(await loadReviewRequestTimeline(admin, { id: "ann" }, "2026-10-21T00:00:00.000Z", 50)).toHaveLength(1);
    expect(await loadReviewRequestTimeline(admin, { id: "ann" }, null, 1)).toHaveLength(1);
    expect(await loadReviewRequestTimeline(admin, { id: "ben" }, null, 50)).toEqual([]);
  });
});
