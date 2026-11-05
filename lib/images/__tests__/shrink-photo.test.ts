import { describe, expect, it } from "vitest";
import { fitWithin, SIZING_PHOTO_MAX_EDGE } from "@/lib/images/shrink-photo";

describe("fitWithin", () => {
  it("scales a phone photo down to the long-edge limit, keeping its shape", () => {
    expect(fitWithin(4032, 3024, SIZING_PHOTO_MAX_EDGE)).toEqual({ width: 2000, height: 1500 });
    expect(fitWithin(3024, 4032, SIZING_PHOTO_MAX_EDGE)).toEqual({ width: 1500, height: 2000 });
  });

  it("never scales a small photo up", () => {
    expect(fitWithin(1200, 900, SIZING_PHOTO_MAX_EDGE)).toEqual({ width: 1200, height: 900 });
  });

  it("keeps at least one pixel on a sliver", () => {
    expect(fitWithin(10_000, 2, 2000)).toEqual({ width: 2000, height: 1 });
  });
});
