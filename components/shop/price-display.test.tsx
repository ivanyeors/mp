import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";

/**
 * Prices the storefront writes inside a sentence (the free-shipping line on the
 * product page and in the cart, a coupon's discount) once went through
 * `formatPrice`, which never converts, so they stayed in SGD after the shopper
 * picked another currency while every other price on the page changed.
 */

const display = vi.hoisted(() => ({ currency: "USD" as string }));
vi.mock("@/lib/shop/currency-context", () => ({
  useCurrency: () => ({
    currency: display.currency,
    convertFromBase: (amount: number) => (display.currency === "SGD" ? amount : Math.round(amount * 74) / 100),
  }),
}));

const { PriceDisplay, useDisplayPrice } = await import("./price-display");
/** Server HTML without the `<!-- -->` React puts between adjacent text nodes. */
const html = (node: React.ReactElement) => renderToString(node).replaceAll("<!-- -->", "");
const { CartSummary } = await import("./cart/cart-summary");

function Sentence({ amount }: { amount: number }) {
  const displayPrice = useDisplayPrice();
  return <p>{displayPrice(amount, "SGD")}</p>;
}

const summary = () =>
  html(
    <CartSummary
      subtotal={120}
      couponDiscount={10}
      couponCode="SAVE10"
      currency="SGD"
      messages={{ subtotal: "Subtotal", discount: "Discount" } as never}
    />,
  );

describe("prices in a sentence follow the selected currency", () => {
  it("converts like PriceDisplay when the shopper picked another currency", () => {
    display.currency = "USD";
    expect(html(<Sentence amount={150} />)).toContain("~$111.00");
    expect(html(<PriceDisplay price={150} />)).toContain("~$111.00");
  });

  it("formats the amount as given in the base currency", () => {
    display.currency = "SGD";
    expect(html(<Sentence amount={150} />)).toContain("$150.00");
    expect(html(<Sentence amount={150} />)).not.toContain("~");
  });

  it("converts the cart's coupon discount with its subtotal", () => {
    display.currency = "USD";
    const out = summary();
    expect(out).toContain("~$88.80");
    expect(out).toContain("-~$7.40");
  });

  it("leaves no shopper-facing storefront price on the non-converting formatPrice", () => {
    for (const rel of [
      "components/shop/delivery-estimator.tsx",
      "components/shop/cart/cart-shipping-bar.tsx",
      "components/shop/cart/cart-summary.tsx",
      "components/shop/cart/cart-coupon-field.tsx",
    ]) {
      const src = readFileSync(join(process.cwd(), rel), "utf8");
      expect(src, rel).not.toMatch(/\bformatPrice\(/);
    }
  });
});
