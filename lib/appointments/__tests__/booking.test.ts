import { describe, it, expect } from "vitest";
import { DEFAULT_APPOINTMENT_SETTINGS } from "@/lib/appointments/settings";
import {
  buildEventInsertBody,
  isOfferableSlot,
  listDaySlots,
  sgtLocalToUtcMs,
  type BusyInterval,
} from "@/lib/appointments/slots";

const S = DEFAULT_APPOINTMENT_SETTINGS;
const WED = { y: 2026, m: 7, d: 8 };
const beforeOpen = new Date(sgtLocalToUtcMs(2026, 7, 8, 6, 0));

function hoursSgt(slots: { startIso: string }[]): number[] {
  return slots.map((s) => new Date(Date.parse(s.startIso) + 8 * 3600_000).getUTCHours());
}

describe("listDaySlots", () => {
  it("returns every open→close start (10..18 inclusive) when free", () => {
    const slots = listDaySlots([], S, WED, beforeOpen);
    expect(hoursSgt(slots)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18]);
  });

  it("excludes a bookable weekday's slots when day is not bookable (Monday)", () => {
    const MON = { y: 2026, m: 7, d: 6 };
    expect(listDaySlots([], S, MON, new Date(sgtLocalToUtcMs(2026, 7, 6, 6, 0)))).toEqual([]);
  });

  it("excludes slots overlapping a busy interval", () => {
    const busy: BusyInterval[] = [
      { startMs: sgtLocalToUtcMs(2026, 7, 8, 11, 0), endMs: sgtLocalToUtcMs(2026, 7, 8, 12, 0) },
    ];
    const hours = hoursSgt(listDaySlots(busy, S, WED, beforeOpen));
    expect(hours).not.toContain(11);
    expect(hours).toContain(10);
    expect(hours).toContain(12);
  });

  it("excludes admin blocked ranges", () => {
    const settings = {
      ...S,
      blockedRanges: [
        {
          start: new Date(sgtLocalToUtcMs(2026, 7, 8, 14, 0)).toISOString(),
          end: new Date(sgtLocalToUtcMs(2026, 7, 8, 16, 0)).toISOString(),
        },
      ],
    };
    const hours = hoursSgt(listDaySlots([], settings, WED, beforeOpen));
    expect(hours).not.toContain(14);
    expect(hours).not.toContain(15);
    expect(hours).toContain(16);
  });

  it("excludes past slots relative to now", () => {
    const now = new Date(sgtLocalToUtcMs(2026, 7, 8, 13, 30));
    const hours = hoursSgt(listDaySlots([], S, WED, now));
    expect(Math.min(...hours)).toBe(14);
    expect(hours).not.toContain(13);
  });

  it("carves slots inside each of the day's windows (two windows, gap between)", () => {
    const availability = S.availability.map((d) => [...d]);
    availability[3] = [
      { start: "10:00", end: "12:00" },
      { start: "14:00", end: "16:00" },
    ];
    expect(hoursSgt(listDaySlots([], { ...S, availability }, WED, beforeOpen))).toEqual([
      10, 11, 14, 15,
    ]);
  });

  it("offers nothing from a window shorter than one appointment", () => {
    const availability = S.availability.map((d) => [...d]);
    availability[3] = [{ start: "10:00", end: "10:30" }];
    expect(listDaySlots([], { ...S, availability }, WED, beforeOpen)).toEqual([]);
  });

  it("steps by the appointment duration and keeps the last slot inside the window", () => {
    const slots = listDaySlots([], { ...S, durationMinutes: 90 }, WED, beforeOpen);
    const startsSgt = slots.map((s) => {
      const d = new Date(Date.parse(s.startIso) + 8 * 3600_000);
      return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
    });
    expect(startsSgt).toEqual(["10:00", "11:30", "13:00", "14:30", "16:00", "17:30"]);
  });

  it("respects a shorter duration for the busy-overlap boundary", () => {
    const settings = { ...S, durationMinutes: 30 };
    const busy: BusyInterval[] = [
      { startMs: sgtLocalToUtcMs(2026, 7, 8, 11, 30), endMs: sgtLocalToUtcMs(2026, 7, 8, 12, 0) },
    ];
    expect(hoursSgt(listDaySlots(busy, settings, WED, beforeOpen))).toContain(11);
  });
});

