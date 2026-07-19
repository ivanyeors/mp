/**
 * Slice 05 — Filling configuration snapshot at hold create.
 * Maps to .claude/PRD-staff-assist-spatial-fillings/issues/05-hold-snapshot.md
 */
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { fingerprintPlacements, type PillowPlacement } from "@/lib/spatial-fillings";
import { buildFillingSnapshot } from "@/lib/results/filling-snapshot";

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

describe("hold route wiring (slice 05)", () => {
  const src = readFileSync("app/api/results/hold/route.ts", "utf8");

  it("staff-gates assist payloads and validates placements before any write", () => {
    expect(src).toContain("input.assistFilling");
    expect(src).toContain("getAdminContext");
    expect(src).toContain("validatePillowPlacements");
    expect(src.indexOf("getAdminContext()")).toBeLessThan(
      src.indexOf('from("result_filling_placements")'),
    );
  });

  it("snapshot is a copy: replace-inserts result rows via the decision fn; template read only pre-write", () => {
    expect(src).toContain("buildFillingSnapshot");
    expect(src).toContain('from("result_filling_placements")');
    // filling_template_placements is only read to verify the claim, before the snapshot write.
    expect(src.lastIndexOf('from("filling_template_placements")')).toBeLessThan(
      src.indexOf('from("result_filling_placements")'),
    );
  });
});
