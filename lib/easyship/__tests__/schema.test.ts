import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, EasyshipSettingsInputSchema, EasyshipSettingsSchema, keepMappedBoxes } from "@/lib/easyship/schema";

const box = (name: string) => ({ name, outer_length: 10, outer_width: 10, outer_height: 10, weight: 0 });

describe("box names", () => {
  it("refuses a save with repeated box names, but still reads one", () => {
    const doc = { ...DEFAULT_SETTINGS, boxes: [box("Pillow box"), box(" pillow BOX ")] };
    expect(EasyshipSettingsInputSchema.safeParse(doc).success).toBe(false);
    expect(EasyshipSettingsSchema.safeParse(doc).success).toBe(true);
    expect(EasyshipSettingsInputSchema.safeParse({ ...doc, boxes: [box("A"), box("B")] }).success).toBe(true);
  });
});

describe("keepMappedBoxes", () => {
  it("keeps local boxes a type maps to when the import lacks them, and drops unmapped ones", () => {
    const current = {
      boxes: [box("Pillow box"), box("Spare"), box("Live box")],
      box_for_type: { pillow: { box: "pillow box", weight_grams: 1500 }, bolster: { box: "Live box", weight_grams: 900 } },
    };
    const out = keepMappedBoxes(current, [box("Live Box"), box("Other")]);
    expect(out.boxes.map((b) => b.name)).toEqual(["Live Box", "Other", "Pillow box"]);
    expect(out.box_for_type).toBe(current.box_for_type);
  });
});
