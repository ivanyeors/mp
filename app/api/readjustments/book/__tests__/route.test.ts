import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * POST /api/readjustments/book — a Complimentary re-adjustment (ADR 0024).
 *
 * The real route against an in-memory readjustment_bookings, with the purchase
 * resolution and the calendar stubbed. What matters is the order of writes: the
 * free visit is claimed on the database before the calendar is touched, and a
 * visit the server says is charged is never booked here.
 */

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  bookings: [] as Row[],
  customer: { id: "cust-1", email: "ada@x.test" } as null | { id: string; email: string },
  target: null as unknown,
  insertError: null as null | { code: string; message: string },
  isSlotFree: vi.fn(),
  bookCalendarSlot: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    from: () => {
      let op = "select";
      let payload: Row = {};
      const filters: Array<[string, unknown]> = [];
      const b = {
        insert: (p: Row) => ((op = "insert"), (payload = p), b),
        update: (p: Row) => ((op = "update"), (payload = p), b),
        select: () => b,
        eq: (c: string, v: unknown) => (filters.push([c, v]), b),
        single: async () => {
          if (op === "insert") {
            if (h.insertError) return { data: null, error: h.insertError };
            const row = { id: `booking-${h.bookings.length + 1}`, ...payload };
            h.bookings.push(row);
            return { data: row, error: null };
          }
          return { data: null, error: null };
        },
        then: (resolve: (v: unknown) => unknown) => {
          if (op === "update") {
            for (const r of h.bookings) {
              if (filters.every(([c, v]) => r[c] === v)) Object.assign(r, payload);
            }
          }
          return Promise.resolve({ data: null, error: null }).then(resolve);
        },
      };
      return b;
    },
  }),
}));
vi.mock("@/lib/readjustment/request", async (orig) => ({
  ...(await orig<typeof import("@/lib/readjustment/request")>()),
  resolveSignedInCustomer: vi.fn(async () => h.customer),
  resolveBookingTarget: vi.fn(async () => (h.target ? { target: h.target, fee: 30 } : null)),
  checkSlotRequest: vi.fn(async () => ({
    ok: true,
    slot: {
      location: { id: "loc-1", name: "Studio", address: "1 Road" },
      phone: "+6591234567",
      startIso: "2026-11-14T06:30:00.000Z",
      endIso: "2026-11-14T07:30:00.000Z",
    },
  })),
}));
vi.mock("@/lib/appointments/book-slot", () => ({
  isSlotFree: h.isSlotFree,
  bookCalendarSlot: h.bookCalendarSlot,
}));
vi.mock("@/lib/appointments/settings-store", () => ({
  getAppointmentSettings: vi.fn(async () => ({ readjustmentSummaryMatch: "Mpillow Re-adjustment" })),
}));

const { POST } = await import("@/app/api/readjustments/book/route");

const ITEM = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const purchase = {
  orderItemId: ITEM,
  orderNumber: "1042",
  label: "Premium Mpillow · Size M",
  imageUrl: null,
  paidAt: "2026-09-03T02:00:00Z",
  source: "platform",
  productType: "pillow",
  tier: "premium",
  units: 1,
};
const free = { kind: "platform", purchase, quote: { complimentary: true, fee: 0, seq: 1, freeUntil: "2026-11-02" } };
const charged = {
  kind: "platform",
  purchase,
  quote: { complimentary: false, fee: 30, reason: "window_ended", windowEndedOn: "2026-11-02" },
};

const post = (extra: Row = {}) =>
  POST(
    new Request("https://x.test/api/readjustments/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        order_item_id: ITEM,
        location_id: "loc-1",
        start_iso: "2026-11-14T06:30:00.000Z",
        end_iso: "2026-11-14T07:30:00.000Z",
        guest_name: "Ada",
        phone: "91234567",
        ...extra,
      }),
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  h.bookings = [];
  h.customer = { id: "cust-1", email: "ada@x.test" };
  h.target = free;
  h.insertError = null;
  h.isSlotFree.mockResolvedValue(true);
  h.bookCalendarSlot.mockImplementation(async (input: { onEventCreated?: (id: string) => Promise<void> }) => {
    await input.onEventCreated?.("evt-1");
    return { eventId: "evt-1", contact: "created" };
  });
});

