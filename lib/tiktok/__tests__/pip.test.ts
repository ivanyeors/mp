import { describe, expect, it } from "vitest";

import { pipFollowsTo } from "@/lib/tiktok/pip";

describe("pipFollowsTo", () => {
  it("follows the visitor around the public site, the shop and the configurators", () => {
    for (const path of ["/", "/shop", "/shop/m-pillow", "/shop/cart", "/mp-config", "/mbolster-config", "/appointments", "/blog/x"]) {
      expect(pipFollowsTo(path)).toBe(true);
    }
  });

  it("closes on the Admin Panel, account, sign-in and payment pages", () => {
    for (const path of ["/settings", "/settings/page-builder", "/account", "/account/orders", "/auth/confirm", "/pay/abc", "/shop/checkout", "/shop/checkout/confirmation"]) {
      expect(pipFollowsTo(path)).toBe(false);
    }
  });

  it("matches whole path segments", () => {
    expect(pipFollowsTo("/settingsx")).toBe(true);
    expect(pipFollowsTo("/payment-options")).toBe(true);
  });
});
