import { describe, expect, it } from "vitest";
import { AddonLineSchema, MAX_ADDON_QUANTITY, PreferenceLineSchema } from "@/lib/results/finish-schemas";

describe("Add-on and preference quantities", () => {
  it("are whole numbers within a sane cap, so 0.01 of an Add-on cannot cost 1% of it", () => {
    expect(AddonLineSchema.safeParse({ item_id: 1, quantity: 0.01 }).success).toBe(false);
    expect(AddonLineSchema.safeParse({ item_id: 1, quantity: 0 }).success).toBe(false);
    expect(AddonLineSchema.safeParse({ item_id: 1, quantity: 1e9 }).success).toBe(false);
    expect(AddonLineSchema.safeParse({ item_id: 1, quantity: MAX_ADDON_QUANTITY }).success).toBe(true);
    expect(AddonLineSchema.parse({ item_id: 1 }).quantity).toBe(1);
  });

  it("allow one cover and one case per build", () => {
    expect(PreferenceLineSchema.safeParse({ item_id: 1, quantity: 1, category: "cover" }).success).toBe(true);
    expect(PreferenceLineSchema.safeParse({ item_id: 1, quantity: 0.5, category: "case" }).success).toBe(false);
    expect(PreferenceLineSchema.safeParse({ item_id: 1, quantity: 2, category: "case" }).success).toBe(false);
  });
});
