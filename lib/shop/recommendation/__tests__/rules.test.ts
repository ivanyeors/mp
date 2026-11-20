import { describe, it, expect } from "vitest";
import {
  recommendFromPreferences,
  recommendFromMeasurements,
  recommendBolster,
  shoulderToBodyType,
  deriveSleepPosition,
  deriveFirmness,
  type AvailableFilling,
} from "@/lib/shop/recommendation/rules";
import type { MeasurementBasedPreferences } from "@/lib/types/customization";

const FILLINGS: AvailableFilling[] = [
  { item_id: 1, subtype: "3D-S", name: "3D Soft" },
  { item_id: 2, subtype: "3D-L", name: "3D Large" },
  { item_id: 3, subtype: "6D-S", name: "6D Soft" },
  { item_id: 4, subtype: "6D-L", name: "6D Large" },
  { item_id: 5, subtype: "6D-L+", name: "6D Large Plus" },
];

describe("recommendFromPreferences", () => {
  it("maps an average side sleeper to a Size M basic pillow", () => {
    const result = recommendFromPreferences(
      { sleep_position: "side", body_type: "average", firmness: "medium" },
      FILLINGS,
    );
    expect(result.recommended_size).toBe("M");
    expect(result.recommended_kind).toBe("basic");
    expect(result.filling_lines.map((l) => l.subtype).sort()).toEqual(["3D-L", "6D-S"]);
    expect(result.summary).toContain("Size M");
    expect(result.explanation).toContain("side sleeper");
  });

  it("maps a petite stomach sleeper to XS", () => {
    const result = recommendFromPreferences(
      { sleep_position: "stomach", body_type: "petite", firmness: "soft" },
      FILLINGS,
    );
    expect(result.recommended_size).toBe("XS");
    expect(result.filling_lines).toEqual([
      { item_id: 1, subtype: "3D-S", name: "3D Soft", quantity: 1 },
    ]);
  });

  it("drops filling lines whose subtype is unavailable", () => {
    const result = recommendFromPreferences(
      { sleep_position: "side", body_type: "large", firmness: "firm" },
      [{ item_id: 4, subtype: "6D-L", name: "6D Large" }],
    );
    expect(result.recommended_size).toBe("L");
    expect(result.filling_lines.map((l) => l.subtype)).toEqual(["6D-L"]);
  });
});

describe("measurement helpers", () => {
  it("derives body type from shoulder width", () => {
    expect(shoulderToBodyType(35)).toBe("petite");
    expect(shoulderToBodyType(40)).toBe("average");
    expect(shoulderToBodyType(48)).toBe("large");
  });

  it("derives a single sleep position and falls back to mixed", () => {
    expect(deriveSleepPosition(["side"])).toBe("side");
    expect(deriveSleepPosition(["side", "back"])).toBe("mixed");
    expect(deriveSleepPosition([])).toBe("mixed");
  });

  it("adjusts firmness softer for ear discomfort and firmer for acid reflux", () => {
    const base = {
      blood_pressure: "normal",
      ear_discomfort_side_sleep: false,
      bed_firmness: "medium",
      acid_reflux: false,
      sleep_pain_areas: [] as string[],
      sleep_position_type: ["side"],
      uses_bolster: false,
    };
    expect(deriveFirmness("medium", base)).toBe("medium");
    expect(deriveFirmness("medium", { ...base, ear_discomfort_side_sleep: true })).toBe("medium-soft");
    expect(deriveFirmness("medium", { ...base, acid_reflux: true })).toBe("medium-firm");
  });
});

describe("recommendFromMeasurements", () => {
  it("produces a size from measurements + health profile", () => {
    const input: MeasurementBasedPreferences = {
      measurements: {
        shoulder_length_cm: 50,
        neck_to_back_cm: 10,
        head_to_back_cm: 12,
        neck_length_cm: 8,
      },
      demographics: { gender: "f", age_group: "30s" },
      health: {
        blood_pressure: "normal",
        ear_discomfort_side_sleep: false,
        bed_firmness: "medium",
        acid_reflux: false,
        sleep_pain_areas: [],
        sleep_position_type: ["side"],
        uses_bolster: false,
      },
    };
    const result = recommendFromMeasurements(input, FILLINGS);
    expect(result.recommended_size).toBe("L");
    expect(result.explanation).toContain("Shoulder width 50cm");
  });
});

describe("recommendBolster", () => {
  it("sizes by height", () => {
    expect(recommendBolster({ height_cm: 140, sleep_position: "side" }).recommended_size).toBe("S");
    expect(recommendBolster({ height_cm: 170, sleep_position: "back" }).recommended_size).toBe("M");
    expect(recommendBolster({ height_cm: 190, sleep_position: "side" }).recommended_size).toBe("L");
  });

  it("returns no filling lines for bolsters", () => {
    expect(recommendBolster({ height_cm: 170, sleep_position: "side" }).filling_lines).toEqual([]);
  });
});
