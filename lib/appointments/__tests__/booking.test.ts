import { describe, it, expect } from "vitest";
import { DEFAULT_APPOINTMENT_SETTINGS } from "@/lib/appointments/settings";
import {
  buildEventInsertBody,
  listDaySlots,
  sgtLocalToUtcMs,
  type BusyInterval,
} from "@/lib/appointments/slots";

const S = DEFAULT_APPOINTMENT_SETTINGS; // open 10, close 18, dur 60, Tue–Sun
// Wed 2026-07-08 is bookable. now well before open so nothing is "past".
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
    const MON = { y: 2026, m: 7, d: 6 }; // Monday — not in Tue–Sun
    expect(listDaySlots([], S, MON, new Date(sgtLocalToUtcMs(2026, 7, 6, 6, 0)))).toEqual([]);
  });

  it("excludes slots overlapping a busy interval", () => {
    const busy: BusyInterval[] = [
      { startMs: sgtLocalToUtcMs(2026, 7, 8, 11, 0), endMs: sgtLocalToUtcMs(2026, 7, 8, 12, 0) },
    ];
    const hours = hoursSgt(listDaySlots(busy, S, WED, beforeOpen));
    expect(hours).not.toContain(11); // busy 11–12 kills the 11:00 start
    expect(hours).toContain(10); // 10–11 ends exactly at busy start → allowed
    expect(hours).toContain(12); // 12–13 starts exactly at busy end → allowed
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
    expect(hours).toContain(16); // 16–17 starts at block end → allowed
  });

  it("excludes past slots relative to now", () => {
    const now = new Date(sgtLocalToUtcMs(2026, 7, 8, 13, 30)); // mid-day
    const hours = hoursSgt(listDaySlots([], S, WED, now));
    expect(Math.min(...hours)).toBe(14); // 13:00 is past, 13:30<14:00 next start
    expect(hours).not.toContain(13);
  });

  it("respects a shorter duration for the busy-overlap boundary", () => {
    const settings = { ...S, durationMinutes: 30 };
    const busy: BusyInterval[] = [
      { startMs: sgtLocalToUtcMs(2026, 7, 8, 11, 30), endMs: sgtLocalToUtcMs(2026, 7, 8, 12, 0) },
    ];
    // 11:00–11:30 no longer overlaps 11:30 block → 11:00 stays.
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
