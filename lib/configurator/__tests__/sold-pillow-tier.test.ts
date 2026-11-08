import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { soldPillowTier } from "@/lib/configurator/staff-assist";

describe("soldPillowTier", () => {
  it("sells the tier Staff chose, whichever page they are on", () => {
    expect(soldPillowTier({ staffTier: "basic", premiumFlow: true })).toBe("basic");
    expect(soldPillowTier({ staffTier: "premium", premiumFlow: false })).toBe("premium");
    expect(soldPillowTier({ staffTier: "premium", premiumFlow: true })).toBe("premium");
    expect(soldPillowTier({ staffTier: "basic", premiumFlow: false })).toBe("basic");
  });

  it("sells the page's tier without a Staff session", () => {
    expect(soldPillowTier({ staffTier: null, premiumFlow: true })).toBe("premium");
    expect(soldPillowTier({ staffTier: null, premiumFlow: false })).toBe("basic");
    expect(soldPillowTier({ staffTier: undefined, premiumFlow: true })).toBe("premium");
  });

  it("ignores a tier it does not know", () => {
    expect(soldPillowTier({ staffTier: "deluxe", premiumFlow: false })).toBe("basic");
    expect(soldPillowTier({ staffTier: "", premiumFlow: true })).toBe("premium");
  });
});

describe("the Mpillow page sells one tier", () => {
  const client = readFileSync("app/[lang]/mp-config/mp-config-client.tsx", "utf8");

  it("reads Staff's Tier control only in Staff assist mode", () => {
    expect(client).toMatch(
      /const soldTier = soldPillowTier\(\{\s*staffTier: staffAssist \? shopRecommendation\?\.pillow_product\?\.kind : null,\s*premiumFlow: soldAsPremium,/,
    );
  });

  it("holds, charges the Measurement service and checks the code on that tier", () => {
    const hold = client.slice(client.indexOf("const handleAuthorizeHold = useCallback"));
    expect(hold).toMatch(/^[\s\S]{0,800}const tier = soldTier;/);
    expect(client).toMatch(/suggested_tier: soldTier,/);
    expect(client).toMatch(/build: \{ product_type: "pillow", size: String\(size\), tier: soldTier \}/);
    // The page's tier alone is only for an Assisted submit, which has no Staff.
    expect(client.match(/const tier = soldAsPremium/g)?.length ?? 0).toBe(1);
  });
});
