// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CartItemClient } from "@/lib/types/ecommerce";
import { CartProvider, useCart } from "../cart-context";

import { settle } from "@/components/block-editor/__tests__/dom";

const item: CartItemClient = {
  variantId: "v-basic",
  productId: "p-basic",
  productSlug: "mpillow-basic",
  productTitle: "Mpillow Basic",
  variantTitle: null,
  imageUrl: null,
  price: 150,
  compareAtPrice: null,
  currency: "SGD",
  quantity: 1,
};

type Held = { code: string; subtotal: number; answer: (status: number, body: unknown) => Promise<void> };
let held: Held[] = [];
beforeEach(() => {
  held = [];
  localStorage.setItem("mp_cart", JSON.stringify({ items: [item], couponCode: "SPEND200" }));
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      if (url !== "/api/checkout/code") return new Promise(() => {});
      const body = JSON.parse(String(init?.body)) as { code: string; context: { subtotal: number } };
      return new Promise((resolve) => {
        held.push({
          code: body.code,
          subtotal: body.context.subtotal,
          answer: (status, json) =>
            act(async () => {
              resolve({ ok: status < 400, status, json: async () => json });
            }),
        });
      });
    }),
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

function Probe() {
  const cart = useCart();
  const line = cart.items[0];
  return (
    <div>
      <output id="code">{cart.couponCode ?? "none"}</output>
      <output id="discount">{cart.couponDiscount}</output>
      <output id="error">{cart.couponError ?? "none"}</output>
      <button type="button" onClick={() => cart.updateQuantity(line.variantId, line.quantity + 1)}>
        more
      </button>
      <button type="button" id="apply-welcome" onClick={() => void cart.applyCoupon("WELCOME")}>
        apply
      </button>
      <button type="button" id="remove-code" onClick={() => void cart.applyCoupon(null)}>
        remove
      </button>
    </div>
  );
}

const mount = async () => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<CartProvider><Probe /></CartProvider>));
  await settle();
};
const text = (id: string) => host.querySelector(`#${id}`)?.textContent;
const addOne = () => act(async () => host.querySelector("button")!.click());
const press = (id: string) => act(async () => host.querySelector<HTMLButtonElement>(`#${id}`)!.click());
const tooSmall = { kind: "invalid", reason: "Spend S$200 to use this code" };
const valid = { kind: "discount", code: "SPEND200", discount_amount: 30, free_shipping: false };
const welcome = { kind: "discount", code: "WELCOME", discount_amount: 10, free_shipping: false };

describe("Cart: the stored code is checked again when the items change", () => {
  it("keeps the code when the check for the smaller cart answers after the check for the larger one", async () => {
    await mount();
    await addOne();
    expect(held.map((h) => h.subtotal)).toEqual([150, 300]);

    await held[1].answer(200, valid);
    await held[0].answer(200, tooSmall);

    expect(text("code")).toBe("SPEND200");
    expect(text("discount")).toBe("30");
  });

  it("drops the code when the latest cart no longer qualifies", async () => {
    await mount();
    await held[0].answer(200, tooSmall);

    expect(text("code")).toBe("none");
    expect(text("discount")).toBe("0");
  });

  it("takes the discount for the latest cart when the answers come in order", async () => {
    await mount();
    await addOne();
    await held[0].answer(200, tooSmall);
    await held[1].answer(200, valid);

    expect(text("discount")).toBe("30");
  });
});

describe("Cart: a code applied or removed while the stored code is being checked", () => {
  it("keeps the newly applied code when the stored code's check answers invalid afterwards", async () => {
    await mount();
    await press("apply-welcome");
    expect(held.map((h) => h.code)).toEqual(["SPEND200", "WELCOME"]);

    await held[1].answer(200, welcome);
    await held[0].answer(200, tooSmall);

    expect(text("code")).toBe("WELCOME");
    expect(text("discount")).toBe("10");
    expect(text("error")).toBe("none");
  });

  it("keeps the newly applied code's discount when the stored code's check answers valid afterwards", async () => {
    await mount();
    await press("apply-welcome");

    await held[1].answer(200, welcome);
    await held[0].answer(200, valid);

    expect(text("code")).toBe("WELCOME");
    expect(text("discount")).toBe("10");
  });

  it("stays without a code when the shopper removed it before the check answered", async () => {
    await mount();
    await press("remove-code");

    await held[0].answer(200, valid);

    expect(text("code")).toBe("none");
    expect(text("discount")).toBe("0");
    expect(text("error")).toBe("none");
  });
});
