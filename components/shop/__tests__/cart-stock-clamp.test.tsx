// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CartItemClient } from "@/lib/types/ecommerce";
import { getMessages } from "@/lib/i18n/messages";
import { buildCartMessages } from "@/lib/shop/cart-messages";

import { settle } from "@/components/block-editor/__tests__/dom";

vi.mock("next/navigation", () => ({
  usePathname: () => "/en-US/shop/cart",
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {} }),
}));
vi.mock("@/lib/shop/currency-context", () => ({
  useCurrency: () => ({ currency: "SGD", convertFromBase: (n: number) => n }),
}));

const { CartProvider, useCart } = await import("@/lib/shop/cart-context");
const { CartContent } = await import("../cart/cart-content");
const { CartPageClient } = await import("../cart-page-client");

const dictionary = getMessages("en-US").shop.cart;
const messages = buildCartMessages(dictionary);

const line = (variantId: string, quantity: number, customizationId?: string): CartItemClient => ({
  variantId,
  productId: `p-${variantId}`,
  productSlug: variantId,
  productTitle: variantId,
  variantTitle: null,
  imageUrl: null,
  price: 100,
  compareAtPrice: null,
  currency: "SGD",
  quantity,
  ...(customizationId ? { customizationId } : {}),
});

let stockAnswers: ((stock: Record<string, number>) => Promise<void>)[] = [];
beforeEach(() => {
  stockAnswers = [];
  localStorage.setItem(
    "mp_cart",
    JSON.stringify({
      items: [line("v-basic", 5), line("v-basic", 4, "cust-1"), line("v-bolster", 2), line("v-premium", 1)],
      couponCode: null,
    }),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (url: string) =>
        new Promise((resolve) => {
          if (!String(url).startsWith("/api/shop/stock")) return;
          stockAnswers.push((stock) =>
            act(async () => {
              resolve({ ok: true, status: 200, json: async () => ({ stock }) });
            }),
          );
        }),
    ),
  );
});

let root: Root | null = null;
let host: HTMLElement;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  localStorage.clear();
  vi.unstubAllGlobals();
});

function Quantities() {
  const cart = useCart();
  return (
    <>
      <output id="quantities">{cart.items.map((i) => `${i.variantId}${i.customizationId ? "+" : ""}:${i.quantity}`).join(" ")}</output>
      <button type="button" id="lower-basic" onClick={() => cart.updateQuantity("v-basic", 2)} />
    </>
  );
}

function Popover() {
  const cart = useCart();
  return (
    <CartContent
      variant="popover"
      messages={messages}
      locale="en-US"
      subtotal={cart.subtotal}
      couponDiscount={0}
      couponFreeShipping={false}
      items={cart.items}
      couponCode={null}
      couponKind={null}
      couponPartnerName={null}
      couponError={null}
      couponValidating={false}
      applyCoupon={async () => {}}
      updateQuantity={cart.updateQuantity}
      removeItem={cart.removeItem}
      shopHref="/en-US/shop"
      checkoutHref="/en-US/shop/checkout"
    />
  );
}

const surfaces = {
  "the cart popover": () => <Popover />,
  "the cart page": () => <CartPageClient dictionary={dictionary} locale="en-US" />,
};

const mount = async (cart: React.ReactNode) => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<CartProvider>{cart}<Quantities /></CartProvider>));
  await settle();
};
const quantities = () => host.querySelector("#quantities")?.textContent;

describe.each(Object.entries(surfaces))("Live stock in %s", (_, surface) => {
  it("caps a standard line at the stock that arrives and leaves customised and sold-out lines alone", async () => {
    await mount(surface());
    expect(stockAnswers).toHaveLength(1);

    await stockAnswers[0]({ "v-basic": 3, "v-bolster": 9, "v-premium": 0 });

    expect(quantities()).toBe("v-basic:3 v-basic+:4 v-bolster:2 v-premium:1");
  });

  it("keeps a quantity the shopper lowered below the stock while it was loading", async () => {
    await mount(surface());
    await act(async () => host.querySelector<HTMLButtonElement>("#lower-basic")!.click());

    await stockAnswers[stockAnswers.length - 1]({ "v-basic": 3, "v-bolster": 9, "v-premium": 0 });

    expect(quantities()).toBe("v-basic:2 v-basic+:4 v-bolster:2 v-premium:1");
  });
});
