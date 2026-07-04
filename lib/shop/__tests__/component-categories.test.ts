import { describe, it, expect } from "vitest";
import {
  toComponentRole,
  isCaseInventoryCategory,
  isProtectorInventoryCategory,
  itemMatchesPreferenceRole,
} from "@/lib/shop/customization-inventory";

describe("inventory component categories", () => {
  it("maps pillow_case / bolster_case to preference role case", () => {
    expect(toComponentRole("pillow_case")).toBe("case");
    expect(toComponentRole("bolster_case")).toBe("case");
    expect(toComponentRole("case")).toBe("case");
    expect(toComponentRole("cover")).toBe("cover");
  });

  it("maps pillow_protector / bolster_protector to protector", () => {
    expect(toComponentRole("pillow_protector")).toBe("protector");
    expect(toComponentRole("bolster_protector")).toBe("protector");
  });

  it("recognizes inventory case categories from the items table", () => {
    expect(isCaseInventoryCategory("pillow_case")).toBe(true);
    expect(isCaseInventoryCategory("bolster_case")).toBe(true);
    expect(isCaseInventoryCategory("case")).toBe(true);
    expect(isCaseInventoryCategory("cover")).toBe(false);
  });

  it("matches preference roles against inventory categories", () => {
    expect(itemMatchesPreferenceRole("cover", "cover")).toBe(true);
    expect(itemMatchesPreferenceRole("pillow_case", "case")).toBe(true);
    expect(itemMatchesPreferenceRole("case", "case")).toBe(true);
    expect(itemMatchesPreferenceRole("pillow_protector", "case")).toBe(false);
    expect(itemMatchesPreferenceRole("pillow_case", "cover")).toBe(false);
  });

  it("recognizes protector inventory categories", () => {
    expect(isProtectorInventoryCategory("pillow_protector")).toBe(true);
    expect(isProtectorInventoryCategory("bolster_protector")).toBe(true);
    expect(isProtectorInventoryCategory("protector")).toBe(true);
    expect(isProtectorInventoryCategory("pillow_case")).toBe(false);
  });
});

