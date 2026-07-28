import { describe, it, expect } from "vitest";
import { buildVEvent, toIcsUtc } from "@/lib/appointments/ics";

describe("toIcsUtc", () => {
  it("converts SGT (+08:00) to UTC basic format", () => {
    expect(toIcsUtc("2026-07-27T14:30:00+08:00")).toBe("20260727T063000Z");
  });
  it("passes Z-time through unchanged", () => {
    expect(toIcsUtc("2026-07-27T06:30:00Z")).toBe("20260727T063000Z");
  });
  it("rolls the date back across midnight when SGT→UTC crosses it", () => {
    expect(toIcsUtc("2026-07-27T07:00:00+08:00")).toBe("20260726T230000Z");
  });
  it("throws on garbage", () => {
    expect(() => toIcsUtc("not-a-date")).toThrow();
  });
});

describe("buildVEvent", () => {
  const ics = buildVEvent({
    summary: "Mpillow: Fitting; deluxe, plush",
    startIso: "2026-07-27T14:30:00+08:00",
    endIso: "2026-07-27T15:30:00+08:00",
    location: "1 Orchard Rd, #02-01",
    description: "Bring your\nreference photos, thanks",
    uid: "appt-123@mpillow",
  });

  it("pairs BEGIN/END for VCALENDAR and VEVENT", () => {
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VEVENT");
  });

  it("includes required fields with SGT→UTC times", () => {
    expect(ics).toContain("DTSTART:20260727T063000Z");
    expect(ics).toContain("DTEND:20260727T073000Z");
    expect(ics).toContain("UID:appt-123@mpillow");
    expect(ics).toContain("DTSTAMP:20260727T063000Z"); // derived from start
    expect(ics).toContain("VERSION:2.0");
  });

  it("escapes RFC 5545 special chars in text values", () => {
    expect(ics).toContain("SUMMARY:Mpillow: Fitting\\; deluxe\\, plush");
    expect(ics).toContain("LOCATION:1 Orchard Rd\\, #02-01");
    expect(ics).toContain("DESCRIPTION:Bring your\\nreference photos\\, thanks");
  });

  it("uses CRLF line endings", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("omits LOCATION/DESCRIPTION when absent", () => {
    const bare = buildVEvent({
      summary: "Bare",
      startIso: "2026-07-27T06:30:00Z",
      endIso: "2026-07-27T07:30:00Z",
      uid: "u1",
    });
    expect(bare).not.toContain("LOCATION:");
    expect(bare).not.toContain("DESCRIPTION:");
  });
});