describe("buildEventInsertBody", () => {
  const guest = {
    startIso: "2026-07-08T02:00:00.000Z",
    endIso: "2026-07-08T03:00:00.000Z",
    summary: "Jane - Mpillow Customisation",
    locationAddress: "1 Somewhere Rd, Singapore 123456",
    guestName: "Jane",
    phone: "+6587805311",
  };

  it("stamps the location address into the event `location` field", () => {
    expect(buildEventInsertBody(guest).location).toBe(guest.locationAddress);
  });

  it("sets SGT-zoned start/end from the given ISO", () => {
    const body = buildEventInsertBody(guest);
    expect(body.start).toEqual({ dateTime: guest.startIso, timeZone: "Asia/Singapore" });
    expect(body.end).toEqual({ dateTime: guest.endIso, timeZone: "Asia/Singapore" });
    expect(body.summary).toBe(guest.summary);
  });

  it("puts guest contact in description; email adds an attendee", () => {
    const body = buildEventInsertBody(guest);
    expect(body.description).toContain("Jane");
    expect(body.description).toContain("+6587805311");
    expect(body.attendees).toBeUndefined();

    const withEmail = buildEventInsertBody({ ...guest, email: "jane@example.com" });
    expect(withEmail.description).toContain("jane@example.com");
    expect(withEmail.attendees).toEqual([
      { email: "jane@example.com", displayName: "Jane" },
    ]);
  });

  it("stamps the Location id into private extended properties when given", () => {
    expect(buildEventInsertBody(guest).extendedProperties).toBeUndefined();
    expect(
      buildEventInsertBody({ ...guest, locationId: "loc-1" }).extendedProperties,
    ).toEqual({ private: { mpLocationId: "loc-1" } });
  });
});

describe("isOfferableSlot", () => {
  const at = (h: number, min = 0) => new Date(sgtLocalToUtcMs(2026, 7, 8, h, min)).toISOString();

  it("accepts a slot listDaySlots offers", () => {
    expect(isOfferableSlot(at(10), at(11), S, beforeOpen)).toBe(true);
    expect(isOfferableSlot(at(18), at(19), S, beforeOpen)).toBe(true);
  });

  it("refuses a booking longer than one appointment", () => {
    const monthLater = new Date(sgtLocalToUtcMs(2026, 8, 8, 11, 0)).toISOString();
    expect(isOfferableSlot(at(10), monthLater, S, beforeOpen)).toBe(false);
    expect(isOfferableSlot(at(10), at(12), S, beforeOpen)).toBe(false);
  });

  it("refuses off-grid, closed-day, past and far-future starts", () => {
    expect(isOfferableSlot(at(10, 30), at(11, 30), S, beforeOpen)).toBe(false);
    expect(isOfferableSlot(at(3), at(4), S, beforeOpen)).toBe(false);
    const mon = (h: number) => new Date(sgtLocalToUtcMs(2026, 7, 6, h, 0)).toISOString();
    expect(isOfferableSlot(mon(10), mon(11), S, beforeOpen)).toBe(false);
    expect(isOfferableSlot(at(10), at(11), S, new Date(sgtLocalToUtcMs(2026, 7, 8, 12, 0)))).toBe(false);
    const nextYear = (h: number) => new Date(sgtLocalToUtcMs(2027, 7, 14, h, 0)).toISOString();
    expect(isOfferableSlot(nextYear(10), nextYear(11), S, beforeOpen)).toBe(false);
  });

  it("refuses unparseable times", () => {
    expect(isOfferableSlot("soon", at(11), S, beforeOpen)).toBe(false);
  });
});
