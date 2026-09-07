import { describe, it, expect } from "vitest";
import { LOCATION_PALETTE, locationColorMap } from "@/lib/appointments/location-colors";

describe("locationColorMap", () => {
  it("assigns palette colours by position, deterministically", () => {
    const a = locationColorMap(["x", "y", "z"]);
    const b = locationColorMap(["x", "y", "z"]);
    expect([...a.entries()]).toEqual([...b.entries()]);
    expect(a.get("x")).toBe(LOCATION_PALETTE[0]);
    expect(a.get("y")).toBe(LOCATION_PALETTE[1]);
    expect(a.get("z")).toBe(LOCATION_PALETTE[2]);
  });

  it("wraps around when there are more Locations than colours", () => {
    const ids = Array.from({ length: LOCATION_PALETTE.length + 2 }, (_, i) => `l${i}`);
    const m = locationColorMap(ids);
    expect(m.get(`l${LOCATION_PALETTE.length}`)).toBe(LOCATION_PALETTE[0]);
    expect(m.get(`l${LOCATION_PALETTE.length + 1}`)).toBe(LOCATION_PALETTE[1]);
  });

  it("ignores duplicate ids and unknown lookups miss", () => {
    const m = locationColorMap(["a", "a", "b"]);
    expect(m.size).toBe(2);
    expect(m.get("b")).toBe(LOCATION_PALETTE[1]);
    expect(m.get("nope")).toBeUndefined();
  });
});
