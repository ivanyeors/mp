import { describe, it, expect } from "vitest";
import { restockQuantityAllowed } from "../restock-order";

describe("restockQuantityAllowed", () => {
  it("allows restock within sold quantity", () => {
    expect(restockQuantityAllowed(3, 0, 2)).toBe(true);
    expect(restockQuantityAllowed(3, 2, 1)).toBe(true);
  });

  it("rejects restock beyond sold quantity", () => {
    expect(restockQuantityAllowed(3, 2, 2)).toBe(false);
    expect(restockQuantityAllowed(1, 1, 1)).toBe(false);
  });

  it("rejects non-positive quantities", () => {
    expect(restockQuantityAllowed(3, 0, 0)).toBe(false);
    expect(restockQuantityAllowed(3, 0, -1)).toBe(false);
  });
});
