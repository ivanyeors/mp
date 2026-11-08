import { describe, expect, it } from "vitest";

import { BRISK_SPEED, CREEP_SPEED, FINE_GAIN, fineGain, holdSnap, moveFineDrag, snapsNow, startFineDrag, type FineDrag } from "@/lib/dnd/fine-drag";

/** Drive a drag along x: `px` screen pixels per sample, `ms` apart, one view unit per pixel. */
function run(samples: number, px: number, ms: number, from: FineDrag = startFineDrag([0, 0], [0, 0], 0)) {
  let d = from;
  for (let i = 1; i <= samples; i++) {
    const x = d.client[0] + px;
    d = moveFineDrag(d, [d.direct[0] + px, d.direct[1]], [x, 0], d.t + ms);
  }
  return d;
}

describe("fine drag: slowing down is the fine control", () => {
  it("gains FINE_GAIN when creeping, 1 when brisk, straight between", () => {
    expect(fineGain(0)).toBe(FINE_GAIN);
    expect(fineGain(CREEP_SPEED)).toBe(FINE_GAIN);
    expect(fineGain(BRISK_SPEED)).toBe(1);
    expect(fineGain(2)).toBe(1);
    const mid = fineGain((CREEP_SPEED + BRISK_SPEED) / 2);
    expect(mid).toBeGreaterThan(FINE_GAIN);
    expect(mid).toBeLessThan(1);
  });

  it("follows a brisk hand one to one", () => {
    const d = run(20, 10, 16); // 0.6 px/ms
    expect(d.at[0]).toBeCloseTo(d.direct[0], 0);
    expect(snapsNow(d)).toBe(true);
  });

  it("never trails an ordinary drag: at 150 px a second it stays within a few px of the pointer", () => {
    const d = run(40, 2.4, 16); // 0.15 px/ms, 96 px
    expect(d.direct[0] - d.at[0]).toBeLessThan(6);
  });

  it("moves a creeping hand's filling a fraction of the way, so a millimetre is easy", () => {
    const d = run(30, 1, 50); // 0.02 px/ms: 30 px of travel
    expect(d.at[0]).toBeLessThan(30 * 0.45);
    expect(d.at[0]).toBeGreaterThan(30 * FINE_GAIN * 0.9);
    expect(snapsNow(d)).toBe(false);
  });

  it("draws the filling back under the pointer once the hand moves briskly again", () => {
    const crept = run(30, 1, 50);
    const gap = crept.direct[0] - crept.at[0];
    expect(gap).toBeGreaterThan(15);
    const caught = run(10, 12, 16, crept);
    expect(caught.direct[0] - caught.at[0]).toBeLessThan(gap * 0.1);
  });

  it("holdSnap: creeping on from where a snap put it", () => {
    const d = holdSnap(run(5, 10, 16), [42, 0]);
    expect(d.at).toEqual([42, 0]);
    const next = moveFineDrag(d, [d.direct[0] + 1, 0], [d.client[0] + 1, 0], d.t + 200);
    expect(next.at[0]).toBeCloseTo(42 + FINE_GAIN, 6);
  });
});
