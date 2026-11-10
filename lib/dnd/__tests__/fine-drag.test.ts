import { describe, expect, it } from "vitest";

import { BRISK_SPEED, CREEP_SPEED, drawingScale, FINE_GAIN, fineGain, holdSnap, moveFineDrag, PHONE_DRAWING_PX, snapsNow, startFineDrag, type FineDrag } from "@/lib/dnd/fine-drag";

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

describe("the same with a mouse on a desktop as with a finger on a phone", () => {
  it("reads a drawing's size against a phone's: 1 on a phone, never less, 2 at twice the width", () => {
    expect(drawingScale(PHONE_DRAWING_PX)).toBe(1);
    expect(drawingScale(300)).toBe(1);
    expect(drawingScale(PHONE_DRAWING_PX * 2)).toBe(2);
    expect(drawingScale(0)).toBe(1);
    expect(drawingScale(Number.NaN)).toBe(1);
  });

  it("a hand crossing the same share of the drawing as slowly creeps on both", () => {
    // A phone: 1 px a sample, 50 ms apart (20 px/s). A desktop drawing twice the size: 2 px a sample, as slow for it.
    const phone = run(30, 1, 50, startFineDrag([0, 0], [0, 0], 0, 1));
    const desktop = run(30, 2, 50, startFineDrag([0, 0], [0, 0], 0, 2));
    expect(snapsNow(phone)).toBe(false);
    expect(snapsNow(desktop)).toBe(false);
    // The filling keeps the same share of the pointer's travel on both.
    expect(desktop.at[0] / desktop.direct[0]).toBeCloseTo(phone.at[0] / phone.direct[0], 6);
    expect(phone.at[0] / phone.direct[0]).toBeLessThan(0.45);
  });

  it("a mouse at 100 px a second over a desktop's drawing twice a phone's creeps, as 50 px a second does on a phone", () => {
    const desktop = run(30, 1.6, 16, startFineDrag([0, 0], [0, 0], 0, 2)); // 0.1 screen px/ms
    expect(desktop.speed).toBeCloseTo(0.05, 2);
    expect(fineGain(desktop.speed)).toBeCloseTo(FINE_GAIN, 1);
    // Read in screen px, as before, the same hand was between a creep and a drag: barely fine at all.
    const asBefore = run(30, 1.6, 16, startFineDrag([0, 0], [0, 0], 0, 1));
    expect(fineGain(asBefore.speed)).toBeGreaterThan(0.4);
  });
});
