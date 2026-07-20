/**
 * Slice 05 — Filling configuration snapshot at hold create.
 * Maps to .claude/PRD-staff-assist-spatial-fillings/issues/05-hold-snapshot.md
 */
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  fingerprintPlacements,
  type BolsterPlacement,
  type PillowPlacement,
} from "@/lib/spatial-fillings";
import {
  buildBolsterFillingSnapshot,
  buildFillingSnapshot,
} from "@/lib/results/filling-snapshot";

const mix: PillowPlacement[] = [
  { section: "left", subSection: "front", slot: 1, itemId: 11 },
  { section: "center", subSection: "middle", slot: 1, itemId: 12 },
  { section: "center", subSection: "middle", slot: 2, itemId: 12 },
];

describe("buildFillingSnapshot", () => {
  it("assist hold: copies the exact mix as rows and records the fingerprint", () => {
    const snap = buildFillingSnapshot({
      placements: mix,
      claimedTemplateId: null,
      templatePlacements: null,
    });
    expect(snap.rows).toEqual([
      { section: "left", sub_section: "front", slot: 1, item_id: 11 },
      { section: "center", sub_section: "middle", slot: 1, item_id: 12 },
      { section: "center", sub_section: "middle", slot: 2, item_id: 12 },
    ]);
    expect(snap.fingerprint).toBe(fingerprintPlacements(mix));
    expect(snap.fillingTemplateId).toBeNull();
  });

  it("template untouched: server-confirmed exact match sets filling_template_id", () => {
    // Same multiset per cell with different slot numbering still counts as untouched.
    const tpl: PillowPlacement[] = [
      { section: "left", subSection: "front", slot: 2, itemId: 11 },
      { section: "center", subSection: "middle", slot: 1, itemId: 12 },
      { section: "center", subSection: "middle", slot: 3, itemId: 12 },
    ];
    const snap = buildFillingSnapshot({
      placements: mix,
      claimedTemplateId: 7,
      templatePlacements: tpl,
    });
    expect(snap.fillingTemplateId).toBe(7);
    expect(snap.fingerprint).toBe(fingerprintPlacements(mix));
  });

  it("one diverging edit: template id cleared, snapshot rows + fingerprint intact", () => {
    const diverged: PillowPlacement[] = [
      ...mix,
      { section: "right", subSection: "back", slot: 1, itemId: 11 },
    ];
    const snap = buildFillingSnapshot({
      placements: diverged,
      claimedTemplateId: 7,
      templatePlacements: mix,
    });
    expect(snap.fillingTemplateId).toBeNull();
    expect(snap.rows).toHaveLength(4);
    expect(snap.fingerprint).toBe(fingerprintPlacements(diverged));
  });

  it("claimed template id alone is never trusted: empty catalog placements → id stays null", () => {
    const snap = buildFillingSnapshot({
      placements: mix,
      claimedTemplateId: 7,
      templatePlacements: [],
    });
    expect(snap.fillingTemplateId).toBeNull();
    expect(snap.rows).toHaveLength(3);
  });

  it("guest hold: no placements → the null snapshot (no rows, no fingerprint, no template)", () => {
    expect(
      buildFillingSnapshot({ placements: [], claimedTemplateId: 7, templatePlacements: mix }),
    ).toEqual({ rows: [], fingerprint: null, fillingTemplateId: null });
  });
});

describe("buildBolsterFillingSnapshot (slice 13: own schema, no cap, never pillow enums)", () => {
  const bolsterMix: BolsterPlacement[] = [
    { slot: 1, itemId: 11 },
    { slot: 2, itemId: 12 },
    { slot: 7, itemId: 12 }, // slot > 5 fine — no cap
  ];

  it("copies the mix as slot-only rows and records the fingerprint", () => {
    const snap = buildBolsterFillingSnapshot({
      placements: bolsterMix,
      claimedTemplateId: null,
      templatePlacements: null,
    });
    expect(snap.rows).toEqual([
      { slot: 1, item_id: 11 },
      { slot: 2, item_id: 12 },
      { slot: 7, item_id: 12 },
    ]);
    // Rows never carry the pillow Section/sub-section enums.
    for (const row of snap.rows) expect(Object.keys(row).sort()).toEqual(["item_id", "slot"]);
    expect(snap.fingerprint).toBe(fingerprintPlacements(bolsterMix));
    expect(snap.fillingTemplateId).toBeNull();
  });

  it("template id only on server-confirmed exact match; cleared on divergence", () => {
    const renumbered: BolsterPlacement[] = [
      { slot: 9, itemId: 12 },
      { slot: 3, itemId: 11 },
      { slot: 4, itemId: 12 },
    ];
    expect(
      buildBolsterFillingSnapshot({
        placements: bolsterMix,
        claimedTemplateId: 5,
        templatePlacements: renumbered,
      }).fillingTemplateId,
    ).toBe(5);
    expect(
      buildBolsterFillingSnapshot({
        placements: [...bolsterMix, { slot: 8, itemId: 11 }],
        claimedTemplateId: 5,
        templatePlacements: renumbered,
      }).fillingTemplateId,
    ).toBeNull();
  });

  it("guest hold: no placements → the null snapshot", () => {
    expect(
      buildBolsterFillingSnapshot({
        placements: [],
        claimedTemplateId: 5,
        templatePlacements: bolsterMix,
      }),
    ).toEqual({ rows: [], fingerprint: null, fillingTemplateId: null });
  });
});

describe("hold route wiring (slices 05/13)", () => {
  const src = readFileSync("app/api/results/hold/route.ts", "utf8");

  it("staff-gates assist payloads and validates per kind before any write", () => {
    expect(src).toContain("input.assistFilling");
    expect(src).toContain("getAdminContext");
    expect(src).toContain("validatePillowPlacements");
    expect(src).toContain("validateBolsterPlacements");
    expect(src.indexOf("getAdminContext()")).toBeLessThan(src.indexOf("from(snapshotTable)"));
  });

  it("snapshot is a copy: replace-inserts result rows per product table; template read only pre-write", () => {
    expect(src).toContain("buildFillingSnapshot");
    expect(src).toContain("buildBolsterFillingSnapshot");
    expect(src).toContain('"result_filling_placements"');
    expect(src).toContain('"result_bolster_filling_placements"');
    // Template placements are only read to verify the claim, before the snapshot write.
    expect(src.lastIndexOf('from("filling_template_placements")')).toBeLessThan(
      src.indexOf("from(snapshotTable)"),
    );
    expect(src.lastIndexOf('from("bolster_template_placements")')).toBeLessThan(
      src.indexOf("from(snapshotTable)"),
    );
  });
});
