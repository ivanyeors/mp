import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * After the money is in (ADR 0024): finalizeReadjustmentBooking puts a paid
 * re-adjustment on the calendar exactly once, and if the slot went while the
 * customer paid, it says so instead of double-booking — the money stays on a
 * confirmed Order.
 */

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  booking: null as Row | null,
  updates: [] as Row[],
  isSlotFree: vi.fn(),
  bookCalendarSlot: vi.fn(),
  telegram: vi.fn(),
  email: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => ({}) }));
vi.mock("@/lib/appointments/book-slot", () => ({
  isSlotFree: h.isSlotFree,
  bookCalendarSlot: h.bookCalendarSlot,
}));
vi.mock("@/lib/appointments/settings-store", () => ({
  getAppointmentSettings: vi.fn(async () => ({})),
}));
vi.mock("@/lib/locations", () => ({
  getLocation: vi.fn(async (id: string) => ({ id, name: "Studio", address: "1 Road", bookable: true })),
}));
vi.mock("@/lib/telegram/notify", () => ({ sendTelegram: h.telegram }));
vi.mock("@/lib/email", () => ({ getEmailTransport: () => ({ send: h.email }) }));
vi.mock("@/lib/email/transport", () => ({ getDefaultFromAddress: () => "from@x.test" }));
vi.mock("@/lib/stripe/client", () => ({ getStripe: vi.fn() }));

const { finalizeReadjustmentBooking, expireReadjustmentBooking } = await import("@/lib/readjustment/checkout");

/** A minimal admin client: one booking row, one fee Order, updates recorded. */
const admin = {
  from: (table: string) => {
    let op = "select";
    let payload: Row = {};
    const b = {
      select: () => b,
      update: (p: Row) => ((op = "update"), (payload = p), b),
      eq: () => b,
      maybeSingle: async () => ({
        data: table === "orders" ? { order_number: "1077" } : h.booking,
        error: null,
      }),
      then: (resolve: (v: unknown) => unknown) => {
        if (op === "update" && table === "readjustment_bookings") {
          h.updates.push(payload);
          if (h.booking) Object.assign(h.booking, payload);
        }
        return Promise.resolve({ data: null, error: null }).then(resolve);
      },
    };
    return b;
  },
} as never;

const paidBooking = (extra: Row = {}): Row => ({
  id: "bk-1",
  status: "awaiting_payment",
  calendar_event_id: null,
  start_at: "2026-11-14T06:30:00.000Z",
  end_at: "2026-11-14T07:30:00.000Z",
  location_id: "loc-1",
  location_name: "Studio",
  guest_name: "Ada",
  phone: "+6591234567",
  email: "ada@x.test",
  product_label: "Basic Mpillow · Size S",
  purchase_source: "platform",
  order_number: "1001",
  purchase_paid_at: "2026-01-05T02:00:00Z",
  unlisted_where: null,
  unlisted_reference: null,
  fee_amount: "30.00",
  fee_order_id: "order-fee",
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  h.updates = [];
  h.booking = paidBooking();
  h.isSlotFree.mockResolvedValue(true);
  h.bookCalendarSlot.mockResolvedValue({ eventId: "evt-9", contact: "created" });
});

describe("finalizeReadjustmentBooking", () => {
  it("books a paid visit and names the fee Order on the event", async () => {
    expect(await finalizeReadjustmentBooking(admin, "bk-1")).toBe("booked");
    const call = h.bookCalendarSlot.mock.calls[0][0];
    expect(call.readjustmentBookingId).toBe("bk-1");
    expect(call.notes.at(-1)).toBe("Paid SGD 30.00 · Order #1077");
    // Its own hold must not count against it.
    expect(h.isSlotFree).toHaveBeenCalledWith(
      "2026-11-14T06:30:00.000Z",
      "2026-11-14T07:30:00.000Z",
      { excludeBookingId: "bk-1" },
    );
    expect(h.booking).toMatchObject({ status: "booked", calendar_event_id: "evt-9", hold_expires_at: null });
  });

  it("does nothing on a replayed webhook", async () => {
    h.booking = paidBooking({ status: "booked", calendar_event_id: "evt-9" });
    expect(await finalizeReadjustmentBooking(admin, "bk-1")).toBe("already_done");
    expect(h.bookCalendarSlot).not.toHaveBeenCalled();
    expect(h.updates).toEqual([]);
  });

  it("flags a slot taken while the customer paid — alerting Staff and the customer, booking nothing", async () => {
    h.isSlotFree.mockResolvedValue(false);
    expect(await finalizeReadjustmentBooking(admin, "bk-1")).toBe("needs_reschedule");
    expect(h.bookCalendarSlot).not.toHaveBeenCalled();
    expect(h.booking?.status).toBe("needs_reschedule");
    expect(h.telegram).toHaveBeenCalledOnce();
    expect(String(h.telegram.mock.calls[0][0])).toContain("Paid SGD 30.00 (Order #1077)");
    expect(h.email).toHaveBeenCalledOnce();
  });

  it("reports a booking that does not exist", async () => {
    h.booking = null;
    expect(await finalizeReadjustmentBooking(admin, "nope")).toBe("not_found");
  });
});

describe("expireReadjustmentBooking", () => {
  it("releases the hold of an unpaid booking", async () => {
    await expireReadjustmentBooking(admin, "bk-1");
    expect(h.updates[0]).toMatchObject({ status: "expired", hold_expires_at: null });
  });
});
