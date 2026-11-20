import { describe, expect, it } from "vitest";
import {
  sgDate,
  sgMonthEndExclusive,
  sgMonthKey,
  sgMonthKeysBetween,
  sgMonthRange,
  sgMonthRangeIso,
  sgMonthStart,
} from "../sg-calendar";

describe("Singapore months", () => {
  it("files an instant under its Singapore date, not its UTC one", () => {
    expect(sgDate("2026-04-30T17:00:00Z")).toBe("2026-05-01");
    expect(sgMonthKey("2026-04-30T17:00:00Z")).toBe("2026-05");
    expect(sgMonthKey("2026-04-30T15:59:59Z")).toBe("2026-04");
  });

  it("bounds a month at Singapore midnight", () => {
    expect(sgMonthStart("2026-05").toISOString()).toBe("2026-04-30T16:00:00.000Z");
    expect(sgMonthEndExclusive("2026-10").toISOString()).toBe("2026-10-31T16:00:00.000Z");
    expect(sgMonthEndExclusive("2026-12").toISOString()).toBe("2026-12-31T16:00:00.000Z");
  });

  it("lists every month in a range, across a year end", () => {
    expect(sgMonthKeysBetween("2026-11", "2027-02")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
  });

  it("reads back the months a Singapore browser sent, on a server in any timezone", () => {
    const range = sgMonthRange("2026-04-30T16:00:00.000Z", "2026-10-31T15:59:59.999Z");
    expect(range.fromMonth).toBe("2026-05");
    expect(range.toMonth).toBe("2026-10");
    expect(range.from.toISOString()).toBe("2026-04-30T16:00:00.000Z");
    expect(range.toExclusive.toISOString()).toBe("2026-10-31T16:00:00.000Z");
    expect(range.months).toHaveLength(6);
  });

  it("treats an exclusive end as the month before it", () => {
    expect(sgMonthRange("2026-04-30T16:00:00.000Z", "2026-10-31T16:00:00.000Z").toMonth).toBe("2026-10");
  });

  it("round-trips the instants the client sends", () => {
    const iso = sgMonthRangeIso("2026-05", "2026-10");
    expect(iso).toEqual({ from: "2026-04-30T16:00:00.000Z", to: "2026-10-31T15:59:59.999Z" });
    const range = sgMonthRange(iso.from, iso.to);
    expect([range.fromMonth, range.toMonth]).toEqual(["2026-05", "2026-10"]);
  });

  it("refuses a range that ends before it starts", () => {
    expect(() => sgMonthRange("2026-06-01T00:00:00Z", "2026-03-01T00:00:00Z")).toThrow();
    expect(() => sgMonthRange("nope", "2026-03-01T00:00:00Z")).toThrow();
  });
});
