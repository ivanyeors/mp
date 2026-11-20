import { describe, expect, it } from "vitest";
import { methodDeliveryTime, shownDeliveryTime } from "../delivery-time";

const standard = {
  "en-US": { name: "Standard Shipping", estimated_days: "About 2 weeks" },
  "zh-CN": { name: "标准配送", estimated_days: "约2周" },
};

describe("A shipping method's delivery time", () => {
  it("is what Staff typed, in the shopper's language", () => {
    expect(methodDeliveryTime(standard, "en-US")).toBe("About 2 weeks");
    expect(methodDeliveryTime(standard, "zh-CN")).toBe("约2周");
  });

  it("falls back to English when the shopper's language has none", () => {
    expect(methodDeliveryTime({ "en-US": standard["en-US"], "zh-CN": { name: "标准配送" } }, "zh-CN")).toBe(
      "About 2 weeks",
    );
    expect(methodDeliveryTime({ en: { name: "Standard", estimated_days: "5-7 days" } }, "en-US")).toBe("5-7 days");
  });

  it("is null when no language has one, or it is blank", () => {
    expect(methodDeliveryTime({ "en-US": { name: "Express", estimated_days: "  " } }, "en-US")).toBeNull();
    expect(methodDeliveryTime(null, "en-US")).toBeNull();
  });

  it("wins over the courier's window, which shows only when Staff set none", () => {
    expect(shownDeliveryTime(standard, "en-US", "2–4 business days")).toBe("About 2 weeks");
    expect(shownDeliveryTime({ "en-US": { name: "Express" } }, "en-US", "1–2 business days")).toBe(
      "1–2 business days",
    );
    expect(shownDeliveryTime({ "en-US": { name: "Express" } }, "en-US", null)).toBeNull();
  });
});
