import { describe, it, expect } from "vitest";
import {
  rankUnpromoted,
  verifyPromotedBolsterMix,
  verifyPromotedMix,
} from "@/lib/filling-templates/unpromoted";
import {
  fingerprintPlacements,
  rowsToBolsterPlacements,
  rowsToPillowPlacements,
  type BolsterPlacementRow,
  type PillowPlacementRow,
} from "@/lib/spatial-fillings";

const mixA: PillowPlacementRow[] = [
  { section: "left", sub_section: "front", slot: 1, item_id: 1 },
  { section: "left", sub_section: "front", slot: 2, item_id: 1 },
  { section: "center", sub_section: "middle", slot: 1, item_id: 2 },
];
const mixB: PillowPlacementRow[] = [{ section: "right", sub_section: "back", slot: 1, item_id: 3 }];

const fpA = fingerprintPlacements(rowsToPillowPlacements(mixA));
const fpB = fingerprintPlacements(rowsToPillowPlacements(mixB));

describe("rankUnpromoted", () => {
  const snapshots = [
    { resultId: "r1", fingerprint: fpA, scopeKey: "M" },
    { resultId: "r2", fingerprint: fpA, scopeKey: "M" },
    { resultId: "r3", fingerprint: fpA, scopeKey: "L" }, // other size — out of scope
    { resultId: "r4", fingerprint: fpB, scopeKey: "M" },
    { resultId: "r5", fingerprint: fpB, scopeKey: null }, // no size — out of scope
  ];

  it("counts two Results with the same diverged mix under the matching size only", () => {
    const ranked = rankUnpromoted({ snapshots, templateFingerprints: [], scope: { key: "M" } });
    expect(ranked).toEqual([
      { fingerprint: fpA, count: 2, representativeResultId: "r1" },
      { fingerprint: fpB, count: 1, representativeResultId: "r4" },
    ]);
  });

  it("scopes to the requested size", () => {
    const ranked = rankUnpromoted({ snapshots, templateFingerprints: [], scope: { key: "L" } });
    expect(ranked).toEqual([{ fingerprint: fpA, count: 1, representativeResultId: "r3" }]);
  });

  it("never lists mixes matching a catalog template (active or inactive)", () => {
    const ranked = rankUnpromoted({ snapshots, templateFingerprints: [fpA], scope: { key: "M" } });
    expect(ranked).toEqual([{ fingerprint: fpB, count: 1, representativeResultId: "r4" }]);
  });

  it("orders by count desc", () => {
    const ranked = rankUnpromoted({ snapshots, templateFingerprints: [], scope: { key: "M" } });
    expect(ranked.map((r) => r.count)).toEqual([2, 1]);
  });
});

describe("verifyPromotedMix (promote round-trip)", () => {
  it("accepts rows hashing to the fingerprint and returns the placement payload", () => {
    const result = verifyPromotedMix(mixA, fpA);
    expect(result).toEqual({ ok: true, placements: rowsToPillowPlacements(mixA) });
    // Slot order never changes the mix identity.
    expect(verifyPromotedMix([...mixA].reverse(), fpA).ok).toBe(true);
  });

  it("rejects when the mix vanished or diverged", () => {
    expect(verifyPromotedMix([], fpA).ok).toBe(false);
    expect(verifyPromotedMix(mixA, fpB).ok).toBe(false);
  });

  it("promoted fingerprint leaves the unpromoted list", () => {
    const snapshots = [
      { resultId: "r1", fingerprint: fpA, scopeKey: "M" },
      { resultId: "r2", fingerprint: fpA, scopeKey: "M" },
    ];
    const before = rankUnpromoted({ snapshots, templateFingerprints: [], scope: { key: "M" } });
    expect(before.map((r) => r.fingerprint)).toEqual([fpA]);
    // Promote copies the representative rows into a template; its fingerprint now matches.
    const promoted = fingerprintPlacements(rowsToPillowPlacements(mixA));
    const after = rankUnpromoted({
      snapshots,
      templateFingerprints: [promoted],
      scope: { key: "M" },
    });
    expect(after).toEqual([]);
  });
});

describe("bolster ranking + promote (slice 13: scope key = length, own schema)", () => {
  const bolsterRows: BolsterPlacementRow[] = [
    { slot: 1, item_id: 1 },
    { slot: 2, item_id: 1 },
    { slot: 7, item_id: 2 }, // no cap
  ];
  const fp = fingerprintPlacements(rowsToBolsterPlacements(bolsterRows));

  it("ranks bolster snapshots under length scope keys", () => {
    const snapshots = [
      { resultId: "b1", fingerprint: fp, scopeKey: "long" },
      { resultId: "b2", fingerprint: fp, scopeKey: "long" },
      { resultId: "b3", fingerprint: fp, scopeKey: "short" }, // other length — out of scope
    ];
    expect(rankUnpromoted({ snapshots, templateFingerprints: [], scope: { key: "long" } })).toEqual([
      { fingerprint: fp, count: 2, representativeResultId: "b1" },
    ]);
    // Catalog bolster template with the same mix suppresses the entry.
    expect(rankUnpromoted({ snapshots, templateFingerprints: [fp], scope: { key: "long" } })).toEqual(
      [],
    );
  });

  it("verifyPromotedBolsterMix round-trips slot-only rows (slot order irrelevant)", () => {
    expect(verifyPromotedBolsterMix(bolsterRows, fp)).toEqual({
      ok: true,
      placements: rowsToBolsterPlacements(bolsterRows),
    });
    expect(verifyPromotedBolsterMix([...bolsterRows].reverse(), fp).ok).toBe(true);
    expect(verifyPromotedBolsterMix([], fp).ok).toBe(false);
    expect(verifyPromotedBolsterMix(bolsterRows, fpA).ok).toBe(false);
  });
});
