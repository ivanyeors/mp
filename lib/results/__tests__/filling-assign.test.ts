/**
 * Slice 06 — Admin Panel Result assign goes spatial.
 * Maps to .claude/PRD-staff-assist-spatial-fillings/issues/06-assign-spatial.md
 */
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { transitionResult } from "@/lib/result-lifecycle";
import { decideFillingAssign } from "@/lib/results/filling-assign";
import type { PillowPlacement } from "@/lib/spatial-fillings";

const template: PillowPlacement[] = [
  { section: "left", subSection: "front", slot: 1, itemId: 1 },
  { section: "left", subSection: "front", slot: 2, itemId: 2 },
  { section: "center", subSection: "middle", slot: 1, itemId: 3 },
];

describe("slice 06 — divergence clears filling_template_id", () => {
  it("keeps the id while the snapshot exactly matches (slot numbering ignored)", () => {
    const reordered: PillowPlacement[] = [
      { section: "center", subSection: "middle", slot: 4, itemId: 3 },
      { section: "left", subSection: "front", slot: 1, itemId: 2 },
      { section: "left", subSection: "front", slot: 3, itemId: 1 },
    ];
    const decision = decideFillingAssign({
      confirmedTemplateId: 7,
      saved: reordered,
      templatePlacements: template,
    });
    expect(decision.fillingTemplateId).toBe(7);
    expect(decision.fillingFingerprint).toEqual(expect.any(String));
  });

  it("AC1: tweaking one cell clears the id; the snapshot still fingerprints", () => {
    const tweaked: PillowPlacement[] = [
      template[0],
      { ...template[1], itemId: 9 },
      template[2],
    ];
    const decision = decideFillingAssign({
      confirmedTemplateId: 7,
      saved: tweaked,
      templatePlacements: template,
    });
    expect(decision.fillingTemplateId).toBeNull();
    expect(decision.fillingFingerprint).toEqual(expect.any(String));
  });

  it("legacy flat template (no placements): spatial save diverges, empty save matches", () => {
    const spatial = decideFillingAssign({
      confirmedTemplateId: 7,
      saved: [template[0]],
      templatePlacements: [],
    });
    expect(spatial.fillingTemplateId).toBeNull();

    const empty = decideFillingAssign({
      confirmedTemplateId: 7,
      saved: [],
      templatePlacements: [],
    });
    expect(empty.fillingTemplateId).toBe(7);
    expect(empty.fillingFingerprint).toBeNull();
  });
});

describe("slice 06 — Accept/Decline retain the snapshot", () => {
  it("Decline transitions without touching filling fields; hold released, no capture", () => {
    const life = transitionResult(
      // Diverged custom mix: filling_template_id already null, snapshot rows persist.
      { status: "assigned", filling_template_id: null, payment_intent_id: "pi_1" },
      { action: "decline" },
    );
    expect(life).toEqual({ ok: true, status: "declined", releaseHold: true });
  });

  it("Accept transitions for a custom mix too (capture stays Accept-only)", () => {
    const life = transitionResult(
      { status: "assigned", filling_template_id: null, payment_intent_id: "pi_1" },
      { action: "accept" },
    );
    expect(life).toEqual({ ok: true, status: "accepted", releaseHold: false });
  });

  it("AC3: neither route deletes result_filling_placements or the fingerprint", () => {
    const decline = readFileSync("app/api/results/[id]/decline/route.ts", "utf8");
    const accept = readFileSync("app/api/results/[id]/accept/route.ts", "utf8");
    expect(decline).not.toMatch(/result_filling_placements|filling_fingerprint/);
    expect(accept).not.toMatch(/result_filling_placements|filling_fingerprint/);
    // Capture is Accept-only.
    expect(accept).toContain("captureHold");
    expect(decline).not.toContain("captureHold");
  });
});
