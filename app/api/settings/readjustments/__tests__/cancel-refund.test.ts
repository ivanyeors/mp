import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  booking: null as Row | null,
  refund: vi.fn(async () => ({ kind: "refunded" })),
  cancelAppointment: vi.fn(),
  deleteEvent: vi.fn(async () => {}),
  liveStart: "2026-11-25T02:00:00.000Z",
}));

vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: vi.fn().mockResolvedValue(null),
  getAdminContext: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/auth/audit", () => ({ recordAdminAction: vi.fn(async () => {}) }));
vi.mock("@/lib/appointments/calendar", () => ({
  deleteEvent: h.deleteEvent,
  getEventTiming: vi.fn(async () => ({ startsAt: h.liveStart, updatedAt: null })),
}));
vi.mock("@/lib/appointments/cancel", () => ({ cancelAppointment: h.cancelAppointment }));
vi.mock("@/lib/appointments/reminders-db", () => ({
  getReminderByEventId: vi.fn(async () => ({ calendar_event_id: "ev-1" })),
}));
vi.mock("@/lib/appointments/settings", () => ({
  APPOINTMENT_SETTING_KEYS: [],
  parseAppointmentSettings: () => ({}),
}));
vi.mock("@/lib/site-settings", () => ({ getSiteSettings: vi.fn(async () => ({})) }));
vi.mock("@/lib/ecommerce/orders", () => ({ addOrderTimelineEvent: vi.fn(async () => {}) }));
vi.mock("@/lib/readjustment/refund", () => ({ refundCancelledReadjustment: h.refund }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      let op = "select";
      let payload: Row = {};
      const filters: Row = {};
      const b = {
        select: () => b,
        update: (p: Row) => ((op = "update"), (payload = p), b),
        eq: (col: string, val: unknown) => ((filters[col] = val), b),
        maybeSingle: async () => ({
          data: table === "readjustment_bookings" ? h.booking && { ...h.booking } : null,
          error: null,
        }),
        then: (resolve: (v: unknown) => unknown) => {
          let data: unknown = null;
          if (op === "update" && table === "readjustment_bookings" && h.booking) {
            const matches = h.booking.status === filters.status;
            if (matches) Object.assign(h.booking, payload);
            data = matches ? [{ id: h.booking.id }] : [];
          }
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return b;
    },
  }),
}));

const { POST } = await import("@/app/api/settings/readjustments/[id]/route");

const ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const paid = (extra: Row = {}): Row => ({
  id: ID,
  status: "booked",
  complimentary: false,
  fee_order_id: null,
  start_at: "2026-11-25T02:00:00.000Z",
  guest_name: "Ada",
  product_label: "Basic Mpillow · Size S",
  calendar_event_id: "ev-1",
  order_item_id: null,
  ...extra,
});

const cancel = () =>
  POST(new Request("http://x.test", { method: "POST", body: JSON.stringify({ action: "cancel" }) }), {
    params: Promise.resolve({ id: ID }),
  });

beforeEach(() => {
  h.refund.mockClear();
  h.cancelAppointment.mockReset();
  h.deleteEvent.mockClear();
  h.liveStart = "2026-11-25T02:00:00.000Z";
});

describe("Staff cancel of a paid re-adjustment", () => {
  it("refunds once, from the route, when the route is what cancels it", async () => {
    h.booking = paid({ status: "needs_reschedule", calendar_event_id: null });
    const res = await cancel();
    expect(res.status).toBe(200);
    expect(h.refund).toHaveBeenCalledTimes(1);
    const [, booking, from, by] = h.refund.mock.calls[0] as unknown as [unknown, Row, string, string];
    expect(booking).toMatchObject({ id: ID, complimentary: false, start_at: "2026-11-25T02:00:00.000Z" });
    expect(from).toBe("needs_reschedule");
    expect(by).toBe("staff");
  });

  it("does not refund again when the calendar cancel already moved the booking", async () => {
    h.booking = paid();
    h.cancelAppointment.mockImplementation(async () => {
      h.booking!.status = "cancelled";
      return { kind: "cancelled", messaged: false };
    });
    const res = await cancel();
    expect(res.status).toBe(200);
    expect(h.cancelAppointment).toHaveBeenCalledTimes(1);
    expect(h.refund).not.toHaveBeenCalled();
  });

  it("judges the refund against the visit's live time when Staff moved it in Google Calendar", async () => {
    h.booking = paid({ start_at: "2026-11-21T02:00:00.000Z" });
    h.liveStart = "2026-11-28T02:00:00.000Z";
    h.cancelAppointment.mockResolvedValue({ kind: "not_live" });
    const res = await cancel();
    expect(res.status).toBe(200);
    expect(h.cancelAppointment.mock.calls[0][2]).toMatchObject({ cause: "removed", startsAt: "2026-11-28T02:00:00.000Z" });
    expect(h.refund).toHaveBeenCalledTimes(1);
    expect((h.refund.mock.calls[0] as unknown as [unknown, Row])[1].start_at).toBe("2026-11-28T02:00:00.000Z");
  });
});
