// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CartMessages } from "../cart-types";

import { typeField } from "@/components/block-editor/__tests__/dom";

vi.mock("@/lib/shop/currency-context", () => ({
  useCurrency: () => ({ currency: "SGD", convertFromBase: (n: number) => n }),
}));

const { CartCouponField } = await import("../cart-coupon-field");

const messages = {
  coupon: "Discount code",
  applyCoupon: "Apply",
  couponApplied: (code: string) => `${code} applied`,
  referralApplied: (code: string) => `${code} referral`,
  freeShippingQualified: "Free shipping",
} as CartMessages;

let root: Root | null = null;
let host: HTMLElement;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
});

const field = (couponCode: string | null, couponValidating = false) => (
  <CartCouponField
    couponCode={couponCode}
    couponKind={couponCode ? "discount" : null}
    couponPartnerName={null}
    couponDiscount={0}
    couponFreeShipping={false}
    couponError={null}
    couponValidating={couponValidating}
    applyCoupon={async () => {}}
    currency="SGD"
    messages={messages}
  />
);
const render = (node: React.ReactNode) => act(() => root!.render(node));
const input = () => host.querySelector("input")!;

describe("Cart coupon field", () => {
  it("starts with the applied code and follows it when another code is applied", async () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await render(field("SAVE10"));
    expect(input().value).toBe("SAVE10");

    typeField(input(), "half typed");
    await render(field("WELCOME"));
    expect(input().value).toBe("WELCOME");

    await render(field(null));
    expect(input().value).toBe("");
  });

  it("keeps what the shopper typed while the applied code stays the same", async () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await render(field("SAVE10"));

    typeField(input(), "SAVE2");
    await render(field("SAVE10", true));
    await render(field("SAVE10", false));
    expect(input().value).toBe("SAVE2");
  });
});
