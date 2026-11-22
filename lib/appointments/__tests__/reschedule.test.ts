import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  event: null as Row | null,
  booking: null as Row | null,
  updateError: null as { message: string } | null,
  updatedRows: 1,
  updates: [] as Row[],
  lookups: [] as string[],
  move: vi.fn(async () => {}),
  free: vi.fn(async () => true),
  offerable: vi.fn(() => true),
  location: { id: "loc-2", name: "Mpillow Studio", address: "1 Studio Rd", bookable: true } as Row | null,
  reminder: { status: "reminded", phone: "+6591234567", guest_name: "Ada" } as Row | null,
  updateReminder: vi.fn(async () => true),
  dayBefore: vi.fn(async () => true),
  morningOf: vi.fn(async () => true),
  telegram: vi.fn(async () => "sent"),
}));

vi.mock("@/lib/appointments/calendar", () => ({ getGuestBooking: async () => h.event, moveEvent: h.move }));
vi.mock("@/lib/appointments/book-slot", () => ({ isSlotFree: h.free }));
vi.mock("@/lib/appointments/slots", async (real) => ({
  ...(await real<typeof import("@/lib/appointments/slots")>()),
  isOfferableSlot: h.offerable,
}));
vi.mock("@/lib/appointments/settings-store", async () => {
  const { DEFAULT_APPOINTMENT_SETTINGS } = await import("@/lib/appointments/settings");
  return {
    getAppointmentSettings: async () => ({
      ...DEFAULT_APPOINTMENT_SETTINGS,
      whatsappEnabled: true,
      customisationSummaryMatch: "Customisation",
      readjustmentSummaryMatch: "Re-adjustment",
    }),
  };
});
vi.mock("@/lib/appointments/remind", () => ({ sendDayBeforeReminder: h.dayBefore, sendMorningOfReminder: h.morningOf }));
vi.mock("@/lib/appointments/phone", () => ({ isPhoneAllowed: () => true }));
vi.mock("@/lib/locations", () => ({ getLocation: async () => h.location }));
vi.mock("@/lib/appointments/reminders-db", () => ({
  getReminderByEventId: async () => h.reminder,
  updateReminder: h.updateReminder,
}));
vi.mock("@/lib/telegram/notify", () => ({ sendTelegram: h.telegram }));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => ({}) }));

const { rescheduleOwnBooking, changeWindowOpen } = await import("@/lib/appointments/reschedule");

const admin = {
  from: () => {
    let op = "select";
    let payload: Row = {};
    const b = {
      select: () => b,
      update: (p: Row) => ((op = "update"), (payload = p), b),
      eq: (col: string) => (op === "select" && h.lookups.push(col), b),
      maybeSingle: async () => ({ data: h.booking, error: null }),
      then: (resolve: (v: unknown) => unknown) => {
        if (op === "update") h.updates.push(payload);
        const data = op === "update" && !h.updateError ? Array.from({ length: h.updatedRows }, () => ({ id: "bk-1" })) : null;
        return Promise.resolve({ data, error: op === "update" ? h.updateError : null }).then(resolve);
      },
    };
    return b;
  },
} as never;

const VISIT_START = "2026-11-25T02:00:00.000Z";
const VISIT_END = "2026-11-25T03:00:00.000Z";
const DAY_BEFORE = new Date("2026-11-24T03:00:00.000Z");
const ME = { customerId: "cust-1", email: "Ada@Example.com" };
const REQ = {
  eventId: "ev-1",
  startIso: "2026-11-27T06:00:00.000Z",
  endIso: "2026-11-27T07:00:00.000Z",
  locationId: "loc-2",
};

const customisation = (extra: Row = {}): Row => ({
  id: "ev-1",
  summary: "Ada Tan - Customisation",
  startsAt: VISIT_START,
  endsAt: VISIT_END,
  state: "live",
  guestEmail: "ada@example.com",
  location: "Old address",
  locationId: "loc-1",
  readjustmentBookingId: null,
  privateProps: { mpLocationId: "loc-1" },
  ...extra,
});

beforeEach(() => {
  h.event = customisation();
  h.booking = null;
  h.updateError = null;
  h.updatedRows = 1;
  h.updates = [];
  h.lookups = [];
  h.move.mockClear();
  h.free.mockReset();
  h.free.mockResolvedValue(true);
  h.offerable.mockReset();
  h.offerable.mockReturnValue(true);
  h.location = { id: "loc-2", name: "Mpillow Studio", address: "1 Studio Rd", bookable: true };
  h.reminder = { status: "reminded", phone: "+6591234567", guest_name: "Ada" };
  h.updateReminder.mockClear();
  h.dayBefore.mockClear();
  h.morningOf.mockClear();
  h.telegram.mockClear();
});

