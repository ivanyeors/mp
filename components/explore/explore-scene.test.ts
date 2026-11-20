import { describe, expect, it } from "vitest";
import { drawingRatio } from "@/components/explore/explore-scene";

describe("drawingRatio", () => {
  it("draws a laptop's screen at its full density", () => {
    expect(drawingRatio(1470, 956, 2, false)).toBe(2);
    expect(drawingRatio(1440, 900, 1, false)).toBe(1);
  });

  it("draws a phone at 2 at most, whatever its density", () => {
    expect(drawingRatio(393, 852, 3, false)).toBe(2);
  });

  it("keeps a big screen near the budget instead of 2.5 times over it", () => {
    const r = drawingRatio(2560, 1440, 2, false);
    expect(r).toBeLessThan(1.3);
    expect(2560 * r * 1440 * r).toBeCloseTo(6_000_000, -3);
  });

  it("never draws softer than the CSS pixels to stay under the budget", () => {
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
