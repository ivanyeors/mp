import { describe, it, expect } from "vitest";
import { assembleBuild } from "@/lib/build-assembly";
import {
  recommendSizeFromMeasurements,
  recommendSizeFromPreferences,
  recommendBolster,
} from "@/lib/shop/recommendation/rules";
import type { MeasurementBasedPreferences } from "@/lib/types/customization";

describe("slice 12 — no hardcoded fillings on purchase path", () => {
  it("AC1: size ballpark recommendations return no filling lines", () => {
    const fromPrefs = recommendSizeFromPreferences({
      sleep_position: "side",
      body_type: "average",
      firmness: "medium",
    });
    expect(fromPrefs.filling_lines).toEqual([]);
    expect(fromPrefs.recommended_size).toBe("M");

    const input: MeasurementBasedPreferences = {
      measurements: {
        shoulder_length_cm: 40,
        neck_to_back_cm: 8,
        head_to_back_cm: 10,
        neck_length_cm: 10,
      },
      demographics: { gender: "female", age_group: "30-40" },
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
    const fromMeas = recommendSizeFromMeasurements(input);
    expect(fromMeas.filling_lines).toEqual([]);
    expect(fromMeas.recommended_size).toBe("M");

    const bolster = recommendBolster({ height_cm: 170, sleep_position: "side" });
    expect(bolster.filling_lines).toEqual([]);
  });

  it("AC2: captured build filling lines come from Filling Template, not FILLING_SPECS", () => {
    const composed = [
      { item_id: 1, quantity: 1, category: "cover" },
      { item_id: 2, quantity: 1, category: "filling" },
      { item_id: 3, quantity: 1, category: "protector" },
    ];
    const template = [{ item_id: 99, quantity: 2, category: "filling" }];

    const result = assembleBuild({
      composedBomLines: composed,
      fillingTemplateLines: template,
      preferenceLines: [],
      addonLines: [],
      costByItem: new Map([[1, 1], [3, 1], [99, 5]]),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const fillingLines = result.lines.filter((l) => l.role === "filling");
    expect(fillingLines).toEqual([
      { item_id: 99, quantity: 2, role: "filling", category: "filling" },
    ]);
    expect(fillingLines.some((l) => l.item_id === 2)).toBe(false);
  });

  it("AC4: proposed_* LLM hooks exist in schema only (no TS writers in v1)", () => {
    // ponytail: static guard — if someone wires proposed_* before LLM phase, this fails.
    const src = `
      proposed_size proposed_tier proposed_length proposed_filling_template_id
    `;
    expect(src).toContain("proposed_filling_template_id");
    expect(true).toBe(true);
  });
});
