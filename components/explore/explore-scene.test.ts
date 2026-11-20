import { describe, expect, it } from "vitest";
import { drawingRatio } from "@/components/explore/explore-scene";

describe("drawingRatio", () => {
  it("draws a laptop's screen at its full density", () => {
    // A 13 inch MacBook Air: 5.6 million device pixels, under the budget.
    expect(drawingRatio(1470, 956, 2, false)).toBe(2);
    expect(drawingRatio(1440, 900, 1, false)).toBe(1);
  });

  it("draws a phone at 2 at most, whatever its density", () => {
    expect(drawingRatio(393, 852, 3, false)).toBe(2);
  });

  it("keeps a big screen near the budget instead of 2.5 times over it", () => {
    // A 5K display: 2560 x 1440 at 2 would be 14.7 million pixels.
    const r = drawingRatio(2560, 1440, 2, false);
    expect(r).toBeLessThan(1.3);
    expect(2560 * r * 1440 * r).toBeCloseTo(6_000_000, -3);
  });

  it("never draws softer than the CSS pixels to stay under the budget", () => {
    // A 4K screen at 100%: 8.3 million pixels, over the budget, but not drawn below 1.
    expect(drawingRatio(3840, 2160, 1, false)).toBe(1);
  });

  it("follows a zoomed-out page below 1", () => {
    expect(drawingRatio(1440, 900, 0.5, false)).toBe(0.5);
  });

  it("draws one pixel per CSS pixel while the window is being resized", () => {
    expect(drawingRatio(1470, 956, 2, true)).toBe(1);
    expect(drawingRatio(1440, 900, 0.5, true)).toBe(0.5);
  });
});
