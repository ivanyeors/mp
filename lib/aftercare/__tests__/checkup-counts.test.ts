import { describe, expect, it } from "vitest";
import { countCheckupSends, summariseCheckupSends } from "@/lib/aftercare/checkup-counts";
import { reviewFakeDb } from "./review-request-fake-db";

const sent = (customer: string, order: string, at: string, template = "aftercare.checkup_12m") => ({
  customer_id: customer,
  template,
  entity_id: order,
  sent_at: at,
});

describe("summariseCheckupSends", () => {
  it("counts a check-up once whatever carried it, the messages by channel, and the bookings made after it", () => {
    expect(
      summariseCheckupSends({
        email: [sent("ann", "o1", "2026-10-01T02:00:00Z"), sent("ben", "o2", "2026-10-02T02:00:00Z"), sent("cat", "o3", "2026-10-03T02:00:00Z")],
        whatsapp: [sent("ann", "o1", "2026-10-01T02:00:05Z"), sent("dan", "o4", "2026-10-04T02:00:00Z")],
        bookings: [
          { customer_id: "ann", created_at: "2026-10-08T02:00:00Z", status: "attended" },
          { customer_id: "ben", created_at: "2026-09-20T02:00:00Z", status: "booked" },
          { customer_id: "cat", created_at: "2026-10-05T02:00:00Z", status: "expired" },
          { customer_id: "dan", created_at: "2026-10-05T02:00:00Z", status: "cancelled" },
        ],
      }),
    ).toEqual({ sent: 4, email: 3, whatsapp: 2, followedByBooking: 1 });
  });
});

describe("countCheckupSends", () => {
  it("reads only sent check-ups in the window", async () => {
    const db = {
      customer_emails: [
        { ...sent("ann", "o1", "2026-10-01T02:00:00.000Z"), status: "sent" },
        { ...sent("ben", "o2", "2026-10-01T02:00:00.000Z"), status: "failed", sent_at: null },
        { ...sent("cat", "o3", "2026-05-01T02:00:00.000Z"), status: "sent" },
        { customer_id: "dan", template: "aftercare.review_request", entity_id: "dan", status: "sent", sent_at: "2026-10-01T02:00:00.000Z" },
      ],
      customer_whatsapp: [{ ...sent("ann", "o1", "2026-10-01T02:00:01.000Z"), status: "sent" }],
      readjustment_bookings: [{ customer_id: "ann", created_at: "2026-10-03T02:00:00.000Z", status: "booked" }],
    };
    const out = await countCheckupSends(reviewFakeDb(db), {
      from: "2026-07-23T02:00:00.000Z",
      to: "2026-10-21T02:00:00.000Z",
    });
    expect(out).toEqual({ sent: 1, email: 1, whatsapp: 1, followedByBooking: 1 });
  });
});
