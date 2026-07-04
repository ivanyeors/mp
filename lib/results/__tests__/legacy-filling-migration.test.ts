import { describe, it, expect } from "vitest";
import {
  bolsterLegacyFillingTemplateName,
  pillowLegacyFillingTemplateName,
} from "@/lib/results/legacy-filling-migration";

describe("legacy filling migration naming", () => {
  it("names pillow templates {size} - {tier} - default", () => {
    expect(pillowLegacyFillingTemplateName("S", "basic")).toBe("S - basic - default");
    expect(pillowLegacyFillingTemplateName("M", "premium")).toBe("M - premium - default");
  });

  it("names bolster templates {length} - default", () => {
    expect(bolsterLegacyFillingTemplateName("medium")).toBe("medium - default");
    expect(bolsterLegacyFillingTemplateName("short")).toBe("short - default");
  });
});
