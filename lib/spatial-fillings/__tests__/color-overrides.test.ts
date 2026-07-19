import { describe, expect, it } from "vitest";

import {
  effectiveFillingColors,
  xrayColorVarStyle,
  type ColorOverrideRow,
} from "../color-overrides";
import { fillingVisual } from "../visuals";

const SUBTYPES = ["3D (S)", "6D (Round)", "6D+ (Folded)"];

describe("filling color override resolution (default → override → cleared)", () => {
  it("no overrides → code defaults, nothing marked overridden, empty style", () => {
    const rows = effectiveFillingColors(SUBTYPES, []);
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.color).toBe(fillingVisual(row.subtype).defaultColor);
      expect(row.shape).toBe(fillingVisual(row.subtype).shape);
      expect(row.overridden).toBe(false);
    }
    expect(xrayColorVarStyle([])).toEqual({});
  });

  it("override wins for its subtype only and defines exactly its CSS variable", () => {
    const overrides: ColorOverrideRow[] = [{ subtype: "6D (Round)", color: "#112233" }];
    const rows = effectiveFillingColors(SUBTYPES, overrides);
    const overridden = rows.find((r) => r.subtype === "6D (Round)")!;
    expect(overridden).toMatchObject({ color: "#112233", overridden: true });
    // shape is never touched by an override
    expect(overridden.shape).toBe(fillingVisual("6D (Round)").shape);
    for (const row of rows.filter((r) => r.subtype !== "6D (Round)")) {
      expect(row.overridden).toBe(false);
      expect(row.color).toBe(fillingVisual(row.subtype).defaultColor);
    }
    expect(xrayColorVarStyle(overrides)).toEqual({ "--xray-fill-6d-round": "#112233" });
  });

  it("cleared override (row removed) restores the code default", () => {
    const cleared = effectiveFillingColors(SUBTYPES, []);
    const row = cleared.find((r) => r.subtype === "6D (Round)")!;
    expect(row.color).toBe(fillingVisual("6D (Round)").defaultColor);
    expect(row.overridden).toBe(false);
    // and the CSS variable disappears, so var(x, default) falls back
    expect(xrayColorVarStyle([])["--xray-fill-6d-round"]).toBeUndefined();
  });
});
