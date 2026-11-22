// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CartItemClient, CustomerAddress, ShippingMethod } from "@/lib/types/ecommerce";

import { settle, typeField } from "@/components/block-editor/__tests__/dom";

vi.mock("next/navigation", () => ({
  useParams: () => ({ lang: "en-US" }),
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  usePathname: () => "/en-US/shop/checkout",
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/lib/shop/currency-context", () => ({
  useCurrency: () => ({ currency: "SGD", isConverted: false, convertFromBase: (n: number) => n }),
}));

const { CartProvider } = await import("@/lib/shop/cart-context");
const { default: CheckoutPage } = await import("../page");

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

const savedMalaysia: CustomerAddress = {
  id: "addr-kl",
  customer_id: "c1",
  label: "Home",
  recipient: "Saved Recipient",
  line1: "1 Jalan Saved",
  line2: null,
  city: "Kuala Lumpur",
  state: null,
  postal_code: "50000",
  country: "MY",
  phone: "+60 12 345 6789",
  is_default: true,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
};

const method = (id: string, name: string, country: string): ShippingMethod => ({
  id,
  slug: id,
  content: { "en-US": { name } },
  base_rate: 8,
  free_above: null,
  currency: "SGD",
  countries: [country],
  is_active: true,
  position: 0,
  rate_source: "flat",
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
});

type Held = { url: string; answer: (body: unknown) => Promise<void> };
let held: Held[] = [];
beforeEach(() => {
  held = [];
  localStorage.setItem("mp_cart", JSON.stringify({ items: [item], couponCode: null }));
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (String(url).startsWith("/api/shop/shipping/countries")) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ countries: ["SG", "MY"] }) });
      }
      return new Promise((resolve) => {
        held.push({
          url: String(url),
          answer: (body) =>
            act(async () => {
              resolve({ ok: true, status: 200, json: async () => body });
            }),
        });
      });
    }),
  );
});

let root: Root | null = null;
let host: HTMLElement;
const mount = async () => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<CartProvider><CheckoutPage /></CartProvider>));
  await settle();
};
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  localStorage.clear();
  vi.unstubAllGlobals();
});

const field = (id: string) => host.querySelector<HTMLInputElement>(`#${id}`)!;
const answerAll = async (part: string, body: unknown) => {
  for (const h of held.filter((h) => h.url.includes(part))) await h.answer(body);
};
const signedInWith = (addresses: CustomerAddress[]) => ({ signedIn: true, addresses, email: "mei@example.com" });
const shippingNames = () => [...host.querySelectorAll('input[name="shipping_method"]')].map((r) => r.closest("label")?.querySelector("p")?.textContent);

describe("Checkout: the saved default address", () => {
  it("fills the form when the shopper has not typed an address", async () => {
    await mount();
    await answerAll("/api/account/addresses", signedInWith([savedMalaysia]));

    expect(field("recipient").value).toBe("Saved Recipient");
    expect(field("line1").value).toBe("1 Jalan Saved");
    expect(field("postal_code").value).toBe("50000");
    expect(field("phone").value).toBe("+60 12 345 6789");
    expect(host.querySelector("#country")?.textContent).toContain("Malaysia");
  });

  it("keeps the phone the shopper typed, and applies no saved address, while the saved addresses were loading", async () => {
    await mount();
    typeField(field("phone"), "+65 9123 4567");

    await answerAll("/api/account/addresses", signedInWith([savedMalaysia]));

    expect(field("phone").value).toBe("+65 9123 4567");
    expect(field("recipient").value).toBe("");
    expect(field("line1").value).toBe("");
    expect(field("postal_code").value).toBe("");
  });

  it("keeps the address the shopper typed while the saved addresses were loading", async () => {
    await mount();
    typeField(field("recipient"), "Typed Recipient");
    typeField(field("line1"), "9 Typed Road");
    typeField(field("postal_code"), "654321");

    await answerAll("/api/account/addresses", signedInWith([savedMalaysia]));

    expect(field("recipient").value).toBe("Typed Recipient");
    expect(field("line1").value).toBe("9 Typed Road");
    expect(field("postal_code").value).toBe("654321");
    expect(host.querySelector("#country")?.textContent).toContain("Singapore");
    expect(host.textContent).toContain("Save this address to my account");
    expect(field("email").value).toBe("mei@example.com");
  });
});

describe("Checkout: flat shipping methods answered out of order", () => {
  it("lists Malaysia's methods when Singapore's slower answer lands last", async () => {
    await mount();
    await answerAll("/api/account/addresses", signedInWith([savedMalaysia]));

    const sg = held.find((h) => h.url === "/api/shop/shipping?country=SG")!;
    const my = held.find((h) => h.url === "/api/shop/shipping?country=MY")!;
    expect(sg).toBeTruthy();
    expect(my).toBeTruthy();

    await my.answer({ rows: [method("my-std", "Malaysia Standard", "MY")] });
    await sg.answer({ rows: [method("sg-std", "Singapore Standard", "SG")] });

    expect(shippingNames()).toEqual(["Malaysia Standard"]);
  });
});
