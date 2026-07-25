import { describe, it, expect } from "vitest";
import { chunkItems } from "@/app/api/mp-config/responses/route";

describe("chunkItems", () => {
  it("splits into groups of ≤10 without dropping items (the >10 case)", () => {
    const items = Array.from({ length: 12 }, (_, i) => i);
    const chunks = chunkItems(items, 10);
    expect(chunks.map((c) => c.length)).toEqual([10, 2]);
    expect(chunks.flat()).toEqual(items); // order preserved, nothing dropped
  });

  it("returns a single chunk when at/under the cap and empty for none", () => {
    expect(chunkItems([1, 2], 10)).toEqual([[1, 2]]);
    expect(chunkItems([], 10)).toEqual([]);
  });
});
