import { describe, expect, it } from "vitest";
import {
  fittingNeck,
  fittingSize,
  fittingTypeCode,
  matchFittingTemplate,
  pillowSizeKey,
  templateType,
  type MatchableTemplate,
} from "../match";
import { matchNotices } from "../notices";

const CATALOG: MatchableTemplate[] = [
  { id: 57, name: "Type-12", keys: ["L"] },
  { id: 59, name: "Type-12", keys: ["XL"] },
  { id: 74, name: "Type-8a", keys: ["S"] },
  { id: 77, name: "Type-8a", keys: ["M"] },
  { id: 91, name: "Type-8a (Short Neck)", keys: ["S"] },
  { id: 75, name: "Type-9", keys: ["S", "M"] },
  { id: 97, name: "Type-9A", keys: ["M"] },
  { id: 98, name: "Type-9A (Short Neck)", keys: ["M"] },
  { id: 61, name: "XL - basic - default", keys: ["XL"] },
];

const fitting = (recommendedSize: string | null, configurationType: string | null, profileSide: string | null) => ({
  recommendedSize,
  configurationType,
  profileSide,
});

describe("reading the form's codes", () => {
  it("reads a configuration type with or without its T, in any case", () => {
    expect(fittingTypeCode("T12")).toBe("12");
    expect(fittingTypeCode("12")).toBe("12");
    expect(fittingTypeCode("t8a")).toBe("8A");
    expect(fittingTypeCode(" 7A ")).toBe("7A");
    expect(fittingTypeCode("T06A")).toBe("6A");
    expect(fittingTypeCode("-")).toBeNull();
    expect(fittingTypeCode("")).toBeNull();
    expect(fittingTypeCode(null)).toBeNull();
  });

  it("reads a template's type and neck from its name, and nothing from a name not in that form", () => {
    expect(templateType("Type-12")).toEqual({ code: "12", shortNeck: false });
    expect(templateType("Type-11a (Short Neck)")).toEqual({ code: "11A", shortNeck: true });
    expect(templateType("Type-9A")).toEqual({ code: "9A", shortNeck: false });
    expect(templateType("XL - basic - default")).toBeNull();
    expect(templateType("Side sleeper with ear pads")).toBeNull();
  });

  it("reads the neck off the profile side", () => {
    expect(fittingNeck("S-SN")).toBe("short");
    expect(fittingNeck("Xs-Sn")).toBe("short");
    expect(fittingNeck("M-LN")).toBe("long");
    expect(fittingNeck("L-Ln")).toBe("long");
    expect(fittingNeck("L")).toBeNull();
    expect(fittingNeck("-")).toBeNull();
    expect(fittingNeck(null)).toBeNull();
  });

  it("reads the size, falling back to the profile side's when the size is not one", () => {
    expect(pillowSizeKey("xs")).toBe("XS");
    expect(pillowSizeKey("Returned")).toBeNull();
    expect(fittingSize({ recommendedSize: "M", profileSide: "S-LN" })).toBe("M");
    expect(fittingSize({ recommendedSize: "?", profileSide: "Xs-Ln" })).toBe("XS");
    expect(fittingSize({ recommendedSize: null, profileSide: null })).toBeNull();
  });
});

describe("matching a fitting to a Filling Template", () => {
  it("takes the template of its type serving its size, in its neck variant", () => {
    const m = matchFittingTemplate(fitting("S", "T8A", "S-LN"), CATALOG);
    expect(m).toMatchObject({ size: "S", code: "8A", neck: "long", otherSize: false, otherNeck: false });
    expect(m.template?.id).toBe(74);
    expect(matchNotices(m)).toEqual([]);
  });

  it("takes the Short Neck variant for a short neck", () => {
    expect(matchFittingTemplate(fitting("S", "8a", "S-SN"), CATALOG).template?.id).toBe(91);
    expect(matchFittingTemplate(fitting("M", "T9A", "M-SN"), CATALOG).template?.id).toBe(98);
  });

  it("never mistakes 8 for 8a, or 9 for 9A", () => {
    expect(matchFittingTemplate(fitting("M", "T9", "M-LN"), CATALOG).template?.id).toBe(75);
    expect(matchFittingTemplate(fitting("M", "T8", "M-LN"), CATALOG).template).toBeNull();
  });

  it("takes the nearest size's template when none of its type serves the size, and says so", () => {
    const m = matchFittingTemplate(fitting("S", "T12", "S-LN"), CATALOG);
    expect(m.template?.id).toBe(57);
    expect(m.otherSize).toBe(true);
    expect(matchNotices(m)).toEqual([
      "Type-12 serves L, not S, so it is drawn at S. Add S to its sizes in Configure, or link another template.",
    ]);
  });

  it("takes the standard variant when its type has no Short Neck one, and says so", () => {
    const m = matchFittingTemplate(fitting("L", "T12", "L-SN"), CATALOG);
    expect(m.template?.id).toBe(57);
    expect(m.otherNeck).toBe(true);
    expect(matchNotices(m)).toEqual(["There is no Short Neck Type-12, so the standard one is shown."]);
  });

  it("takes the standard variant when no neck was recorded, without claiming a fallback", () => {
    const m = matchFittingTemplate(fitting("M", "T9A", null), CATALOG);
    expect(m.template?.id).toBe(97);
    expect(m.otherNeck).toBe(false);
  });

  it("draws at M, the reference Size, when no size was recorded", () => {
    const m = matchFittingTemplate(fitting("Returned", "T8A", "-"), CATALOG);
    expect(m.size).toBeNull();
    expect(m.template?.id).toBe(77);
    expect(matchNotices(m)).toEqual(["The fitting recorded no pillow size, so it is drawn at M."]);
  });

  it("matches nothing for a type no template has, or a fitting with no type", () => {
    const unknown = matchFittingTemplate(fitting("M", "15A", "M-LN"), CATALOG);
    expect(unknown).toMatchObject({ size: "M", code: "15A", template: null });
    expect(matchNotices(unknown)).toEqual(["No active Filling Template is named Type-15A, so no filling is drawn."]);

    const none = matchFittingTemplate(fitting("S", null, "S-LN"), CATALOG);
    expect(none).toMatchObject({ size: "S", code: null, template: null });
    expect(matchNotices(none)).toEqual(["The fitting recorded no configuration type, so no filling is drawn."]);
  });

  it("breaks a tie between two sizes the same distance away by the lower id", () => {
    const tie: MatchableTemplate[] = [
      { id: 2, name: "Type-5", keys: ["L"] },
      { id: 1, name: "Type-5", keys: ["S"] },
    ];
    expect(matchFittingTemplate(fitting("M", "T5", "M-LN"), tie).template?.id).toBe(1);
  });
});
