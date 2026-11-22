import { describe, expect, it } from "vitest";

import { withCurrentSlot } from "@/components/account/my-bookings";

const booking = { startsAt: "2026-11-28T02:00:00.000Z", endsAt: "2026-11-28T03:00:00.000Z" };
const free = [
  { id: "a", startIso: "2026-11-28T01:00:00.000Z", endIso: "2026-11-28T02:00:00.000Z" },
  { id: "b", startIso: "2026-11-28T05:00:00.000Z", endIso: "2026-11-28T06:00:00.000Z" },
];

describe("withCurrentSlot", () => {
  it("offers the visit's own time on its own day, so only the location can change", () => {
    expect(withCurrentSlot(free, booking, "2026-11-28").map((s) => s.id)).toEqual(["a", "current", "b"]);
  });

  it("adds nothing on other days, or when the time is already offered", () => {
    expect(withCurrentSlot(free, booking, "2026-11-29")).toEqual(free);
    const withOwn = [...free, { id: "own", startIso: booking.startsAt, endIso: booking.endsAt }];
    expect(withCurrentSlot(withOwn, booking, "2026-11-28")).toEqual(withOwn);
  });
});
