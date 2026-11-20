import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  booking: null as Row | null,
  updates: [] as Row[],
  isSlotFree: vi.fn(),
  bookCalendarSlot: vi.fn(),
  telegram: vi.fn(),
  email: vi.fn(),
  upsertReminder: vi.fn(),
  moved: [{ id: "bk-1" }] as Array<{ id: string }>,
}));

vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => ({}) }));
vi.mock("@/lib/appointments/book-slot", () => ({
  isSlotFree: h.isSlotFree,
  bookCalendarSlot: h.bookCalendarSlot,
}));
vi.mock("@/lib/appointments/reminders-db", () => ({ upsertPendingReminder: h.upsertReminder }));
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
        let data: unknown = null;
        if (op === "update" && table === "readjustment_bookings") {
          data = h.moved;
          if (h.moved.length) {
            h.updates.push(payload);
            if (h.booking) Object.assign(h.booking, payload);
          }
        }
        return Promise.resolve({ data, error: null }).then(resolve);
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
  h.moved = [{ id: "bk-1" }];
  h.booking = paidBooking();
  h.isSlotFree.mockResolvedValue(true);
  h.bookCalendarSlot.mockImplementation(async (input: { onEventCreated?: (id: string) => Promise<void> }) => {
    await input.onEventCreated?.("evt-9");
    return { eventId: "evt-9", contact: "created" };
  });
});

describe("finalizeReadjustmentBooking", () => {
  it("books a paid visit and names the fee Order on the event", async () => {
    expect(await finalizeReadjustmentBooking(admin, "bk-1")).toBe("booked");
    const call = h.bookCalendarSlot.mock.calls[0][0];
    expect(call.readjustmentBookingId).toBe("bk-1");
    expect(call.notes.at(-1)).toBe("Paid SGD 30.00 · Order #1077");
    expect(h.isSlotFree).toHaveBeenCalledWith(
      "2026-11-14T06:30:00.000Z",
      "2026-11-14T07:30:00.000Z",
      { excludeBookingId: "bk-1" },
    );
    expect(h.booking).toMatchObject({ status: "booked", calendar_event_id: "evt-9", hold_expires_at: null });
  });

  it("adds the Checkout's language preference to the event, and ignores an unknown one", async () => {
    await finalizeReadjustmentBooking(admin, "bk-1", "mandarin");
    expect(h.bookCalendarSlot.mock.calls[0][0].notes.slice(-2)).toEqual([
      "Paid SGD 30.00 · Order #1077",
      "Language preference: Mandarin",
    ]);

    h.booking = paidBooking();
    await finalizeReadjustmentBooking(admin, "bk-1", "klingon");
    expect(h.bookCalendarSlot.mock.calls[1][0].notes.at(-1)).toBe("Paid SGD 30.00 · Order #1077");
  });

  it("records the event id the moment it exists, before reminders can fail", async () => {
    h.bookCalendarSlot.mockImplementation(async (input: { onEventCreated?: (id: string) => Promise<void> }) => {
      await input.onEventCreated?.("evt-9");
      throw new Error("reminder insert failed");
    });
    await expect(finalizeReadjustmentBooking(admin, "bk-1")).rejects.toThrow();
    expect(h.booking).toMatchObject({ status: "awaiting_payment", calendar_event_id: "evt-9" });
  });

  it("finishes a half-written booking on retry instead of calling its own event a clash", async () => {
    h.booking = paidBooking({ calendar_event_id: "evt-9" });
    expect(await finalizeReadjustmentBooking(admin, "bk-1")).toBe("booked");
    expect(h.bookCalendarSlot).not.toHaveBeenCalled();
    expect(h.isSlotFree).not.toHaveBeenCalled();
    expect(h.upsertReminder).toHaveBeenCalledWith(expect.objectContaining({ calendarEventId: "evt-9" }));
    expect(h.telegram).not.toHaveBeenCalled();
    expect(h.booking?.status).toBe("booked");
  });

  it("stays quiet when a concurrent delivery already flagged the clash", async () => {
    h.isSlotFree.mockResolvedValue(false);
    h.moved = [];
    expect(await finalizeReadjustmentBooking(admin, "bk-1")).toBe("already_done");
    expect(h.telegram).not.toHaveBeenCalled();
    expect(h.email).not.toHaveBeenCalled();
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
