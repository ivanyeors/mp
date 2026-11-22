import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => ({}) }));
vi.mock("@/lib/appointments/google-auth", () => ({ getGoogleAccessToken: vi.fn(async () => "t") }));

const h = vi.hoisted(() => ({ events: [] as unknown[] }));
vi.mock("@/lib/appointments/calendar", () => ({ listGuestBookings: async () => h.events }));

const { mergeMyBookings, listMyBookings } = await import("@/lib/appointments/my-bookings");
const { DEFAULT_APPOINTMENT_SETTINGS } = await import("@/lib/appointments/settings");

const settings = {
  ...DEFAULT_APPOINTMENT_SETTINGS,
  customisationSummaryMatch: "Customisation",
  readjustmentSummaryMatch: "Re-adjustment",
};

const NOW = new Date("2026-11-24T03:00:00.000Z");
const names = new Map([["loc-1", "Mpillow Studio"], ["loc-2", "Partner Store"]]);

const event = (extra: Record<string, unknown> = {}) => ({
  id: "ev-c",
  summary: "Ada Tan - Customisation",
  startsAt: "2026-11-28T02:00:00.000Z",
  endsAt: "2026-11-28T03:00:00.000Z",
  state: "live" as const,
  guestEmail: "ada@example.com",
  location: "1 Studio Rd",
  locationId: "loc-1",
  readjustmentBookingId: null as string | null,
  privateProps: {},
  ...extra,
});

const row = (extra: Record<string, unknown> = {}) => ({
  id: "bk-1",
  calendar_event_id: "ev-r",
  start_at: "2026-11-25T02:00:00.000Z",
  end_at: "2026-11-25T03:00:00.000Z",
  location_id: "loc-1",
  location_name: "Mpillow Studio",
  product_label: "Premium Mpillow · Size M",
  ...extra,
});

describe("mergeMyBookings", () => {
  it("lists re-adjustments and customisation visits, soonest first, with who can still change them", () => {
    const out = mergeMyBookings({
      readjustments: [row({ start_at: "2026-11-24T08:00:00.000Z", end_at: "2026-11-24T09:00:00.000Z" })],
      events: [event()],
      locationNames: names,
      settings,
      now: NOW,
    });
    expect(out.map((b) => [b.eventId, b.kind, b.changeable])).toEqual([
      ["ev-r", "readjustment", false],
      ["ev-c", "customisation", true],
    ]);
    expect(out[0].detail).toBe("Premium Mpillow · Size M");
    expect(out[1].locationName).toBe("Mpillow Studio");
  });

  it("shows a re-adjustment at its live calendar time and place, listed once", () => {
    const moved = event({
      id: "ev-r",
      summary: "Ada Tan - Re-adjustment",
      readjustmentBookingId: "bk-1",
      startsAt: "2026-11-30T02:00:00.000Z",
      endsAt: "2026-11-30T03:00:00.000Z",
      locationId: "loc-2",
    });
    const out = mergeMyBookings({ readjustments: [row()], events: [moved], locationNames: names, settings, now: NOW });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ startsAt: "2026-11-30T02:00:00.000Z", locationName: "Partner Store" });
  });

  it("hides a re-adjustment whose invite was declined, but keeps one the email search didn't find", () => {
    const declined = event({ id: "ev-r", readjustmentBookingId: "bk-1", state: "declined" });
    expect(mergeMyBookings({ readjustments: [row()], events: [declined], locationNames: names, settings, now: NOW })).toEqual(
      [],
    );
    expect(mergeMyBookings({ readjustments: [row()], events: [], locationNames: names, settings, now: NOW })).toHaveLength(1);
  });

  it("drops past visits, declined customisation visits, and other appointment types", () => {
    const out = mergeMyBookings({
      readjustments: [],
      events: [
        event({ id: "past", startsAt: "2026-11-20T02:00:00.000Z" }),
        event({ id: "declined", state: "declined" }),
        event({ id: "readj-no-row", summary: "Ada Tan - Re-adjustment", readjustmentBookingId: "bk-9" }),
      ],
      locationNames: names,
      settings,
      now: NOW,
    });
    expect(out).toEqual([]);
  });

  it("still lists re-adjustments when Google can't be reached", () => {
    const out = mergeMyBookings({ readjustments: [row()], events: null, locationNames: names, settings, now: NOW });
    expect(out.map((b) => b.eventId)).toEqual(["ev-r"]);
  });

  it("never lists an event that isn't a customisation visit, such as a meeting the customer was invited to", () => {
    const out = mergeMyBookings({
      readjustments: [],
      events: [event({ id: "meeting", summary: "Supplier meeting" })],
      locationNames: names,
      settings,
      now: NOW,
    });
    expect(out).toEqual([]);
  });
});

describe("listMyBookings", () => {
  it("finds a re-adjustment Staff moved later in Google, after its stored time has passed", async () => {
    const stale = row({ id: "bk-7", calendar_event_id: "ev-r", start_at: "2026-11-23T02:00:00.000Z", end_at: "2026-11-23T03:00:00.000Z" });
    h.events = [
      event({
        id: "ev-r",
        summary: "Ada Tan - Re-adjustment",
        readjustmentBookingId: "bk-7",
        startsAt: "2026-12-02T02:00:00.000Z",
        endsAt: "2026-12-02T03:00:00.000Z",
      }),
    ];
    const queries: string[] = [];
    const admin = {
      from: () => {
        let byId = false;
        const b = {
          select: () => b,
          eq: () => b,
          not: () => b,
          gt: () => b,
          in: (_col: string, ids: string[]) => ((byId = true), queries.push(ids.join(",")), b),
          then: (resolve: (v: unknown) => unknown) =>
            Promise.resolve({ data: byId ? [stale] : [], error: null }).then(resolve),
        };
        return b;
      },
    } as never;
    const { bookings } = await listMyBookings(
      { customerId: "cust-1", email: "ada@example.com" },
      { settings, locationNames: names, now: NOW, admin },
    );
    expect(queries).toEqual(["bk-7"]);
    expect(bookings).toHaveLength(1);
    expect(bookings[0]).toMatchObject({ kind: "readjustment", startsAt: "2026-12-02T02:00:00.000Z", changeable: true });
  });
});