describe("POST /api/readjustments/book", () => {
  it("refuses a signed-out visitor", async () => {
    h.customer = null;
    expect((await post()).status).toBe(401);
    expect(h.bookings).toEqual([]);
  });

  it("404s a line that is not one of the customer's purchases", async () => {
    h.target = null;
    expect((await post()).status).toBe(404);
  });

  it("refuses a visit the server quotes as charged, returning the quote", async () => {
    h.target = charged;
    const res = await post();
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("not_complimentary");
    expect(h.bookings).toEqual([]);
    expect(h.bookCalendarSlot).not.toHaveBeenCalled();
  });

  it("books a complimentary visit: claim first, then the calendar, with the pillow in the event", async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expect(h.bookings).toHaveLength(1);
    expect(h.bookings[0]).toMatchObject({
      customer_id: "cust-1",
      purchase_source: "platform",
      order_item_id: ITEM,
      complimentary: true,
      complimentary_seq: 1,
      fee_amount: 0,
      status: "booked",
      email: "ada@x.test",
      calendar_event_id: "evt-1",
    });
    const call = h.bookCalendarSlot.mock.calls[0][0];
    expect(call.appointmentType).toBe("readjustment");
    expect(call.readjustmentBookingId).toBe("booking-1");
    expect(call.notes).toEqual([
      "Re-adjustment: Premium Mpillow · Size M",
      expect.stringMatching(/^Order #1042 · bought 3 Sept? 2026$/),
      "Complimentary visit",
    ]);
  });

  it("puts the guest's language preference on the event for Staff", async () => {
    expect((await post({ language_preference: "mandarin" })).status).toBe(200);
    expect(h.bookCalendarSlot.mock.calls[0][0].notes.at(-1)).toBe("Language preference: Mandarin");
  });

  it("refuses a language outside the list", async () => {
    expect((await post({ language_preference: "klingon" })).status).toBe(400);
    expect(h.bookings).toEqual([]);
  });

  it("answers a lost race for the last free visit with a re-quote, booking nothing", async () => {
    h.insertError = { code: "23505", message: "duplicate key" };
    const res = await post();
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("free_visit_taken");
    expect(h.bookCalendarSlot).not.toHaveBeenCalled();
  });

  it("gives the free visit back when the calendar write fails", async () => {
    h.bookCalendarSlot.mockRejectedValue(new Error("calendar down"));
    const res = await post();
    expect(res.status).toBe(502);
    expect(h.bookings[0].status).toBe("cancelled");
  });

  it("keeps the booking once the invite exists, even if a later step fails", async () => {
    h.bookCalendarSlot.mockImplementation(async (input: { onEventCreated?: (id: string) => Promise<void> }) => {
      await input.onEventCreated?.("evt-1");
      throw new Error("reminder insert failed");
    });
    const res = await post();
    expect(res.status).toBe(200);
    expect(h.bookings[0]).toMatchObject({ status: "booked", calendar_event_id: "evt-1" });
  });

  it("books without payment while the fee is $0 — Stripe can't take it — claiming no free visit", async () => {
    h.target = {
      kind: "unlisted",
      where: "in_store",
      reference: null,
      quote: { complimentary: false, fee: 0, reason: "unlisted" },
    };
    const res = await post({ order_item_id: undefined, unlisted: { where: "in_store" } });
    expect(res.status).toBe(200);
    expect(h.bookings[0]).toMatchObject({
      purchase_source: "unlisted",
      complimentary: false,
      complimentary_seq: null,
      fee_amount: 0,
      status: "booked",
    });
    expect(h.bookCalendarSlot.mock.calls[0][0].notes.at(-1)).toBe("No fee (re-adjustment fee is $0)");
  });

  it("refuses a slot that has gone, before claiming anything", async () => {
    h.isSlotFree.mockResolvedValue(false);
    expect((await post()).status).toBe(409);
    expect(h.bookings).toEqual([]);
  });
});
