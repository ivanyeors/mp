import { describe, expect, it } from "vitest";
import type { FittingAnswersView } from "@/lib/fitting-import/view";
import type { PillowPlacementRow } from "@/lib/spatial-fillings/core";
import { customerFacingPillow } from "../view";
import type { FittingTemplateMatch } from "../match";
import { buildPillowSheet, pillowGuideOffered } from "../sheet";
import type { CustomerPillowView } from "../view";

const row = (section: string, sub_section: string, slot: number, item_id: number, over: Partial<PillowPlacementRow> = {}): PillowPlacementRow => ({
  section,
  sub_section,
  slot,
  item_id,
  row_index: null,
  insert_order: null,
  offset_x_mm: null,
  offset_y_mm: null,
  ...over,
});

const items = [
  { id: 1, name: "6D Small", subtype: "6D", size: "S", category: "fillings" },
  { id: 2, name: "6D+ Small", subtype: "6D+", size: "S", category: "fillings" },
  { id: 3, name: "Cervical neck support", subtype: null, size: "L", category: "accessories" },
];

function view(placements: PillowPlacementRow[], over: Partial<CustomerPillowView> = {}): CustomerPillowView {
  return {
    source: "linked",
    size: "S",
    template: { id: 12, name: "Type-12", keys: ["S"] },
    link: { linkedAt: "2026-11-21T03:00:00.000Z", linkedBy: "Staffer Ivan", readjusted: true },
    order: null,
    fitting: { id: "f-new", fittedAt: "2026-10-15T02:00:00.000Z", label: "Mpillow S · T12 · S-SN" },
    match: null,
    placements,
    items,
    colorOverrides: [{ subtype: "6D", color: "#3b82f6" }],
    dimensionOverrides: undefined,
    templates: [],
    ownership: "linked",
    onProfile: false,
    ...over,
  } as CustomerPillowView;
}

function fitting(id: string, fittedAt: string, over: Partial<FittingAnswersView> = {}): FittingAnswersView {
  return {
    id,
    fittedAt,
    shoulderLengthIn: null,
    neckToBackIn: null,
    headToBackIn: null,
    neckLengthIn: null,
    recommendedSize: null,
    configurationType: null,
    profileSide: null,
    sleeperType: null,
    sleepSymptoms: [],
    bloodPressure: "High",
    acidReflux: true,
    earDiscomfortSideSleep: null,
    bedFirmness: null,
    usesBolster: null,
    ageGroup: "40-49",
    gender: null,
    discoverySource: null,
    referredBy: "A friend called Referrer Ng",
    servicedBy: "Staffer Ivan",
    notes: "Private staff note",
    otherAnswers: [],
    ...over,
  };
}

const sheetOf = (placements: PillowPlacementRow[], fittings: FittingAnswersView[] = [], over: Partial<CustomerPillowView> = {}) => {
  const own = customerFacingPillow(view(placements, over));
  if (!own) throw new Error("expected a customer-facing pillow");
  return buildPillowSheet({
    pillow: own,
    customer: { first_name: "Mei Ling", last_name: "Tan" },
    fittings,
    origin: "https://www.mpillow.com/",
    now: new Date("2026-11-21T04:00:00.000Z"),
  });
};

