import { describe, expect, it } from "vitest";
import { shareLabel } from "@/lib/format/share";

describe("shareLabel", () => {
  it("never says 0% of some, nor 100% of not all", () => {
    expect(shareLabel(0, 10)).toBe("0%");
    expect(shareLabel(1, 0)).toBe("0%");
    expect(shareLabel(1, 2158)).toBe("<1%");
    expect(shareLabel(2157, 2158)).toBe(">99%");
    expect(shareLabel(10, 10)).toBe("100%");
    expect(shareLabel(1, 3)).toBe("33%");
  });
});