describe("changeWindowOpen", () => {
  it("is open until the end of the day before the visit, Singapore time", () => {
    expect(changeWindowOpen(VISIT_START, new Date("2026-11-24T15:59:00.000Z"))).toBe(true);
    expect(changeWindowOpen(VISIT_START, new Date("2026-11-24T16:01:00.000Z"))).toBe(false);
  });
});

describe("rescheduleOwnBooking", () => {
  it("moves the customer's own visit: new time and location in Google, the reminder re-armed", async () => {
    const out = await rescheduleOwnBooking(REQ, ME, DAY_BEFORE, admin);
    expect(out).toEqual({ ok: true, startsAt: REQ.startIso, endsAt: REQ.endIso, locationName: "Mpillow Studio" });
    expect(h.move).toHaveBeenCalledWith(
      "ev-1",
      REQ.startIso,
      REQ.endIso,
      { id: "loc-2", address: "1 Studio Rd" },
      { mpLocationId: "loc-1" },
    );
    expect(h.updateReminder).toHaveBeenCalledWith(
      "ev-1",
      { status: "rescheduled", starts_at: REQ.startIso, offered_slots: null },
      "reminded",
    );
  });

  it("checks the new slot is free while ignoring the visit's own current slot", async () => {
    await rescheduleOwnBooking(REQ, ME, DAY_BEFORE, admin);
    expect(h.free).toHaveBeenCalledWith(REQ.startIso, REQ.endIso, {
      ignore: { startMs: Date.parse(VISIT_START), endMs: Date.parse(VISIT_END) },
    });
  });

  it("refuses someone else's visit, and a cancelled or declined one", async () => {
    h.event = customisation({ guestEmail: "someone@else.com" });
    expect(await rescheduleOwnBooking(REQ, ME, DAY_BEFORE, admin)).toEqual({ ok: false, reason: "not_found" });
    h.event = customisation({ state: "declined" });
    expect(await rescheduleOwnBooking(REQ, ME, DAY_BEFORE, admin)).toEqual({ ok: false, reason: "not_found" });
    h.event = null;
    expect(await rescheduleOwnBooking(REQ, ME, DAY_BEFORE, admin)).toEqual({ ok: false, reason: "not_found" });
    expect(h.move).not.toHaveBeenCalled();
  });

  it("refuses a change on the visit day", async () => {
    const visitDay = new Date("2026-11-24T16:30:00.000Z");
    expect(await rescheduleOwnBooking(REQ, ME, visitDay, admin)).toEqual({ ok: false, reason: "closed" });
    expect(h.move).not.toHaveBeenCalled();
  });

  it("refuses a time that isn't a slot, a location not taking bookings, and a taken slot", async () => {
    h.offerable.mockReturnValue(false);
    expect((await rescheduleOwnBooking(REQ, ME, DAY_BEFORE, admin)).ok).toBe(false);
    h.offerable.mockReturnValue(true);
    h.location = { id: "loc-2", name: "Shut", address: "x", bookable: false };
    expect(await rescheduleOwnBooking(REQ, ME, DAY_BEFORE, admin)).toEqual({ ok: false, reason: "location" });
    h.location = { id: "loc-2", name: "Mpillow Studio", address: "1 Studio Rd", bookable: true };
    h.free.mockResolvedValue(false);
    expect(await rescheduleOwnBooking(REQ, ME, DAY_BEFORE, admin)).toEqual({ ok: false, reason: "taken" });
    expect(h.move).not.toHaveBeenCalled();
  });

  it("decides re-adjustment ownership by account, not email, and updates the booking record", async () => {
    h.event = customisation({ guestEmail: "old@example.com", readjustmentBookingId: "bk-1" });
    h.booking = { id: "bk-1", customer_id: "cust-1", status: "booked", calendar_event_id: "ev-1" };
    const out = await rescheduleOwnBooking(REQ, ME, DAY_BEFORE, admin);
    expect(out.ok).toBe(true);
    expect(h.updates[0]).toMatchObject({
      start_at: REQ.startIso,
      end_at: REQ.endIso,
      location_id: "loc-2",
      location_name: "Mpillow Studio",
    });
  });

  it("refuses a re-adjustment on another account, or one no longer booked", async () => {
    h.event = customisation({ readjustmentBookingId: "bk-1" });
    h.booking = { id: "bk-1", customer_id: "cust-2", status: "booked", calendar_event_id: "ev-1" };
    expect(await rescheduleOwnBooking(REQ, ME, DAY_BEFORE, admin)).toEqual({ ok: false, reason: "not_found" });
    h.booking = { id: "bk-1", customer_id: "cust-1", status: "cancelled", calendar_event_id: "ev-1" };
    expect(await rescheduleOwnBooking(REQ, ME, DAY_BEFORE, admin)).toEqual({ ok: false, reason: "not_found" });
    expect(h.move).not.toHaveBeenCalled();
  });

  it("tells Staff when the calendar moved but the booking record didn't", async () => {
    h.event = customisation({ readjustmentBookingId: "bk-1" });
    h.booking = { id: "bk-1", customer_id: "cust-1", status: "booked", calendar_event_id: "ev-1" };
    h.updateError = { message: "db down" };
    expect((await rescheduleOwnBooking(REQ, ME, DAY_BEFORE, admin)).ok).toBe(true);
    expect(String(h.telegram.mock.calls[0])).toContain("db down");
  });

  it("leaves a cancelled reminder alone", async () => {
    h.reminder = { status: "cancelled", phone: "+6591234567", guest_name: "Ada" };
    await rescheduleOwnBooking(REQ, ME, DAY_BEFORE, admin);
    expect(h.updateReminder).not.toHaveBeenCalled();
  });

  it("never moves an event that isn't a customisation visit, even when the customer is its guest", async () => {
    h.event = customisation({ summary: "Supplier meeting" });
    expect(await rescheduleOwnBooking(REQ, ME, DAY_BEFORE, admin)).toEqual({ ok: false, reason: "not_found" });
    expect(h.move).not.toHaveBeenCalled();
  });

  it("treats a re-adjustment event missing its tag as a re-adjustment, found by event id and checked by account", async () => {
    h.event = customisation({ summary: "Ada Tan - Re-adjustment" });
    h.booking = { id: "bk-1", customer_id: "cust-2", status: "booked", calendar_event_id: "ev-1" };
    expect(await rescheduleOwnBooking(REQ, ME, DAY_BEFORE, admin)).toEqual({ ok: false, reason: "not_found" });
    expect(h.lookups).toContain("calendar_event_id");
    h.booking = { id: "bk-1", customer_id: "cust-1", status: "booked", calendar_event_id: "ev-1" };
    expect((await rescheduleOwnBooking(REQ, ME, DAY_BEFORE, admin)).ok).toBe(true);
    expect(h.updates[0]).toMatchObject({ start_at: REQ.startIso });
  });

  it("lets the customer keep the same time and only change the location", async () => {
    h.offerable.mockReturnValue(false);
    const sameTime = { ...REQ, startIso: VISIT_START, endIso: VISIT_END };
    expect(await rescheduleOwnBooking(sameTime, ME, DAY_BEFORE, admin)).toMatchObject({ ok: true, locationName: "Mpillow Studio" });
    expect(h.move).toHaveBeenCalledWith("ev-1", VISIT_START, VISIT_END, { id: "loc-2", address: "1 Studio Rd" }, expect.any(Object));
    expect(h.updateReminder).not.toHaveBeenCalled();
  });

  it("tells Staff when the booking left 'booked' before the move was saved", async () => {
    h.event = customisation({ readjustmentBookingId: "bk-1" });
    h.booking = { id: "bk-1", customer_id: "cust-1", status: "booked", calendar_event_id: "ev-1" };
    h.updatedRows = 0;
    expect((await rescheduleOwnBooking(REQ, ME, DAY_BEFORE, admin)).ok).toBe(true);
    expect(String(h.telegram.mock.calls[0])).toContain("no longer booked");
  });

  it("sends the reminder the daily run already missed when the visit moves to tomorrow or today", async () => {
    const tomorrow = { ...REQ, startIso: "2026-11-25T06:00:00.000Z", endIso: "2026-11-25T07:00:00.000Z" };
    const afternoon = new Date("2026-11-24T07:00:00.000Z");
    h.event = customisation({ startsAt: "2026-11-30T02:00:00.000Z", endsAt: "2026-11-30T03:00:00.000Z" });
    await rescheduleOwnBooking(tomorrow, ME, afternoon, admin);
    expect(h.dayBefore).toHaveBeenCalledWith(
      expect.objectContaining({ calendarEventId: "ev-1", startsAt: tomorrow.startIso, from: "rescheduled", typeLabel: "Customisation" }),
      afternoon,
    );
    const laterToday = { ...REQ, startIso: "2026-11-24T10:00:00.000Z", endIso: "2026-11-24T11:00:00.000Z" };
    await rescheduleOwnBooking(laterToday, ME, afternoon, admin);
    expect(h.morningOf).toHaveBeenCalledWith(
      expect.objectContaining({ startsAt: laterToday.startIso, venue: "1 Studio Rd", from: "rescheduled" }),
      afternoon,
    );
  });

  it("sends no catch-up reminder for a visit moved further out", async () => {
    await rescheduleOwnBooking(REQ, ME, DAY_BEFORE, admin);
    expect(h.dayBefore).not.toHaveBeenCalled();
    expect(h.morningOf).not.toHaveBeenCalled();
  });
});
