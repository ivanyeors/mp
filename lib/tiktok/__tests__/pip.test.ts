import { describe, expect, it } from "vitest";

import { nearestPipCorner, otherSidePipCorner, pipFollowsTo } from "@/lib/tiktok/pip";

describe("nearestPipCorner", () => {
  const viewport = { width: 400, height: 800 };

  it("docks to the quarter of the screen the player was let go in", () => {
    expect(nearestPipCorner({ x: 50, y: 50 }, viewport)).toBe("top-left");
    expect(nearestPipCorner({ x: 350, y: 50 }, viewport)).toBe("top-right");
    expect(nearestPipCorner({ x: 50, y: 750 }, viewport)).toBe("bottom-left");
    expect(nearestPipCorner({ x: 350, y: 750 }, viewport)).toBe("bottom-right");
  });

  it("handles a player dragged partly off screen", () => {
    expect(nearestPipCorner({ x: -40, y: 900 }, viewport)).toBe("bottom-left");
    expect(nearestPipCorner({ x: 520, y: -10 }, viewport)).toBe("top-right");
  });
});

describe("otherSidePipCorner", () => {
  it("swaps sides and keeps the edge", () => {
    expect(otherSidePipCorner("bottom-right")).toBe("bottom-left");
    expect(otherSidePipCorner("bottom-left")).toBe("bottom-right");
    expect(otherSidePipCorner("top-left")).toBe("top-right");
    expect(otherSidePipCorner("top-right")).toBe("top-left");
  });
});

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
