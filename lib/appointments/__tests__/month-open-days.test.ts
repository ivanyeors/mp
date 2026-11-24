import { describe, expect, it } from "vitest";
import { DEFAULT_APPOINTMENT_SETTINGS } from "@/lib/appointments/settings";
import { monthOpenDays, sgtLocalToUtcMs, type BusyInterval } from "@/lib/appointments/slots";

const settings = DEFAULT_APPOINTMENT_SETTINGS;

describe("monthOpenDays", () => {
  it("lists only the days that still have a free time, from today on", () => {
    const now = new Date(sgtLocalToUtcMs(2026, 11, 24, 9, 0));
    const busy: BusyInterval[] = [
      { startMs: sgtLocalToUtcMs(2026, 11, 25, 0, 0), endMs: sgtLocalToUtcMs(2026, 11, 26, 0, 0) },
      { startMs: sgtLocalToUtcMs(2026, 11, 26, 10, 0), endMs: sgtLocalToUtcMs(2026, 11, 26, 17, 0) },
    ];
    expect(monthOpenDays(busy, settings, { y: 2026, m: 11 }, now)).toEqual([
      { date: "2026-11-24", count: 9 },
      { date: "2026-11-26", count: 2 },
      { date: "2026-11-27", count: 9 },
      { date: "2026-11-28", count: 9 },
      { date: "2026-11-29", count: 9 },
    ]);
  });

  it("drops a day an admin blocked off", () => {
    const now = new Date(sgtLocalToUtcMs(2026, 11, 24, 9, 0));
    const blocked = {
      ...settings,
      blockedRanges: [
        {
          start: new Date(sgtLocalToUtcMs(2026, 11, 27, 0, 0)).toISOString(),
          end: new Date(sgtLocalToUtcMs(2026, 11, 28, 0, 0)).toISOString(),
        },
      ],
    };
    const dates = monthOpenDays([], blocked, { y: 2026, m: 11 }, now).map((d) => d.date);
    expect(dates).toEqual(["2026-11-24", "2026-11-25", "2026-11-26", "2026-11-28", "2026-11-29"]);
  });

  it("covers every day of a leap February and nothing past it", () => {
    const now = new Date(sgtLocalToUtcMs(2028, 1, 31, 20, 0));
    const dates = monthOpenDays([], settings, { y: 2028, m: 2 }, now).map((d) => d.date);
    expect(dates[0]).toBe("2028-02-01");
    expect(dates.at(-1)).toBe("2028-02-29");
    expect(dates).not.toContain("2028-02-28");
    expect(dates).toHaveLength(25);
  });

  it("stops at the furthest day a booking is accepted", () => {
    const now = new Date(sgtLocalToUtcMs(2026, 11, 24, 9, 0));
    const dates = monthOpenDays([], settings, { y: 2027, m: 11 }, now).map((d) => d.date);
    expect(dates.at(-1)).toBe("2027-11-24");
  });

  it("has nothing for a month already gone", () => {
    const now = new Date(sgtLocalToUtcMs(2026, 11, 24, 9, 0));
    expect(monthOpenDays([], settings, { y: 2026, m: 10 }, now)).toEqual([]);
  });
});