describe("buildPillowSheet", () => {
  it("lists a Section's steps in its insert order, not its slot order", () => {
    const sheet = sheetOf([
      row("center", "front", 1, 1, { insert_order: 3 }),
      row("center", "middle", 1, 2, { insert_order: 1 }),
      row("center", "back", 1, 3, { insert_order: 2 }),
    ]);
    const center = sheet.sections.find((s) => s.section === "center")!;
    expect(center.ordered).toBe(true);
    expect(center.steps.map((s) => s.label)).toEqual(["6D+ S", "Cervical neck support L", "6D S"]);
    expect(center.steps.map((s) => s.where)).toEqual(["Middle", "Back", "Front"]);
  });

  it("says a Section with no insert order is unordered, read front to back", () => {
    const sheet = sheetOf([row("left", "back", 1, 1), row("left", "front", 1, 2)]);
    const left = sheet.sections.find((s) => s.section === "left")!;
    expect(left.ordered).toBe(false);
    expect(left.steps.map((s) => s.where)).toEqual(["Front", "Back"]);
    expect(sheet.sections.find((s) => s.section === "right")!.steps).toEqual([]);
  });

  it("names the layer only where a cell is stacked", () => {
    const sheet = sheetOf([
      row("left", "back", 1, 1, { row_index: 0, insert_order: 1 }),
      row("left", "back", 2, 1, { row_index: 1, insert_order: 2 }),
      row("left", "front", 1, 1, { insert_order: 3 }),
    ]);
    expect(sheet.sections[0].steps.map((s) => s.where)).toEqual(["Back · layer 1", "Back · layer 2", "Front"]);
  });

  it("colours each filling as the x-ray does, Configure's colour first", () => {
    const sheet = sheetOf([row("left", "front", 1, 1), row("left", "middle", 1, 1), row("center", "back", 1, 3)]);
    expect(sheet.fillings).toEqual([
      { label: "6D S", color: "#3b82f6", count: 2 },
      { label: "Cervical neck support L", color: "#34d399", count: 1 },
    ]);
    expect(sheet.pieces).toBe(3);
  });

  it("takes the measurements from the latest fitting that has any", () => {
    const sheet = sheetOf(
      [row("left", "front", 1, 1)],
      [
        fitting("f-old", "2024-02-01T02:00:00.000Z", { shoulderLengthIn: 14, recommendedSize: "M" }),
        fitting("f-empty", "2026-11-01T02:00:00.000Z"),
        fitting("f-new", "2026-10-15T02:00:00.000Z", {
          shoulderLengthIn: 15.5,
          neckToBackIn: 2.75,
          neckLengthIn: 4.25,
          recommendedSize: "S",
          configurationType: "T12",
          profileSide: "S-SN",
        }),
      ],
    );
    expect(sheet.fitting?.fittedOn).toBe("15 October 2026");
    expect(sheet.fitting?.measurements.map((m) => `${m.letter} ${m.value}`)).toEqual(["A 15.5 in", "B 2.75 in", "C —", "D 4.25 in"]);
    expect(sheet.fitting?.facts).toEqual([
      ["Recommended size", "S"],
      ["Configuration type", "T12"],
      ["Profile side", "S-SN"],
    ]);
  });

  it("lets the last of two overrides for one filling win, as the x-ray does, however it is spelt", () => {
    const sheet = sheetOf([row("left", "front", 1, 1)], [], {
      colorOverrides: [
        { subtype: "6D", color: "#111111" },
        { subtype: "6d", color: "#3b82f6" },
      ],
    });
    expect(sheet.fillings[0].color).toBe("#3b82f6");
  });

  it("offers the guide only for a pillow known exactly, never for the nearest template to a fitting", () => {
    const rows = [row("left", "front", 1, 1)];
    const exact: FittingTemplateMatch = { size: "S", code: "12", neck: "long", template: { id: 12, name: "Type-12", keys: ["S"] }, otherSize: false, otherNeck: false };
    const fitted = (match: FittingTemplateMatch) => view(rows, { source: "fitting", link: null, match });
    expect(pillowGuideOffered(view(rows))).toBe(true);
    expect(pillowGuideOffered(fitted(exact))).toBe(true);
    expect(pillowGuideOffered(fitted({ ...exact, otherSize: true }))).toBe(false);
    expect(pillowGuideOffered(fitted({ ...exact, neck: "short", otherNeck: true }))).toBe(false);
    expect(pillowGuideOffered(view([]))).toBe(false);
    expect(pillowGuideOffered(view(rows, { source: "none", link: null }))).toBe(false);
  });

  it("has no fitting block when no fitting recorded anything", () => {
    expect(sheetOf([row("left", "front", 1, 1)], [fitting("f-empty", "2026-11-01T02:00:00.000Z")]).fitting).toBeNull();
  });

  it("carries nothing Staff-only: no staff name, notes, referrer or health answers", () => {
    const sheet = sheetOf(
      [row("left", "front", 1, 1)],
      [fitting("f-new", "2026-10-15T02:00:00.000Z", { shoulderLengthIn: 15.5, sleeperType: "Side" })],
    );
    const text = JSON.stringify(sheet);
    for (const secret of ["Staffer Ivan", "Private staff note", "Referrer Ng", "High", "40-49"]) {
      expect(text).not.toContain(secret);
    }
  });

  it("tells the pillow's story the way the Profile does, and names the file for the customer", () => {
    const sheet = sheetOf([row("left", "front", 1, 1)]);
    expect(sheet.story).toBe("What's inside your pillow, section by section, as we re-adjusted it on 21 November 2026.");
    expect(sheet.customerName).toBe("Mei Ling Tan");
    expect(sheet.fileName).toBe("mpillow-guide-mei-ling-tan.pdf");
    expect(sheet.pillowName).toBe("Type-12");
    expect(sheet.links.care).toEqual({ href: "https://www.mpillow.com/mp-care", text: "mpillow.com/mp-care" });
  });

  it("leaves off a name the PDF font cannot print, and keeps an accented one", () => {
    const own = customerFacingPillow(view([row("left", "front", 1, 1)]))!;
    const named = (first_name: string, last_name: string | null) =>
      buildPillowSheet({ pillow: own, customer: { first_name, last_name }, fittings: [], origin: "https://mpillow.com", now: new Date() });
    expect(named("美玲", "陈").customerName).toBeNull();
    expect(named("美玲", "陈").fileName).toBe("mpillow-guide.pdf");
    expect(named("Zoë", "O’Neil").customerName).toBe("Zoë O’Neil");
  });

  it("calls a pillow with no template a custom mix", () => {
    const own = sheetOf([row("left", "front", 1, 1)], [], { template: null });
    expect(own.pillowName).toBe("Custom mix");
  });
});
