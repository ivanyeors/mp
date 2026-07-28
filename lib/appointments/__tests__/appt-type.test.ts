import { describe, expect, it } from "vitest";

import { parseApptType } from "@/lib/appointments/appt-type";

describe("parseApptType", () => {
  it("returns the type for valid query values", () => {
    expect(parseApptType("customisation")).toBe("customisation");
    expect(parseApptType("readjustment")).toBe("readjustment");
  });

  it("returns null for absent/invalid values (page falls back to pills)", () => {
    expect(parseApptType(undefined)).toBeNull();
    expect(parseApptType(null)).toBeNull();
    expect(parseApptType("")).toBeNull();
    expect(parseApptType("nope")).toBeNull();
    expect(parseApptType("Customisation")).toBeNull();
  });
});
