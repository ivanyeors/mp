import { describe, expect, it } from "vitest";

import { LOFT_ALLOWANCE, POUCH_FAMILY_FALLBACKS, resolveDims } from "../dimensions";
import {
  effectiveRegistry,
  loftAllowance,
  neckCatalog,
  pouchCatalog,
  POUCH_CATALOG,
  type DimensionOverrideRow,
} from "../dimension-overrides";

const row = (key: string, extra: Partial<DimensionOverrideRow> = {}): DimensionOverrideRow => ({
  key,
  width_mm: 210,
  length_mm: 150,
  thickness_mm: 50,
  min_thickness_mm: 28,
  min_width_mm: 180,
  orientation: "across",
  updated_at: "2026-10-01T08:00:00Z",
  ...extra,
});

describe("loftAllowance", () => {
  it("defaults, parses whole percentages and clamps", () => {
    expect(loftAllowance(undefined)).toBe(LOFT_ALLOWANCE);
    expect(loftAllowance(null)).toBe(LOFT_ALLOWANCE);
    expect(loftAllowance("")).toBe(LOFT_ALLOWANCE);
    expect(loftAllowance("25")).toBe(0.25);
    expect(loftAllowance(12)).toBe(0.12);
    expect(loftAllowance("abc")).toBe(LOFT_ALLOWANCE);
    expect(loftAllowance("-5")).toBe(LOFT_ALLOWANCE);
    expect(loftAllowance("90")).toBe(0.5);
  });
});

describe("effectiveRegistry", () => {
  it("lets a row win over the code value and reports it as configured", () => {
    const registry = effectiveRegistry([row("6d/l")], [], "15");
    const r = resolveDims({ name: "filling", subtype: "6D (L)" }, registry);
    expect(r).toMatchObject({ source: "configured", dims: { widthMm: 210, minWidthMm: 180 }, measuredOn: "2026-10-01" });
    expect(registry.loftAllowance).toBe(0.15);
  });

  it("leaves a key with no row on the code value and an unknown key on its family fallback", () => {
    const registry = effectiveRegistry([row("6d/l")], [], null);
    expect(resolveDims({ name: "filling", subtype: "6D (S)" }, registry)).toMatchObject({
      source: "fallback",
      dims: { widthMm: POUCH_FAMILY_FALLBACKS["6d"].widthMm },
    });
    expect(resolveDims({ name: "6D Fold", size: "M" }, registry).source).toBe("fallback");
  });

  it("applies a size-less row to every size of that variant and carries the fabric limits", () => {
    const registry = effectiveRegistry([row("6d/folded", { flat_length_mm: 260 })], [], null);
    const r = resolveDims({ name: "6D Fold", size: "L" }, registry);
    expect(r).toMatchObject({ key: "6d/folded/l", source: "configured", dims: { flatLengthMm: 260 } });
    expect(r.dims.flatWidthMm).toBeUndefined();
  });

  it("reads a legacy along row with width and length swapped", () => {
    const registry = effectiveRegistry(
      [row("6d/folded", { orientation: "along", width_mm: 200, length_mm: 100, min_width_mm: 150, flat_width_mm: 260 })],
      [],
      null,
    );
    expect(registry.pouches["6d/folded"]).toMatchObject({ widthMm: 100, lengthMm: 200, minWidthMm: 75, flatLengthMm: 260 });
    expect(registry.pouches["6d/folded"].flatWidthMm).toBeUndefined();
  });

  it("applies Neck support rows per size and ignores a size outside XS–L", () => {
    const registry = effectiveRegistry(
      [],
      [
        { size: "S", width_mm: 280, length_mm: 80, thickness_mm: 45, min_thickness_mm: 25, updated_at: "2026-10-02T00:00:00Z" },
        { size: "XL" as never, width_mm: 1, length_mm: 1, thickness_mm: 1, min_thickness_mm: 1 },
      ],
      null,
    );
    expect(resolveDims({ name: "Cervical Neck Support", category: "accessories", size: "S" }, registry)).toMatchObject({
      source: "configured",
      dims: { widthMm: 280, thicknessMm: 45, minThicknessMm: 25 },
    });
    expect(resolveDims({ name: "Cervical Neck Support", category: "accessories", size: "M" }, registry).source).toBe("fallback");
    expect(Object.keys(registry.neck)).toEqual(["S"]);
  });
});

describe("catalogues", () => {
  it("lists every intake pouch with its status, plus live keys the catalogue lacks", () => {
    const registry = effectiveRegistry([row("6d/l")], [], null);
    const rows = pouchCatalog(registry, ["6d/l", "latex/sheet", "neck/m", "6d/s"]);
    expect(rows.map((r) => r.key)).toEqual([...POUCH_CATALOG.map((c) => c.key), "latex/sheet"]);
    expect(rows.find((r) => r.key === "6d/l")).toMatchObject({ source: "configured", measuredOn: "2026-10-01" });
    expect(rows.find((r) => r.key === "6d/s")).toMatchObject({ source: "unmeasured", measuredOn: null });
    expect(rows.find((r) => r.key === "latex/sheet")).toMatchObject({ source: "unmeasured", label: "latex/sheet" });
  });

  it("lists the four Neck support sizes", () => {
    const rows = neckCatalog(effectiveRegistry([], [{ size: "L", width_mm: 320, length_mm: 90, thickness_mm: 55, min_thickness_mm: 30 }], null));
    expect(rows.map((r) => r.size)).toEqual(["XS", "S", "M", "L"]);
    expect(rows[3]).toMatchObject({ source: "configured", dims: { lengthMm: 320, radiusMm: 27.5, minRadiusMm: 15 } });
    expect(rows[0].source).toBe("unmeasured");
  });
});
